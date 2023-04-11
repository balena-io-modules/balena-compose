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

import type * as Dockerode from 'dockerode';
import * as _ from 'lodash';
import * as semver from 'semver';
import type * as Stream from 'stream';

import { Builder, BuildHooks, FromTagInfo } from '../build';

import type { SecretsPopulationMap } from './build-secrets';
import type { BuildTask } from './build-task';
import { BuildProcessError } from './errors';
import { pullExternal } from './external';
import { LocalImage } from './local-image';
import type { RegistrySecrets } from './registry-secrets';

function taskHooks(
	task: BuildTask,
	docker: Dockerode,
	resolve: (image: LocalImage) => void,
): BuildHooks {
	let startTime: number;

	const setImageProperties = (
		image: LocalImage,
		layers: string[],
		fromTags: FromTagInfo[],
	) => {
		image.layers = layers;
		image.baseImageTags = fromTags;
		image.startTime = startTime;
		image.endTime = Date.now();
		image.dockerfile = task.dockerfile;
		image.projectType = task.projectType;
	};

	return {
		buildSuccess: (
			imageId: string,
			layers: string[],
			fromTags: FromTagInfo[],
		) => {
			const tag = task.tag != null ? task.tag : imageId;
			const image = new LocalImage(docker, tag, task.serviceName, {
				external: false,
				successful: true,
			});
			setImageProperties(image, layers, fromTags);
			resolve(image);
		},
		buildFailure: (error: Error, layers: string[], fromTags: FromTagInfo[]) => {
			const image = new LocalImage(
				docker,
				layers[layers.length - 1],
				task.serviceName,
				{ external: false, successful: false },
			);
			setImageProperties(image, layers, fromTags);
			image.error = error;
			resolve(image);
		},
		buildStream: (stream: Stream.Duplex) => {
			startTime = Date.now();
			if (_.isFunction(task.streamHook)) {
				task.streamHook(stream);
			}

			task.buildStream!.pipe(stream);
		},
	};
}

const generateBuildArgs = (
	task: BuildTask,
	userArgs?: Dictionary<string>,
): { buildargs?: Dictionary<string> } => {
	return {
		buildargs: { ...task.args, ...userArgs },
	};
};

const generateLabels = (task: BuildTask): { labels?: Dictionary<string> } => {
	return {
		labels: task.labels,
	};
};

/**
 * Given a build task which is primed with the necessary input, perform either
 * a build or a docker pull, and return this as a LocalImage.
 *
 * @param task The build task to perform
 * @param docker The handle to the docker daemon
 * @return a promise which resolves to a LocalImage which points to the produced image
 */
export async function runBuildTask(
	task: BuildTask,
	docker: Dockerode,
	registrySecrets: RegistrySecrets,
	secrets?: SecretsPopulationMap,
	buildArgs?: Dictionary<string>,
): Promise<LocalImage> {
	// if the dockerPlatform was resolved from the target application, then
	// we should set the platform flag as long as the engine daemon supports it
	const usePlatformOption: boolean =
		!!task.dockerPlatform &&
		(task.forcePlatformArg === true ||
			semver.satisfies(
				semver.coerce((await docker.version()).ApiVersion) || '0.0.0',
				'>=1.38.0',
			));

	task.dockerOpts = _.merge(
		usePlatformOption ? { platform: task.dockerPlatform } : {},
		task.dockerOpts,
		// Merge registry secrets (from the build tar stream) last,
		// so that users' Dockerhub secrets may override balena's.
		{ registryconfig: registrySecrets },
	);

	if (task.external) {
		// Handle this separately
		return pullExternal(task, docker);
	}

	// Workaround to deal with timing issues when resolution takes longer.
	// Promise ensures that task is resolved before build process continues.
	const taskResolved = task.resolvedPromise || Promise.resolve();

	return new Promise((resolve, reject) => {
		taskResolved.then(() => {
			if (task.buildStream == null) {
				reject(
					new BuildProcessError('Null build stream on non-external image'),
				);
				return;
			}

			let dockerOpts = task.dockerOpts || {};
			dockerOpts = _.merge(
				dockerOpts,
				generateBuildArgs(task, buildArgs),
				generateLabels(task),
			);

			if (secrets != null && task.serviceName in secrets) {
				if (dockerOpts.volumes == null) {
					dockerOpts.volumes = [];
				}
				dockerOpts.volumes.push(
					`${secrets[task.serviceName].tmpDirectory}:/run/secrets:ro`,
				);
			}

			if (task.tag != null) {
				dockerOpts = _.merge(dockerOpts, { t: task.tag });
			}

			if (task.dockerfilePath != null) {
				dockerOpts = _.merge(dockerOpts, {
					dockerfile: task.dockerfilePath,
				});
			}

			const builder = Builder.fromDockerode(docker);
			const hooks = taskHooks(task, docker, resolve);

			if (dockerOpts.platform != null) {
				task.logger?.debug(
					`${task.serviceName}: Setting platform to ${dockerOpts.platform}`,
				);
			}

			builder.createBuildStream(dockerOpts, hooks, reject);
		});
	});
}
