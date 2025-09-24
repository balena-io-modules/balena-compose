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

import type { Either } from 'fp-ts/lib/Either';
import { isLeft } from 'fp-ts/lib/Either';
import type * as t from 'io-ts';
import { reporter } from 'io-ts-reporters';
import * as jsYaml from 'js-yaml';
import * as _ from 'lodash';
import * as Path from 'path';
import type * as Stream from 'stream';
import * as TarUtils from 'tar-utils';

import type { BalenaYml, ParsedBalenaYml } from './build-secrets';
import { parsedBalenaYml } from './build-secrets';
import {
	BalenaYMLValidationError,
	MultipleBalenaConfigFilesError,
	MultipleMetadataDirectoryError,
	RegistrySecretValidationError,
} from './errors';
import * as PathUtils from './path-utils';
import type { RegistrySecrets } from './registry-secrets';
import {
	addCanonicalDockerHubEntry,
	RegistrySecretValidator,
} from './registry-secrets';

export const QEMU_BIN_NAME = 'qemu-execve';

enum MetadataFileType {
	Json,
	Yaml,
}

export class BuildMetadata {
	public registrySecrets: RegistrySecrets;
	protected metadataFiles: Dictionary<Buffer> = {};
	protected balenaYml: BalenaYml;

	public constructor(protected metadataDirectories: string[]) {}

	public extractMetadata(tarStream: Stream.Readable): Stream.Readable {
		let foundMetadataDirectory: string | null = null;
		// Run the tar file through the extraction stream, removing
		// anything that is a child of the metadata directory
		// and storing it, otherwise forwarding the other files to
		// a tar insertion stream, which is then returned.
		const [extract, pack] = TarUtils.throughTarStream(
			async ($pack, header, stream, next) => {
				const entryInformation = this.getMetadataRelativePath(header.name);

				if (
					entryInformation == null ||
					entryInformation.relativePath === QEMU_BIN_NAME
				) {
					stream.pipe($pack.entry(header, next));
				} else {
					// Keep track of the different metadata directories
					// we've found, and if there is more than one, throw
					// an error (for example both .balena and .resin)
					if (
						foundMetadataDirectory != null &&
						foundMetadataDirectory !== entryInformation.metadataDirectory
					) {
						throw new MultipleMetadataDirectoryError();
					}
					foundMetadataDirectory = entryInformation.metadataDirectory;
					const buffer = await TarUtils.streamToBuffer(stream);
					this.addMetadataFile(entryInformation.relativePath, buffer);
					next();
				}
			},
		);
		tarStream.pipe(extract);
		return pack;
	}

	public getBalenaYml() {
		return _.cloneDeep(this.balenaYml);
	}

	public getSecretFile(source: string): Buffer | undefined {
		return this.metadataFiles[Path.posix.join('secrets', source)];
	}

	public parseMetadata() {
		// Yaml takes precedence over json (as our docs are in
		// yaml), but balena takes precedence over resin
		// .yml vs .yaml: https://stackoverflow.com/questions/21059124/is-it-yaml-or-yml/
		const potentials = [
			{ name: 'balena.yml', type: MetadataFileType.Yaml },
			{ name: 'balena.yaml', type: MetadataFileType.Yaml },
			{ name: 'balena.json', type: MetadataFileType.Json },
			{ name: 'resin.yml', type: MetadataFileType.Yaml },
			{ name: 'resin.yaml', type: MetadataFileType.Yaml },
			{ name: 'resin.json', type: MetadataFileType.Json },
		];

		let bufData: Buffer | undefined;
		let foundType: MetadataFileType | undefined;
		let foundName: string | undefined;

		for (const { name, type } of potentials) {
			if (name in this.metadataFiles) {
				if (foundName != null) {
					// We need to throw if we find multiple
					// configuration files, as it's not clear which
					// should be used
					throw new MultipleBalenaConfigFilesError([foundName, name]);
				}
				foundName = name;
				bufData = this.metadataFiles[name];
				foundType = type;
			}
		}
		if (bufData != null) {
			let result: Either<t.Errors, ParsedBalenaYml>;
			try {
				let value: unknown;
				if (foundType === MetadataFileType.Json) {
					value = JSON.parse(bufData.toString());
				} else {
					value = jsYaml.load(bufData.toString());
				}

				result = parsedBalenaYml.decode(value);
				if (isLeft(result)) {
					throw new Error(reporter(result).join('\n'));
				}
			} catch (e) {
				throw new BalenaYMLValidationError(e);
			}

			this.balenaYml = {
				buildSecrets: result.right['build-secrets'] ?? {},
				buildVariables: result.right['build-variables'] ?? {},
			};
		} else {
			this.balenaYml = { buildSecrets: {}, buildVariables: {} };
		}

		this.parseRegistrySecrets();
	}

	public getBuildVarsForService(serviceName: string): Dictionary<string> {
		const vars: Dictionary<string> = {};
		if (this.balenaYml.buildVariables.global != null) {
			Object.assign(vars, this.balenaYml.buildVariables.global);
		}
		const services = this.balenaYml.buildVariables.services;
		if (services != null && serviceName in services) {
			Object.assign(vars, services[serviceName]);
		}

		return vars;
	}

	protected parseRegistrySecrets() {
		const potentials = [
			{ name: 'registry-secrets.json', type: MetadataFileType.Json },
			{ name: 'registry-secrets.yml', type: MetadataFileType.Yaml },
			{ name: 'registry-secrets.yaml', type: MetadataFileType.Yaml },
		];

		let bufData: Buffer | undefined;
		let foundType: MetadataFileType | undefined;

		for (const { name, type } of potentials) {
			if (name in this.metadataFiles) {
				bufData = this.metadataFiles[name];
				foundType = type;
			}
		}

		if (bufData != null) {
			// Validate the registry secrets
			const validator: RegistrySecretValidator = new RegistrySecretValidator();
			let maybeSecrets: unknown;
			try {
				if (foundType === MetadataFileType.Yaml) {
					maybeSecrets = jsYaml.load(bufData.toString());
				} else {
					maybeSecrets = JSON.parse(bufData.toString());
				}
			} catch (e) {
				throw new RegistrySecretValidationError(e);
			}
			const secrets = validator.validateRegistrySecrets(maybeSecrets);
			addCanonicalDockerHubEntry(secrets);
			this.registrySecrets = secrets;
		} else {
			this.registrySecrets = {};
		}
	}

	protected addMetadataFile(name: string, data: Buffer) {
		this.metadataFiles[name] = data;
	}

	protected getMetadataRelativePath(
		path: string,
	): { relativePath: string; metadataDirectory: string } | undefined {
		for (const metadataDirectory of this.metadataDirectories) {
			if (PathUtils.posixContains(metadataDirectory, path)) {
				return {
					relativePath: Path.posix.relative(metadataDirectory, path),
					metadataDirectory,
				};
			}
		}
	}
}

export default BuildMetadata;
