/**
 * @license
 * Copyright 2019 Balena Ltd.
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
import * as Bluebird from 'bluebird';

import * as _ from 'lodash';
import * as request from 'request';
import * as semver from 'semver';

const getAsync = Bluebird.promisify(request.get);

import * as BluebirdLRU from 'bluebird-lru-cache';

import { Bundle, FileInfo, Resolver } from '../resolver';
import { ParsedPathPlus } from '../utils';

const versionTest = RegExp.prototype.test.bind(/^[0-9]+\.[0-9]+\.[0-9]+$/);
const versionCache: {
	get: (deviceType: string) => Promise<string[]>;
} = new BluebirdLRU({
	maxAge: 3600 * 1000, // 1 hour
	fetchFn: (deviceType: string) => {
		const get = (prev: string[], url: string): Promise<string[]> => {
			return Promise.resolve(
				getAsync({
					url,
					json: true,
				})
					.get('body')
					.then((res: { results: Array<{ name: string }>; next?: string }) => {
						// explicit casting here, as typescript interprets the following statement as {}[]
						const curr: string[] = _(res.results)
							.map('name')
							.filter(versionTest)
							.value() as string[];
						const tags = prev.concat(curr);

						if (res.next != null) {
							return get(tags, res.next);
						} else {
							return tags;
						}
					}),
			);
		};

		// 100 is the max page size
		return get(
			[],
			`https://hub.docker.com/v2/repositories/resin/${deviceType}-node/tags/?page_size=100`,
		);
	},
});

export class NodeResolver implements Resolver {
	public priority = 0;
	public name = 'NodeJS';
	public dockerfileContents: string;

	private packageJsonContent?: Buffer;
	private hasScripts = false;

	public entry(file: FileInfo): void {
		if (file.name === 'package.json') {
			this.packageJsonContent = file.contents;
		} else if (file.name === 'wscript' || file.name.endsWith('.gyp')) {
			this.hasScripts = true;
		}
	}

	public needsEntry(
		entryPath: ParsedPathPlus,
		specifiedDockerfilePath?: string,
	): boolean {
		// Note:
		// - Both `entryPath` and `specifiedDockerfilePath` are normalized through
		//   `TarUtils.normalizeTarEntry()` before the call this method, so they won't have leading
		//   or trailing slashes or redundant path components.
		// - Tar files always use forward slash as path separators (regardless of platform/OS
		//   conventions), so the search for '/' instead of `path.sep` below is not a bug :-)
		// Consider two cases:
		// * If a `specifiedDockeriflePath` was specified, then this method returns false.
		// * Otherwise, it will match `package.json`, `wscript` or `*.gyp` at the root of the
		//   project directory tree, as `entryPath.unparsed` is the full path.
		const unparsed = entryPath.unparsed;
		return (
			!specifiedDockerfilePath &&
			(unparsed === 'package.json' ||
				unparsed === 'wscript' ||
				(!unparsed.includes('/') && entryPath.ext === '.gyp'))
		);
	}

	public isSatisfied(_bundle: Bundle): boolean {
		return this.packageJsonContent != null;
	}

	public async resolve(
		bundle: Bundle,
		_specifiedDockerfilePath?: string,
	): Promise<FileInfo> {
		// Generate a dockerfile which will run the file
		// Use latest node base image. Don't use the slim image just in case
		// TODO: Find out which apt-get packages are installed mostly with node
		// base images.
		let packageJson;
		try {
			packageJson = JSON.parse(this.packageJsonContent!.toString());
		} catch (e) {
			throw new Error(`package.json: ${e.message}`);
		}

		if (typeof packageJson !== 'object') {
			throw new Error('package.json: must be a JSON object');
		}

		this.hasScripts =
			this.hasScripts ||
			_(packageJson.scripts)
				.pick('preinstall', 'install', 'postinstall')
				.size() > 0;

		const nodeEngine: string | unknown = _.get(packageJson, 'engines.node');
		if (nodeEngine == null) {
			throw new Error('package.json: engines.node must be specified');
		}
		if (typeof nodeEngine !== 'string') {
			throw new Error('package.json: engines.node must be a string if present');
		}
		const range: string = nodeEngine;

		const versions = await versionCache.get(bundle.deviceType);
		const nodeVersion = semver.maxSatisfying(versions, range);

		if (nodeVersion == null) {
			throw new Error(`Couldn't satisfy node version ${range}`);
		}

		let dockerfile: string;
		if (this.hasScripts) {
			dockerfile = `
						FROM resin/${bundle.deviceType}-node:${nodeVersion}
						RUN mkdir -p /usr/src/app && ln -s /usr/src/app /app
						WORKDIR /usr/src/app
						COPY . /usr/src/app
						RUN DEBIAN_FRONTEND=noninteractive JOBS=MAX npm install --unsafe-perm
						CMD [ "npm", "start" ]
						`;
		} else {
			dockerfile = `
						FROM resin/${bundle.deviceType}-node:${nodeVersion}-onbuild
						RUN ln -s /usr/src/app /app
					`;
		}
		this.dockerfileContents = dockerfile;
		return {
			name: 'Dockerfile',
			size: dockerfile.length,
			contents: Buffer.from(dockerfile),
		};
	}

	public getCanonicalName(_specifiedPath: string): string {
		throw new Error('getCanonicalName called on unsupported resolver NodeJS');
	}
}

export default NodeResolver;
