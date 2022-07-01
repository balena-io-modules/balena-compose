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
import { posix } from 'path';

import * as DockerfileTemplate from '../../dockerfile';

import { Bundle, FileInfo, Resolver } from '../resolver';
import { ParsedPathPlus, removeExtension } from '../utils';
import { DockerfileTemplateVariableError } from './dockerfileTemplate';

// Internal tuple to pass files and their extensions around
// the class
// ArchSpecificDockerfile = [extension, file info]
type ArchSpecificDockerfile = [string, FileInfo];

export class ArchDockerfileResolver implements Resolver {
	public priority = 3;
	public name = 'Architecture-specific Dockerfile';
	public dockerfileContents: string;

	private archDockerfiles: ArchSpecificDockerfile[] = [];

	public entry(file: FileInfo): void {
		// We know that this file is a Dockerfile, so just get the extension,
		// and save it for resolving later
		const ext = posix.extname(file.name).substr(1);
		this.archDockerfiles.push([ext, file]);
	}

	public needsEntry(
		entryPath: ParsedPathPlus,
		specifiedDockerfilePath?: string,
	): boolean {
		// Note that both `entryPath` and `specifiedDockerfilePath` are normalized through
		// `TarUtils.normalizeTarEntry()` before the call this method, so they won't have
		// leading or trailing slashes or redundant path components.
		// Consider two cases:
		// * If a `specifiedDockeriflePath` was specified, say `'service/MyDockerfile.armv7hf'`,
		//   then this method will only match a tar entry whose full path is identical to that
		//   (`entryPath.unparsed === specifiedDockerfilePath`), and provided that the
		//   `specifiedDockeriflePath` has a non-empty file extension different to `'.template'`.
		// * Otherwise, it will match `Dockerfile.xxx` where xxx is a non-empty file extension
		//   different to `'.template'`. This will only be matched at the
		//   root of the project directory tree, as `entryPath.minusExt` is the full path minus the
		//   file extension, which must be exactly `'Dockerfile'`.

		const nameMatches = specifiedDockerfilePath
			? entryPath.unparsed === specifiedDockerfilePath
			: entryPath.minusExt === 'Dockerfile';

		return nameMatches && !!entryPath.ext && entryPath.ext !== '.template';
	}

	public isSatisfied(bundle: Bundle): boolean {
		// Check for both satisfied architecture and device type
		const satisfied = this.getSatisfiedArch(bundle);
		return satisfied.arch !== undefined || satisfied.deviceType !== undefined;
	}

	public resolve(
		bundle: Bundle,
		specifiedDockerfilePath?: string,
		additionalTemplateVars: Dictionary<string> = {},
	) {
		// Return the satisfied arch/deviceType specific dockerfile,
		// as a plain Dockerfile, and the docker daemon will then
		// execute that
		const name =
			specifiedDockerfilePath != null
				? this.getCanonicalName(specifiedDockerfilePath)
				: 'Dockerfile';

		// device type takes precedence
		const satisfiedPair = this.getSatisfiedArch(bundle);
		let satisfied: ArchSpecificDockerfile;

		if (satisfiedPair.deviceType != null) {
			satisfied = satisfiedPair.deviceType;
		} else if (satisfiedPair.arch != null) {
			satisfied = satisfiedPair.arch;
		} else {
			return Promise.reject(
				'Resolve called without a satisfied architecture specific dockerfile',
			);
		}

		// Generate the variables to replace
		const vars: DockerfileTemplate.TemplateVariables = {
			RESIN_ARCH: bundle.architecture,
			RESIN_MACHINE_NAME: bundle.deviceType,
			BALENA_ARCH: bundle.architecture,
			BALENA_MACHINE_NAME: bundle.deviceType,
			...additionalTemplateVars,
		};

		try {
			this.dockerfileContents = DockerfileTemplate.process(
				satisfied[1].contents.toString(),
				vars,
			);
		} catch (e) {
			throw new DockerfileTemplateVariableError(e);
		}

		return Promise.resolve({
			name,
			size: satisfied[1].size,
			contents: Buffer.from(this.dockerfileContents),
		});
	}

	public getCanonicalName(filename: string): string {
		// All that needs to be done for this class of Dockerfile is to remove the extension
		return removeExtension(filename);
	}

	private getSatisfiedArch(bundle: Bundle): {
		arch?: ArchSpecificDockerfile;
		deviceType?: ArchSpecificDockerfile;
	} {
		let arch: ArchSpecificDockerfile | undefined;
		let deviceType: ArchSpecificDockerfile | undefined;
		this.archDockerfiles.map((dockerfile) => {
			if (dockerfile[0] === bundle.architecture) {
				arch = dockerfile;
			} else if (dockerfile[0] === bundle.deviceType) {
				deviceType = dockerfile;
			}
		});
		return { arch, deviceType };
	}
}

export default ArchDockerfileResolver;
