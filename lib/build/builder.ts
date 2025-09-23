/**
 * @license
 * Copyright 2018 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as Dockerode from 'dockerode';
import * as duplexify from 'duplexify';
import * as es from 'event-stream';
import * as JSONStream from 'JSONStream';
import * as _ from 'lodash';
import * as fs from 'mz/fs';
import * as path from 'path';
import * as stream from 'node:stream';
import * as tar from 'tar-stream';

// Import hook definitions
import type * as Plugin from './plugin';
import * as Utils from './utils';

export type ErrorHandler = (error: Error) => void;
const emptyHandler: ErrorHandler = () => undefined;

/**
 * This class is responsible for interfacing with the docker daemon to
 * start and monitor a build. Most use cases will require a call to
 * registerHooks(...) and a call to createBuildStream(...). Everything
 * else can be done with the hook architecture.
 *
 */
export default class Builder {
	private docker: Dockerode;

	private constructor(docker: Dockerode) {
		this.docker = docker;
	}

	public static fromDockerode(docker: Dockerode) {
		return new Builder(docker);
	}

	public static fromDockerOpts(dockerOpts: Dockerode.DockerOptions) {
		return new Builder(new Dockerode(dockerOpts));
	}

	/**
	 * Start a build with the docker daemon, and return the stream to the caller.
	 * The stream can be written to, and the docker daemon will interpret that
	 * as a tar archive to build. The stream can also be read from, and the data
	 * returned will be the output of the docker daemon build.
	 *
	 * @returns A bi-directional stream connected to the docker daemon
	 */
	public createBuildStream(
		buildOpts: { [key: string]: any },
		hooks: Plugin.BuildHooks = {},
		handler: ErrorHandler = emptyHandler,
	): NodeJS.ReadWriteStream {
		const layers: string[] = [];
		const fromTags: Utils.FromTagInfo[] = [];

		// Create a stream to be passed into the docker daemon
		const inputStream = es.through<stream.Duplex>();

		// Create a bi-directional stream
		const dup = duplexify();

		// Connect the input stream to the rw stream
		dup.setWritable(inputStream);

		let streamError: Error | undefined;
		const failBuild = _.once((err: Error) => {
			streamError = err;
			dup.destroy(err);
			return this.callHook(
				hooks,
				'buildFailure',
				handler,
				err,
				layers,
				fromTags,
			);
		});

		inputStream.on('error', failBuild);
		dup.on('error', failBuild);

		// If buildOpts includes any volumes, JSON serialize them before passing
		// them to the engine
		if (buildOpts.volumes != null && Array.isArray(buildOpts.volumes)) {
			buildOpts.volumes = JSON.stringify(buildOpts.volumes);
		}

		const buildPromise = (async () => {
			const daemonStream = await this.docker.buildImage(inputStream, buildOpts);

			await new Promise<void>((resolve, reject) => {
				const outputStream = getDockerDaemonBuildOutputParserStream(
					daemonStream,
					layers,
					fromTags,
					reject,
				);
				outputStream.on('error', (error: Error) => {
					daemonStream.unpipe();
					reject(error);
				});
				outputStream.on('end', () =>
					// The 'end' event was observed to be emitted under error
					// conditions, hence the test for streamError.
					{
						if (streamError) {
							reject(streamError);
						} else {
							resolve();
						}
					},
				);
				// Connect the output of the docker daemon to the duplex stream
				dup.setReadable(outputStream);
			});
		})(); // no .catch() here, but rejection is captured by Promise.all() below

		// It is helpful for the following promises to run in parallel because
		// buildPromise may reject sooner than the buildStream hook completes
		// (in which case the stream is unpipe'd and destroy'ed), and yet the
		// buildStream hook must be called in order for buildPromise to ever
		// resolve (as the hook call consumes the `dup` stream).
		Promise.all([
			buildPromise,
			// Call the buildStream handler with the docker daemon stream
			this.callHook(hooks, 'buildStream', handler, dup),
		])
			.then(() => {
				if (!streamError) {
					// Build successful: call buildSuccess handler
					return this.callHook(
						hooks,
						'buildSuccess',
						handler,
						_.last(layers),
						layers,
						fromTags,
					);
				}
			})
			.catch(failBuild);

		return dup;
	}

