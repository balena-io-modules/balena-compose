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

import * as Bluebird from 'bluebird';
import type * as Dockerode from 'dockerode';
import * as _ from 'lodash';
import * as path from 'path';
import * as Compose from '@balena/compose-parse';
import type * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as TarUtils from 'tar-utils';

import { runBuildTask } from './build';
import BuildMetadata from './build-metadata';
import {
	BalenaYml,
	generateSecretPopulationMap,
	ParsedBalenaYml,
	populateSecrets,
	removeSecrets,
	SecretsPopulationMap,
} from './build-secrets';
import type { BuildTask } from './build-task';
import * as contracts from './contracts';
import {
	BuildProcessError,
	ContractError,
	MultipleContractsForService,
	SecretRemovalError,
	TarError,
} from './errors';
import type { LocalImage } from './local-image';
import * as PathUtils from './path-utils';
import { posixContains } from './path-utils';
import type { RegistrySecrets } from './registry-secrets';
import { ResolveListeners, resolveTask } from './resolve';
import * as Utils from './utils';

export { QEMU_BIN_NAME } from './build-metadata';
export * from './build-task';
export * from './errors';
export * from './local-image';
export * from './registry-secrets';
export { resolveDockerPlatform } from './resolve';
export { getRegistryAndName } from './utils';
export { BalenaYml, ParsedBalenaYml };
export { PathUtils };
export { ResolveListeners };
export { CANONICAL_HUB_URL } from './constants';

/**
 * Given a composition and stream which will output a valid tar archive,
 * split this stream into it's constiuent tasks, which may be a docker build,
 * or import of external image using docker pull.
 *
 * @param composition An object representing a parsed composition
 * @param buildStream A stream which will output a valid tar archive when read
 * @return A promise which resolves to an array of build tasks
 */
export function splitBuildStream(
	composition: Compose.Composition,
	buildStream: Stream.Readable,
): Promise<BuildTask[]> {
	const images = Compose.parse(composition);
	return fromImageDescriptors(images, buildStream);
}

export async function fromImageDescriptors(
	images: Compose.ImageDescriptor[],
	buildStream: Stream.Readable,
	metadataDirectories = ['.balena/', '.resin/'],
): Promise<BuildTask[]> {
	const buildMetadata = new BuildMetadata(metadataDirectories);

	const newStream = await buildMetadata.extractMetadata(buildStream);

	return new Promise<BuildTask[]>((resolve, reject) => {
		// Firstly create a list of BuildTasks based on the composition
		const tasks = Utils.generateBuildTasks(images, buildMetadata);

		const extract = tar.extract();

		const entryFn = (
			header: tar.Headers,
			stream: Stream.Readable,
			next: () => void,
		): void => {
			// Find the build context that this file should belong to
			const matchingTasks = _.filter(tasks, (task) => {
				if (task.external) {
					return false;
				}
				return posixContains(task.context!, header.name);
			});

			if (matchingTasks.length > 0) {
				// Add the file to every matching context
				TarUtils.streamToBuffer(stream)
					.then((buf) => {
						matchingTasks.forEach((task) => {
							const relative = path.posix.relative(task.context!, header.name);

							// Contract is a special case, but we check
							// here because we don't want to have to read
							// the input stream again to find it
							if (contracts.isContractFile(relative)) {
								if (task.contract != null) {
									throw new MultipleContractsForService(task.serviceName);
								}
								task.contract = contracts.processContract(buf);
							}

							const newHeader = _.cloneDeep(header);
							newHeader.name = relative;
							task.buildStream!.entry(newHeader, buf);
						});
					})
					.then(() => {
						next();
						return null;
					})
					.catch(ContractError, reject)
					.catch((e) => reject(new TarError(e)));
			} else {
				TarUtils.drainStream(stream)
					.then(() => {
						next();
						// return null here to keep bluebird happy
						return null;
					})
					.catch((e) => reject(new TarError(e)));
			}
		};

		extract.on('entry', entryFn);
		extract.on('finish', () => {
			_.each(tasks, (task) => {
				if (!task.external) {
					task.buildStream!.finalize();
				}
			});
			resolve(tasks);
		});
		extract.on('error', (e) => {
			reject(new TarError(e));
		});

		newStream.pipe(extract);
	}).then((tasks) => {
		contracts.checkContractNamesUnique(tasks);
		return tasks;
	});
}

export function buildHasSecrets(tasks: BuildTask[]): boolean {
	if (tasks.length === 0) {
		return false;
	}

	return !_.isEmpty(
		generateSecretPopulationMap(
			_.map(tasks, 'serviceName'),
			tasks[0].buildMetadata,
			'/tmp',
		),
	);
}

