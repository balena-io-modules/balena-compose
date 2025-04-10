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
import * as crypto from 'crypto';
import type * as Dockerode from 'dockerode';
import * as t from 'io-ts';
import * as _ from 'lodash';
import { fs } from 'mz';
import * as path from 'path';
import * as tar from 'tar-stream';

import { Builder } from '../../build';
import * as dockerfileTemplate from '../../dockerfile';

import type BuildMetadata from '../build-metadata';
import { BuildSecretMissingError, SecretPopulationError } from '../errors';
import type { VarList } from '../validation-types/varlist';
import { PermissiveVarList } from '../validation-types/varlist';
import { pipeline } from 'stream';

export const secretType = t.interface({
	source: t.string,
	dest: t.string,
});

export const parsedBalenaYml = t.partial({
	'build-variables': t.partial({
		global: PermissiveVarList,
		services: t.dictionary(t.string, PermissiveVarList),
	}),
	'build-secrets': t.partial({
		global: t.array(secretType),
		services: t.dictionary(t.string, t.array(secretType)),
	}),
});

export type ParsedBalenaYml = t.TypeOf<typeof parsedBalenaYml>;
export type SecretObject = t.TypeOf<typeof secretType>;
export interface BalenaYml {
	buildVariables: {
		global?: VarList;
		services?: Dictionary<VarList>;
	};
	buildSecrets: {
		global?: SecretObject[];
		services?: Dictionary<SecretObject[]>;
	};
}

// We map the service name against the directory that the
// secret files will be added to, and the secret files
// themselves encoded in base64
export type SecretsPopulationMap = Dictionary<{
	tmpDirectory: string;
	files: Dictionary<string>;
}>;

export function generateSecretPopulationMap(
	serviceNames: string[],
	buildMetadata: BuildMetadata,
	tmpDir: string,
): SecretsPopulationMap {
	const secretMap: SecretsPopulationMap = {};
	const yml = buildMetadata.getBalenaYml();

	for (const serviceName of serviceNames) {
		const serviceSecret: SecretsPopulationMap[''] = {
			tmpDirectory: path.posix.join(
				tmpDir,
				crypto.randomBytes(10).toString('hex'),
			),
			files: {},
		};

		// Collect the secret objects from both the global and
		// service specific entries in the yaml file
		let secretObjects: SecretObject[] = [];
		if (yml.buildSecrets.global != null) {
			secretObjects = secretObjects.concat(yml.buildSecrets.global);
		}
		if (yml.buildSecrets.services?.[serviceName] != null) {
			secretObjects = secretObjects.concat(
				yml.buildSecrets.services[serviceName],
			);
		}

		for (const { source, dest } of secretObjects) {
			const buf = buildMetadata.getSecretFile(source);
			if (!buf) {
				throw new BuildSecretMissingError(source);
			}
			serviceSecret.files[dest] = buf.toString('base64');
		}

		secretMap[serviceName] = serviceSecret;
	}

	return _.omitBy(secretMap, (v) => _.isEmpty(v.files));
}

/**
 * @param architecture Result of docker.version().Arch. Currently supported
 * values are: 'arm', 'arm64', '386', 'amd64'.
 */
export async function populateSecrets(
	docker: Dockerode,
	secrets: SecretsPopulationMap,
	architecture: string,
	tmpDir: string,
) {
	// We create a tar archive of the files that we need
	const pack = tar.pack();
	pack.entry(
		{
			name: 'secrets.json',
		},
		JSON.stringify(secrets),
	);
	const dockerfileContent = dockerfileTemplate.process(
		await fs.readFile(path.join(__dirname, 'Dockerfile'), 'utf8'),
		{
			ARCH: architecture,
		},
	);
	pack.entry(
		{
			name: 'Dockerfile',
		},
		dockerfileContent,
	);
	pack.finalize();

	const imageName = 'balena-secrets:latest';
	const dockerOpts = {
		t: imageName,
		volumes: [`${tmpDir}:${tmpDir}:rw`],
		forcerm: true,
	};
	const builder = Builder.fromDockerode(docker);
	try {
		await new Promise((resolve, reject) => {
			builder.createBuildStream(dockerOpts, {
				buildStream: (stream) => {
					pipeline(pack, stream, _.noop);
				},
				buildSuccess: resolve,
				buildFailure: reject,
			});
		});
	} catch (e) {
		throw new SecretPopulationError(e);
	} finally {
		// Remove the image
		try {
			await docker.getImage(imageName).remove({ force: true });
		} catch {
			// It won't be present on a build failure, so ignore this
		}
	}
}

/**
 * @param architecture Result of docker.version().Arch. Currently supported
 * values are: 'arm', 'arm64', '386', 'amd64'.
 */
export async function removeSecrets(
	docker: Dockerode,
	secrets: SecretsPopulationMap,
	architecture: string,
	tmpDir: string,
) {
	const pack = tar.pack();
	pack.entry(
		{
			name: 'remove.json',
		},
		JSON.stringify(_.map(secrets, ({ tmpDirectory }) => tmpDirectory)),
	);
	const dockerfileContent = dockerfileTemplate.process(
		await fs.readFile(path.join(__dirname, 'Dockerfile.remove'), 'utf8'),
		{
			ARCH: architecture,
		},
	);
	pack.entry(
		{
			name: 'Dockerfile',
		},
		dockerfileContent,
	);
	pack.finalize();

	const imageName = 'balena-secrets-remove:latest';
	const dockerOpts = {
		t: imageName,
		volumes: [`${tmpDir}:${tmpDir}:rw`],
		forcerm: true,
	};
	const builder = Builder.fromDockerode(docker);
	try {
		await new Promise((resolve, reject) => {
			builder.createBuildStream(dockerOpts, {
				buildStream: (stream) => {
					pipeline(pack, stream, _.noop);
				},
				buildSuccess: resolve,
				buildFailure: reject,
			});
		});
	} catch (e) {
		throw new SecretPopulationError(e);
	} finally {
		// Remove the image
		try {
			await docker.getImage(imageName).remove({ force: true });
		} catch {
			// It won't be present on a build failure, so ignore this
		}
	}
}
