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
import { assert } from 'chai';
import * as _ from 'lodash';
import { Readable, Stream, Writable } from 'stream';

import * as proxyquire from 'proxyquire';

import * as Utils from '../../lib/build/utils';
import {
	sampleDaemonOutputGenerator,
	sampleDaemonStreamGenerator,
} from './test-files/sample_daemon_output';

/**
 * Dockerode class mock (selected bits)
 */
class MockDockerode {
	public buildImagePromise: Promise<void>;
	public tarStreamMilliseconds: number;

	/**
	 * Mock of dockerode's buildImage() (of sorts - no network calls). This
	 * function is synchronous and returns quickly (before the streams are
	 * read/written), but it assigns a promise to this.buildImagePromise (public
	 * member variable) that can be waited by test code. When the reading of
	 * inputStream finishes (asynchronously), this.tarStreamMilliseconds is
	 * assigned to with how long it took.
	 * @param inputStream Mock tar stream - input to the docker daemon
	 * @returns A mock of the docker daemon's output stream (a JSON stream)
	 */
	public buildImage(inputStream: Readable): Promise<Writable> {
		const outputStream = new Stream.PassThrough();
		this.buildImagePromise = new Promise((resolve, reject) => {
			const startTime = Date.now();
			outputStream.on('error', reject);
			inputStream
				.on('error', reject)
				.on('end', () => {
					this.tarStreamMilliseconds = Date.now() - startTime;
					resolve(
						eventLoopWriteIterable(outputStream, sampleDaemonOutputGenerator()),
					);
				})
				.resume();
		});
		return Promise.resolve(outputStream);
	}
}

/**
 * This test asserts that the createBuildStream() method writes the expected
 * data to the stream it returns, and also prints how it long it took to write
 * the tar stream to a mocked docker daemon and how long it took to read and
 * parse the stream/status data from the mocked daemon.  (Note that there are
 * additional tests in tests.ts that cover other additional functionality such
 * as calling the success/failure hooks as expected.)
 *
 * The test is run only once so obviously does provide accurate time figures at
 * all, but importantly it allows developers to play with the implementation of
 * createBuildStream, and then run the test multiple times for the old and new
 * implementations to compare the performance impact.
 *
 * As is, it takes under 50ms to run in a devenv VirtualBox VM on my laptop.
 */
describe('createBuildStream', function () {
	this.timeout(5000);

	const mockUtils = {};
	Object.assign(mockUtils, Utils, {
		extractLayer: () => undefined,
	});
	const builderMod = proxyquire('../../lib/build/builder', {
		dockerode: MockDockerode,
		'./utils': mockUtils,
	});
	const MockBuilder = builderMod.default;

	it('should be fast', async () => {
		let startTime: number;
		const mockBuilder = MockBuilder.fromDockerOpts({});
		const buildStream = mockBuilder.createBuildStream({});
		const streamer = sampleDaemonStreamGenerator();
		const buildStreamPromise = new Promise<void>((resolve, reject) => {
			buildStream
				.on('error', reject)
				.on('end', () => {
					console.log(
						`createBuildStream performance test: write time (tar stream): ${mockBuilder.docker.tarStreamMilliseconds} milliseconds`,
					);
					console.log(
						`createBuildStream performance test: read time (JSON stream): ${
							Date.now() - startTime
						} milliseconds`,
					);
					resolve();
				})
				.on('data', (buf: any) => {
					if (!startTime) {
						startTime = Date.now();
					}
					const sampleDaemonStreamStep = streamer.next();
					if (sampleDaemonStreamStep.done) {
						reject(new Error('sample data ended before build stream'));
					}
					assert.deepEqual(buf.toString(), sampleDaemonStreamStep.value);
				});
		});

		// Create a mock tar stream and pipe it to the builder (buildStream)
		const tarStreamSizeMegaBytes = 1;
		const tarStreamPromise = mockTarStream(buildStream, tarStreamSizeMegaBytes);

		await Promise.all([
			tarStreamPromise,
			buildStreamPromise,
			mockBuilder.docker.buildImagePromise,
		]);
	});
});

/**
 * Write the data produced by the given iterator to the given stream,
 * "spreading" the writes over the node/JS event loop with setImmediate().
 * This gives stream consumers a chance to consume the data as it is written.
 * If shouldEndStream is true, stream.end() is called when the iteration ends.
 * Return a promise that fulfils when the iteration ends.
 * @param stream The stream to write to
 * @param iter Iterator that produces data (next().value) to be written
 * @param shouldEndStream If true, call stream.end() when iteration ends
 * @returns A promise that fulfils when the iteration ends or rejects on stream errors
 */
function eventLoopWriteIterable(
	stream: Writable,
	iter: Iterator<string | Buffer>,
	shouldEndStream: boolean = true,
): Promise<void> {
	return new Promise((resolve, reject) => {
		stream.on('error', reject);

		function recurseOverEventLoop() {
			setImmediate(() => {
				const it = iter.next();
				if (it.done) {
					if (shouldEndStream) {
						stream.end();
					}
					resolve();
				} else {
					stream.write(it.value);
					recurseOverEventLoop();
				}
			});
		}
		recurseOverEventLoop();
	});
}

/**
 * Create a mock tar stream and write it to the given builder stream in
 * 1KB writes, with each write spread over the Node/JS event loop.
 * @param writeStream The builder stream to write to
 * @returns A promise that fulfils when there is no more data to write
 */
async function mockTarStream(
	writeStream: Writable,
	sizeMegaBytes: number,
): Promise<void> {
	const mockTarKiloByteBuf = Buffer.allocUnsafe(1024);
	await eventLoopWriteIterable(
		writeStream,
		(function* () {
			for (let i = 0; i < sizeMegaBytes * 1024; ++i) {
				yield mockTarKiloByteBuf;
			}
		})(),
	);
}
