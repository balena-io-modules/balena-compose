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

/**
 * This module contains interfaces and classes for the validation of the JSON
 * format expected by the balena builder and the docker daemon for the
 * authentication of private docker registries.
 */

import * as ajv from 'ajv';

import { getRegistryAndName } from './utils';
import { RegistrySecretValidationError } from './errors';
export { RegistrySecretValidationError } from './errors';

import { CANONICAL_HUB_URL } from './constants';

export interface RegistrySecrets {
	[registryAddress: string]: {
		username: string;
		password: string;
	};
}

// This is the only known URL to work with the Dockerode
// 'registryconfig' option to refer to the Docker Hub

/**
 * JSON schema validator for the private registry "secrets" (username and
 * password entries keyed by hostname:port registry addresses).
 */
export class RegistrySecretValidator {
	private registrySecretJsonSchema = {
		// Sample valid registrySecrets JSON contents:
		//   {  "docker.example.com": {"username": "ann", "password": "hunter2"},
		//      "https://idx.docker.io/v1/": {"username": "mck", "password": "cze14"}
		//   }
		type: 'object',
		patternProperties: {
			'^\\S*$': {
				type: 'object',
				properties: {
					username: { type: 'string' },
					password: { type: 'string' },
				},
				additionalProperties: false,
			},
		},
		additionalProperties: false,
	};
	private validator: ajv.Ajv = new ajv();
	private validateFunction: ajv.ValidateFunction = this.validator.compile(
		this.registrySecretJsonSchema,
	);

	/**
	 * Validate the given JSON object against the registry secrets schema.
	 * Throw an error if validation fails.
	 * @param parsedJson The result of calling JSON.parse()
	 * @returns The input object cast to the RegistrySecrets type if validation succeeds
	 * @throws Throws an error if validation fails
	 */
	public validateRegistrySecrets(parsedJson: unknown): RegistrySecrets {
		const valid = this.validateFunction(parsedJson);
		if (!valid) {
			throw new RegistrySecretValidationError(
				this.validator.errorsText(this.validateFunction.errors),
			);
		}
		return parsedJson as RegistrySecrets;
	}

	/**
	 * Call JSON.parse() on the given string, then validate the result against
	 * the registry secrets schema.
	 * @param json String containing a JSON representation of registry secrets
	 * @returns A JS object that complies with the RegistrySecrets interface
	 * @throws Throws an error if parsing or validation fails
	 */
	public parseRegistrySecrets(json: string): RegistrySecrets {
		const secrets: unknown = JSON.parse(json);
		return this.validateRegistrySecrets(secrets);
	}
}

/**
 * Search `registrySecrets` for several possible default domain names that
 * were adopted by Docker Hub over time ('index.docker.io', 'idx.docker.io',
 * 'docker.io', 'cloud.docker.com', 'docker.com') and clone the entry with
 * the "canonical name" for use with the Dockerode `registryconfig` option
 * ('https://index.docker.io/v1/'). Docker's own golang source
 * code has some hardcoded alternatives:
 * https://github.com/docker/distribution/blob/release/2.7/reference/normalize.go#L14
 *
 * By example:
 *   Input: { 'docker.io': { 'username': 'bob',   'password': 'dog' }}
 *   Output:
 *   {
 *     'docker.io': { 'username': 'bob',   'password': 'dog' },
 *     'https://index.docker.io/v1/': { 'username': 'bob',   'password': 'dog' },
 *   }
 */
export function addCanonicalDockerHubEntry(registryconfig: RegistrySecrets) {
	if (CANONICAL_HUB_URL in registryconfig) {
		return;
	}

	// Any of these domain names can be used to refer to Docker Hub
	// in the YAML or JSON file provided to the balena CLI through
	// `balena push --registry-secrets`
	const hubDomains = [
		'index.docker.io',
		'idx.docker.io',
		'docker.io',
		'cloud.docker.com',
		'hub.docker.com',
		'docker.com',
	];
	outer: for (const hubDomain of hubDomains) {
		for (const registryDomain of Object.keys(registryconfig)) {
			// An empty registryDomain is also assumed to mean Docker Hub
			if (
				registryDomain === '' ||
				registryDomain.match(new RegExp(`(^|https?://)${hubDomain}($|/.*)`))
			) {
				registryconfig[CANONICAL_HUB_URL] = registryconfig[registryDomain];
				break outer;
			}
		}
	}
}

/**
 * Match a `task.imageName` such as `arm32v7hf/busybox` (Docker Hub) or
 * `eu.gcr.io/repo/arm32v7/busybox` (Google Cloud Container Registry) against
 * the domain names provided by the user in the YAML or JSON file for the
 * `balena push --registry-secrets` option. Return a promise for the matched
 * object, for use as the dockerode `authconfig` option of the pull action.
 *
 * Note: it is assumed that the caller has already called
 * `addCanonicalDockerHubEntry(registryconfig)` as needed. The builders do
 * this in `resin-builder/src/metadata.ts`.
 */
export function getAuthConfigObj(
	imageName: string,
	registryconfig: RegistrySecrets,
): RegistrySecrets | {} {
	const { registry } = getRegistryAndName(imageName);
	// If the imageName was prefixed by a domain name or IP address,
	// use it to query the registryconfig and return.
	if (registry) {
		return registryconfig[registry] || {};
	} else {
		// Note: the caller should call addCanonicalDockerHubEntry()
		// before calling this function (see `resin-builder/src/metadata.ts`)
		return registryconfig[CANONICAL_HUB_URL] || {};
	}
}
