/**
 * @license
 * Copyright 2017 Balena Ltd.
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

import * as _ from 'lodash';
import { TypedError } from 'typed-error';

/**
 * This error is thrown when a requested removal of an image
 * from a docker daemon fails.
 */
export class ImageRemovalError extends TypedError {}

/**
 * This error is thrown if the given tar stream cannot be written
 * or read.
 */
export class TarError extends TypedError {}

/**
 * This error is thrown in the case of a build not being able to complete
 * properly, due to a non-project error (e.g. docker daemon issues).
 *
 * Note that this error will **not** be thrown for build errors which occur
 * in the build itself (for example typos in the Dockerfile).
 */
export class BuildProcessError extends TypedError {}

/**
 * This error will be thrown when communication with Docker daemon
 * would not occur.
 */
export class DockerCommunicationError extends TypedError {}

/**
 * JSON schema validation error for private docker registry secrets
 */
export class RegistrySecretValidationError extends TypedError {}

/**
 * Thrown when we cannot parse the balena.yml metadata file
 */
export class BalenaYMLValidationError extends TypedError {}

/**
 * Throw when a secret file is referenced inside of the
 * balena.yml file but is not present in the secret
 * directory itself
 */
export class BuildSecretMissingError extends TypedError {}

/**
 * If for whatever reason we can't populate secrets on the
 * host, we throw this error
 */
export class SecretPopulationError extends TypedError {}
/**
 * If for any reason we cannot remove the secrets after
 * populating them, we throw this error
 */
export class SecretRemovalError extends TypedError {}
/**
 * dockerode.version() reported an unsupported processor architecture
 */
export class UnsupportedDockerArchError extends TypedError {}

export class MultipleMetadataDirectoryError extends TypedError {}

export class MultipleBalenaConfigFilesError extends TypedError {
	public constructor(public filesFound: string[]) {
		super();
	}
}

// Add a base class to all contract error so that callers
// can match again this error, and provide targeted output
// without needing several different checks
export class ContractError extends TypedError {}

export class MultipleContractsForService extends ContractError {
	public constructor(public serviceName: string) {
		super(`Multiple contracts found for service ${serviceName}`);
	}
}

export class NonUniqueContractNameError extends ContractError {
	public constructor(
		public nonUniqueNames: { [contractName: string]: string[] },
	) {
		super();
		let message =
			'Some services have the same contract name, which must be unique:\n';
		_.each(nonUniqueNames, (serviceNames, name) => {
			message += `  ${name}: ${serviceNames.join(', ')}`;
		});
		this.message = message;
	}
}

export class ContractValidationError extends ContractError {}
