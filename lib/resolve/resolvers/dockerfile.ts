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
import type { Bundle } from '../resolver';

import type { FileInfo, Resolver } from '../resolver';
import type { ParsedPathPlus } from '../utils';

export class DockerfileResolver implements Resolver {
	public priority = 0;
	public name = 'Standard Dockerfile';
	public dockerfileContents: string;

	private gotDockerfile: boolean = false;

	public entry(file: FileInfo): void {
		this.gotDockerfile = true;
		this.dockerfileContents = file.contents.toString();
	}

	public needsEntry(
		entryPath: ParsedPathPlus,
		specifiedDockerfilePath?: string,
	): boolean {
		// Note that both `entryPath` and `specifiedDockerfilePath` are normalized through
		// `TarUtils.normalizeTarEntry()` before the call this method, so they won't have
		// leading or trailing slashes or redundant path components.
		// Consider two cases:
		// * If a `specifiedDockeriflePath` was specified, say `'service/MyDockerfile'`, then this
		//   method will only match a tar entry whose full path is identical to that
		//   (`entryPath.unparsed === specifiedDockerfilePath`).
		// * Otherwise, it will match `Dockerfile` at the root of the project directory tree, as
		//   `entryPath.unparsed` is the full tar entry path which must be exactly `'Dockerfile'`.

		return entryPath.unparsed === (specifiedDockerfilePath || 'Dockerfile');
	}

	public isSatisfied(): boolean {
		return this.gotDockerfile;
	}

	public resolve(_bundle: Bundle, specifiedDockerfilePath?: string) {
		return Promise.resolve({
			name: specifiedDockerfilePath || 'Dockerfile',
			contents: Buffer.from(this.dockerfileContents),
			size: this.dockerfileContents.length,
		});
	}

	public getDockerfileContents(): string {
		return this.dockerfileContents;
	}

	public getCanonicalName(filename: string): string {
		return filename;
	}
}

export default DockerfileResolver;