/**
 * Given a list of build tasks, perform project resolution
 * on these build tasks, and return the new build tasks, ready
 * to be sent to the docker daemon.
 *
 * If analysis needs to occur on the dockerfile, this method must
 * be called before the build task will contain the dockerfile contents.
 *
 * @param tasks The build tasks to resolve
 * @param architecture The architecture to resolve for
 * @param deviceType The device type to resolve for
 * @param resolveListeners Event listeners for tar stream resolution.
 * You should always add at least an 'error' handler, or uncaught errors
 * may crash the app.
 * @param dockerfilePreprocessHook A hook which can be used
 * to change the dockerfile after resolution. Note that to
 * provide a different hook per task, call
 * performSingleResolution with the hook for each task
 * @returns A list of resolved build tasks
 */
export function performResolution(
	tasks: BuildTask[],
	architecture: string,
	deviceType: string,
	resolveListeners: ResolveListeners,
	additionalTemplateVars?: Dictionary<string>,
	dockerfilePreprocessHook?: (dockerfile: string) => string,
): BuildTask[] {
	return tasks.map((task) => {
		task.architecture = architecture;
		return resolveTask(
			task,
			architecture,
			deviceType,
			resolveListeners,
			additionalTemplateVars,
			dockerfilePreprocessHook,
		);
	});
}

export function performSingleResolution(
	task: BuildTask,
	architecture: string,
	deviceType: string,
	resolveListeners: ResolveListeners,
	additionalTemplateVars?: Dictionary<string>,
	dockerfilePreprocessHook?: (dockerfile: string) => string,
): BuildTask {
	task.architecture = architecture;
	return resolveTask(
		task,
		architecture,
		deviceType,
		resolveListeners,
		additionalTemplateVars,
		dockerfilePreprocessHook,
	);
}

/**
 * Given a list of build tasks, and a handle to a docker daemon, this function
 * will perform the tasks and return a list of LocalImage values, which
 * represent images present on the docker daemon provided.
 *
 * @param tasks A list of build tasks to be performed
 * @param docker A handle to a docker daemon, retrieved from
 * 	Dockerode
 * @param tmpDir The location of the temporary directory on
 * 	the docker host
 * @return A promise which resolves to a list of LocalImages
 */
export async function performBuilds(
	tasks: BuildTask[],
	docker: Dockerode,
	tmpDir: string,
): Promise<LocalImage[]> {
	if (tasks.length === 0) {
		return [];
	}
	const buildMetadata = tasks[0].buildMetadata;

	const {
		secrets: secretMap,
		regSecrets: registrySecrets,
		architecture,
	} = await initializeBuildMetadata(tasks, docker, tmpDir);

	const images = await Bluebird.map(tasks, (task: BuildTask) => {
		return performSingleBuild(
			task,
			docker,
			registrySecrets,
			secretMap,
			buildMetadata.getBuildVarsForService(task.serviceName),
		);
	});

	if (!_.isEmpty(secretMap)) {
		try {
			await removeSecrets(docker, secretMap, architecture, tmpDir);
		} catch (e) {
			throw new SecretRemovalError(e);
		}
	}
	return images;
}

export async function initializeBuildMetadata(
	tasks: BuildTask[],
	docker: Dockerode,
	tmpDir: string,
): Promise<{
	secrets: SecretsPopulationMap;
	regSecrets: RegistrySecrets;
	architecture: string;
}> {
	if (tasks.length === 0) {
		return {
			secrets: {},
			regSecrets: {},
			architecture: '',
		};
	}
	// This feels a bit dirty, but there doesn't seem another
	// nicer way to do it given the current setup
	const buildMetadata = tasks[0].buildMetadata;
	const architecture = (await docker.version()).Arch;

	buildMetadata.parseMetadata();
	const registrySecrets = buildMetadata.registrySecrets;

	const secretMap = generateSecretPopulationMap(
		_.map(tasks, 'serviceName'),
		buildMetadata,
		tmpDir,
	);
	const hasSecrets = !_.isEmpty(secretMap);

	if (hasSecrets) {
		// TODO: investigate the purpose of this `populateSecrets`
		// call. Could it be simply deleted?
		await populateSecrets(docker, secretMap, architecture, tmpDir);
	}

	return {
		secrets: secretMap,
		regSecrets: registrySecrets,
		architecture,
	};
}

/**
 * This function allows a caller to perform builds individually,
 * returning a LocalImage, representing an image present on the
 * docker daemon provided.
 *
 * @param task A build task to be performed
 * @param docker A handle to a docker daemon, retrieved from Dockerode
 * @return A promise which resolves to a LocalImage
 */
export async function performSingleBuild(
	task: BuildTask,
	docker: Dockerode,
	registrySecrets: RegistrySecrets,
	secretMap?: SecretsPopulationMap,
	buildArgs?: Dictionary<string>,
): Promise<LocalImage> {
	try {
		return await runBuildTask(
			task,
			docker,
			registrySecrets,
			secretMap,
			buildArgs,
		);
	} catch (e) {
		throw new BuildProcessError(e);
	}
}
