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
import { DockerProgress } from 'docker-progress';
import type * as Dockerode from 'dockerode';
import * as _ from 'lodash';

import type { BuildTask } from './build-task';
import { BuildProcessError } from './errors';
import { LocalImage } from './local-image';
import { getAuthConfigObj } from './registry-secrets';

const hasImageTag = (name: string): boolean => {
	const tagRegex = /^.+:[^/]+$/;
	return tagRegex.test(name);
};

interface RegistrySecret {
	username: string;
	password: string;
}

export function pullExternal(
	task: BuildTask,
	docker: Dockerode,
): Bluebird<LocalImage> {
	const dockerProgress = new DockerProgress({ docker });

	const progressHook = _.isFunction(task.progressHook)
		? task.progressHook
		: _.noop;

	if (task.imageName == null) {
		throw new BuildProcessError('No image name given for an external image');
	}
	let imageName = task.imageName;

	if (!hasImageTag(imageName)) {
		imageName += ':latest';
	}

	const opts = task.dockerOpts || {};
	let authConfigObj: RegistrySecret | {} = {};
	if (opts.registryconfig) {
		authConfigObj = getAuthConfigObj(imageName, opts.registryconfig);
	}

	const startTime = Date.now();
	return Bluebird.resolve(authConfigObj)
		.then((authConfig: RegistrySecret | {}) => {
			if (authConfig && Object.keys(authConfig).length > 0) {
				opts.authconfig = authConfig;
			}
			return dockerProgress.pull(imageName, progressHook, opts);
		})
		.then(() => {
			const image = new LocalImage(docker, imageName, task.serviceName, {
				external: true,
				successful: true,
			});
			image.startTime = startTime;
			image.endTime = Date.now();
			image.projectType = 'external service';
			return image;
		})
		.catch((e) => {
			const image = new LocalImage(docker, null, task.serviceName, {
				external: true,
				successful: false,
			});
			image.error = e;
			image.startTime = startTime;
			image.endTime = Date.now();
			image.projectType = 'external service';
			return image;
		});
}
