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
import type * as Stream from 'stream';

import * as Resolve from '../resolve';
import { ResolveListeners } from '../resolve';
export { ResolveListeners };

import type { BuildTask } from './build-task';

/**
 * Given a BuildTask, resolve the project type to something that
 * the docker daemon can build (or return image pulls unchanged).
 *
 * @param task a BuildTask to resolve
 * @param architecture The architecture to resolve this project for
 * @param deviceType The device type to resolve this project for
 * @param resolveListeners Event listeners for tar stream resolution.
 * @param additionalVars Additional template variables
 * @param dockerfilePreprocessHook Hook to allow dockerfile preprocessing
 * You should always add at least an 'error' handler, or uncaught errors
 * may crash the app.
 * @returns The input task object, with a few updated fields
 */
export function resolveTask(
	task: BuildTask,
	architecture: string,
	deviceType: string,
	resolveListeners: ResolveListeners,
	additionalVars: Dictionary<string> = {},
	dockerfilePreprocessHook?: (content: string) => string,
): BuildTask {
	if (task.external) {
		// No resolution needs to be performed for external images
		return task;
	}

	// Workaround to deal with timing issues when resolution takes longer.
	// Promise ensures that task is resolved before build process continues.
	let resolveTaskPromise: () => void;
	task.resolvedPromise = new Promise((resolve) => {
		resolveTaskPromise = resolve;
	});

	const dockerfileHook = (content: string) => {
		if (dockerfilePreprocessHook) {
			task.dockerfile = dockerfilePreprocessHook(content);
			return task.dockerfile;
		} else {
			task.dockerfile = content;
		}
	};

	const bundle = new Resolve.Bundle(
		task.buildStream as Stream.Readable,
		deviceType,
		architecture,
		dockerfileHook,
	);

	const resolvers = Resolve.getDefaultResolvers();
	const listeners: ResolveListeners = _.cloneDeep(resolveListeners);

	(listeners['resolver'] = listeners['resolver'] || []).push(
		(resolverName: string) => {
			task.projectType = resolverName;
			task.resolved = true;
			resolveTaskPromise();
		},
	);

	(listeners['resolved-name'] = listeners['resolved-name'] || []).push(
		(resolvedName: string) => {
			task.dockerfilePath = resolvedName;
		},
	);

	const templateVars = {
		BALENA_SERVICE_NAME: task.serviceName,
		...additionalVars,
	};
	task.buildStream = Resolve.resolveInput(
		bundle,
		resolvers,
		listeners,
		task.dockerfilePath,
		templateVars,
	);

	return task;
}

/**
 * Given a balena architecture string, translate it to the equivalent
 * docker platform string.
 */
export function resolveDockerPlatform(balenaArchitecture: string): string {
	switch (balenaArchitecture) {
		case 'amd64':
			return 'linux/amd64';
		case 'i386-nlp':
		case 'i386':
			return 'linux/386';
		case 'aarch64':
			return 'linux/arm64/v8';
		case 'armv7hf':
			return 'linux/arm/v7';
		case 'rpi':
			return 'linux/arm/v6';
	}
	return '';
}