	/**
	 * Given a path, this function will create a tar stream containing all of the files,
	 * and stream it to the docker daemon. It will then return a stream connected to
	 * the output of the docker daemon.
	 *
	 * @param dirPath Directory path to send to the docker daemon
	 * @param buildOpts Build options to pass to the docker daemon
	 *
	 * @returns Promise of a stream connected to the docker daemon
	 */
	public async buildDir(
		dirPath: string,
		buildOpts: { [key: string]: any },
		hooks: Plugin.BuildHooks,
		handler: ErrorHandler = emptyHandler,
	): Promise<NodeJS.ReadableStream> {
		const pack = tar.pack();

		const files = await Utils.directoryToFiles(dirPath);
		const fileInfos = await Promise.all(
			files.map(async (file: string) => {
				// Work out the relative path
				const relPath = path.relative(path.resolve(dirPath), file);
				const [stat, buf] = await Promise.all([
					fs.stat(file),
					fs.readFile(file),
				]);
				return [relPath, stat, buf] as const;
			}),
		);
		await Promise.all(
			fileInfos.map(async (fileInfo) => {
				await new Promise<void>((resolve, reject) =>
					pack.entry(
						{ name: fileInfo[0], size: fileInfo[1].size },
						fileInfo[2],
						(err) => {
							if (err) {
								reject(err);
							} else {
								resolve();
							}
						},
					),
				);
			}),
		);
		// Tell the tar stream we're done
		pack.finalize();
		// Create a build stream to send the data to
		const buildStream = this.createBuildStream(buildOpts, hooks, handler);
		// Write the tar archive to the stream and return it for reading
		return stream.pipeline(pack, buildStream, _.noop);
	}

	/**
	 * Internal function to call a hook, if it has been registered for the build.
	 *
	 * @param args The arguments to pass to the hook. The values will be
	 * unwrapped before being passed to the callback.
	 *
	 * @returns Promise that resolves to the return value of the hook function,
	 * or to undefined if the a hook function is not provided.
	 */
	private async callHook(
		hooks: Plugin.BuildHooks,
		hook: Plugin.ValidHook,
		handler: ErrorHandler,
		...args: any[]
	): Promise<any> {
		try {
			const fn = hooks[hook];
			if (typeof fn === 'function') {
				// Spread the arguments onto the callback function
				// eslint-disable-next-line prefer-spread -- TS complains fn's signature not supporting rest params
				return await fn.apply(null, args);
			}
		} catch (err) {
			if (typeof handler === 'function') {
				handler(err);
			}
			throw err;
		}
	}
}

/**
 * Return an event stream capable of parsing a docker daemon's JSON object output.
 * @param daemonStream: Docker daemon's output stream (dockerode.buildImage)
 * @param layers Array to which to push parsed image layer sha strings
 * @param fromImageTags Array to which to push parsed FROM image tags info
 * @param onError Error callback
 */
function getDockerDaemonBuildOutputParserStream(
	daemonStream: NodeJS.ReadableStream,
	layers: string[],
	fromImageTags: Utils.FromTagInfo[],
	onError: (error: Error) => void,
): stream.Duplex {
	const fromAliases = new Set();
	return stream.pipeline(
		daemonStream,
		// parse the docker daemon's output json objects
		JSONStream.parse(undefined),
		// Don't use fat-arrow syntax here, to capture 'this' from es
		es.through<stream.Duplex>(function (data: {
			stream: string;
			error: string;
		}) {
			if (data == null) {
				return;
			}
			try {
				if (data.error) {
					throw new Error(data.error);
				} else {
					// Store image layers, so that they can be
					// deleted by the caller if necessary
					const sha = Utils.extractLayer(data.stream);
					if (sha !== undefined) {
						layers.push(sha);
					}
					const fromTag = Utils.extractFromTag(data.stream);
					if (fromTag !== undefined) {
						if (!fromAliases.has(fromTag.repo)) {
							fromImageTags.push(fromTag);
						}
						if (fromTag.alias) {
							fromAliases.add(fromTag.alias);
						}
					}
					this.emit('data', data.stream);
				}
			} catch (error) {
				daemonStream.unpipe();
				onError(error);
			}
		}),
		_.noop,
	);
}
