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
import { TypedError } from 'typed-error';

import * as DockerfileTemplate from '../../dockerfile';
import { Bundle, FileInfo, Resolver } from '../resolver';
import { ParsedPathPlus, removeExtension } from '../utils';

export class DockerfileTemplateVariableError extends TypedError {}

export class DockerfileTemplateResolver implements Resolver {
	public priority = 2;
	public name = 'Dockerfile.template';
	public dockerfileContents: string;

	private hasDockerfileTemplate = false;
	private templateContent: Buffer;

	public entry(file: FileInfo): void {
		this.templateContent = file.contents;
		this.hasDockerfileTemplate = true;
	}

	public needsEntry(
		entryPath: ParsedPathPlus,
		specifiedDockerfilePath?: string,
	) {
		// Note that both `entryPath` and `specifiedDockerfilePath` are normalized through
		// `TarUtils.normalizeTarEntry()` before the call this method, so they won't have
		// leading or trailing slashes or redundant path components.
		// Consider two cases:
		// * If a `specifiedDockeriflePath` was specified, say `'service/MyDockerfile.template'`,
		//   then this method will only match a tar entry whose full path is identical to that
		//   (`entryPath.unparsed === specifiedDockerfilePath`), and provided that the
		//   `specifiedDockeriflePath` has a `'.template'` file extension.
		// * Otherwise, it will match `Dockerfile.template` at the root of the project directory
		//   tree, as `entryPath.minusExt` is the full entry path minus the file extension, which
		//   must be exactly `'Dockerfile'`.
		return (
			entryPath.ext === '.template' &&
			(specifiedDockerfilePath
				? entryPath.unparsed === specifiedDockerfilePath
				: entryPath.minusExt === 'Dockerfile')
		);
	}

	public isSatisfied(): boolean {
		return this.hasDockerfileTemplate;
	}

	public resolve(
		bundle: Bundle,
		specifiedDockerfilePath: string = 'Dockerfile',
		additionalTemplateVars: Dictionary<string> = {},
	) {
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
				this.templateContent.toString(),
				vars,
			);
		} catch (e) {
			throw new DockerfileTemplateVariableError(e);
		}

		return Promise.resolve({
			contents: Buffer.from(this.dockerfileContents),
			size: this.dockerfileContents.length,
			name: this.getCanonicalName(specifiedDockerfilePath),
		});
	}

	public getCanonicalName(filename: string): string {
		// All that needs to be done for this class of Dockerfile is to remove the extension
		return removeExtension(filename);
	}
}

export default DockerfileTemplateResolver;
