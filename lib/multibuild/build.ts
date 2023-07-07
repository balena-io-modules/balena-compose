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
import {
	getManifest,
	MEDIATYPE_MANIFEST_LIST_V2,
	MEDIATYPE_OCI_IMAGE_INDEX_V1,
} from './manifests';

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
			if (typeof task.streamHook === 'function') {
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
	// Determine how we should handle the `platform` flag.
	// This will be a combination of factors:
	//
	// * _ Does the Docker version support it? _
	//   NOTE: docker api version 1.34 actually introduced platform to the
	//         api but it was broken until fixed in 1.38
	//         https://github.com/moby/moby/commit/7f334d3acfd7bfde900e16e393662587b9ff74a1
	//
	// * _ Do the images support it? _
	//   In order to support `platform`, all images used in the Dockerfile must use the same
	//   architecture.  Determining this is problematic.  See comments in checkAllowDockerPlatformHandling

	const usePlatformOption: boolean =
		!!task.dockerPlatform &&
		semver.satisfies(
			semver.coerce((await docker.version()).ApiVersion) || '0.0.0',
			'>=1.38.0',
		) &&
		(task.useDefaultPlatformForMultiarchBaseImages === true ||
			(await checkAllowDockerPlatformHandling(task, docker)));

	if (usePlatformOption) {
		task.logger?.debug(
			`${task.serviceName}: Using platform option for build: ${task.dockerPlatform}`,
		);
	}

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

			builder.createBuildStream(dockerOpts, hooks, reject);
		});
	});
}

//   This method attempts to calculate if we should pass the `platform` flag to Docker, or
//   not.
//
///  The complexity arises from the fact that old v1 manifests do not describe platform.
//   In such cases, Docker will assume the image matches the platform of the current machine.
//
//   When Docker receives a target platform, these are the possible cases:
//
//      + V2 manifest/list for all images, and all images support the requested arch
//        Note that "support" means either it is a single arch image with the correct arch
//        or else it is a multi-arch image with one of the images matching arch
//          -> Result: Good to go
//
//      + V2 manifest/list for all images, and some do not support the requested arch
//          -> Result: Docker error
//
//      + Some V1 manifests, the platform flag matches what Docker guesses
//          -> Result:  Docker will succeed if the guesses are correct or fail with
//                      execution error if one of the guesses is wrong.
//
//      + Some V1 manifests, platform flag does not match what Docker guesses
//          -> Result:  Docker will throw an error even if the images are actually the
//                      correct architecture, because its guesses are wrong.
//
//   When Docker does not receive the `platform` flag, it sort of closes its eyes and hopes
//   for the best.  It has to do this in order to maintain backwards-compatible behavior:
//
//      + V2 manifests for all images: If using multiarch images, Docker will
//        infer the platform from where the build engine is running.  If using single arch
//        images, Docker will assume the declared image arch is the correct platform.
//          -> Result: Docker builds, with a warning if the images do not match the
//                     current platform.
//
//      + Some V1 manifests:
//          -> Result: Docker builds, assuming that the platform matches where the build
//                     is occurring.
//
//      NOTE!  Even when a build succeeds, if Docker is making assumptions then it is possible that
//      the image will cause an execution error on the target platform if the architecture is not
//      correct.
//
//   So what do we do?
//
//      + In the case of all images having a V2 manifest, we can simply pass the platform flag.
//
//      + In the case of having some V1 manifests, don't pass the platform flag.  Warn, but
//        let Docker close its eyes and hope for the best.  This opens the possibility for an
//        exec error, but also allows users to continue to use v1 images if they want to / need to.
//
async function checkAllowDockerPlatformHandling(
	task: BuildTask,
	docker: Dockerode,
): Promise<boolean> {
	const imageReferences: string[] = [];

	const debug = task.logger ? task.logger.debug : () => undefined;
	const warn = task.logger ? task.logger.warn : () => undefined;

	if (task.imageName) {
		imageReferences.push(task.imageName);
	} else {
		if (!task.dockerfile) {
			// Sanity check
			debug(
				`${task.serviceName}: Build task does not have an associated Dockerfile`,
			);
			return false;
		}
		const { DockerfileParser } = await import('dockerfile-ast');
		const parsedDockerfile = DockerfileParser.parse(task.dockerfile);
		const dockerInstructions = parsedDockerfile.getInstructions();
		const fromInstructions = dockerInstructions.filter(
			(inst) => inst.getKeyword() === 'FROM',
		);
		if (fromInstructions.length === 0) {
			// Sanity check
			debug(`${task.serviceName}: Dockerfile does not reference any images`);
			return false;
		}
		for (const inst of fromInstructions) {
			for (const arg of inst.getArguments()) {
				const val = arg.getValue();
				if (!val.startsWith('--')) {
					imageReferences.push(val);
					break;
				}
			}
		}
	}

	const imagesWithoutPlatformSupport: string[] = [];
	const imagesWithPlatformSupport: string[] = [];

	await Promise.all(
		imageReferences.map(async (r) => {
			try {
				const manifest = await getManifest(docker.modem, r, task.dockerOpts);
				const hasPlatformSupport = [
					MEDIATYPE_MANIFEST_LIST_V2,
					MEDIATYPE_OCI_IMAGE_INDEX_V1,
				].includes(manifest.Descriptor.mediaType);
				if (hasPlatformSupport) {
					imagesWithPlatformSupport.push(r);
				} else {
					imagesWithoutPlatformSupport.push(r);
				}
			} catch {
				// do not tally references to previous build stages
				debug(`${task.serviceName}: Image manifest data unavailable for ${r}`);
			}
		}),
	);

	if (imagesWithPlatformSupport.length > 0) {
		if (imagesWithoutPlatformSupport.length === 0) {
			// All images specify platform, let Docker receive `--platform`
			return true;
		}

		// Here we know that the service references at least 2 images
		// (at least 1 with platform support and at least 1 without platform
		// support). Therefore the service is not an "external image service"
		// (`task.imageName` must be falsy), and it must have a multi-stage
		// Dockerfile that references at least 2 images.
		warn(`\
Service '${task.serviceName}':
  Multi-stage Dockerfile found with a mix of base images that require
  CPU architecture selection and base images that do not support it.
  The following base images do not support CPU architecture selection:
  - ${imagesWithoutPlatformSupport.join('\n  - ')}
  The following base images require CPU architecture selection:
  - ${imagesWithPlatformSupport.join('\n  - ')}
  As a result, the CPU architecture of the machine where the Docker Engine
  is running will be used by default to select base images that require
  architecture selection. This may result in incorrect architecture selection
  and "exec format error" at runtime. It is usually possible to override the
  architecture in the FROM line with e.g. "FROM --platform=linux/arm/v7",
  or by adding the sha256 digest of the image for a specific architecture
  with e.g. "FROM debian@sha256:094f57...".`);
	}

	// Proceeding after warnings.  Docker will _not_ receive `--platform`
	return false;
}
