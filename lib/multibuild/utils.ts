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

import type { ImageDescriptor } from '@balena/compose-parser';

import type BuildMetadata from './build-metadata';
import type { BuildTask } from './build-task';

/**
 * Given a composition, generate the set of build tasks which this module
 * will proceed to build.
 *
 * @param composition The composition from @balena/compose-parse
 * @returns An array of tasks which make up this multicontainer build
 */
export function generateBuildTasks(
	images: ImageDescriptor[],
	buildMetadata: BuildMetadata,
): BuildTask[] {
	return images.map((img) => {
		if (typeof img.image === 'string') {
			return {
				external: true,
				imageName: img.image,
				serviceName: img.serviceName,
				resolved: false,
				buildMetadata,
				// Add the contract if it exists
				...(img.contract && { contract: img.contract }),
			};
		} else {
			// Check that if a dockerfile is specified, that we also have a context
			if (img.image.context == null) {
				throw new Error('Must have a context specified with a Dockerfile');
			}
			const {
				// We drop network_mode, since it doesn't make sense
				// for the hosted builder and therefore should be
				// excluded from the platform in general to ensure
				// common experience.
				network,
				// Finally, take anything that goes into dockerOpts
				cache_from: cachefrom,
				extra_hosts: extrahosts,
				shm_size: shmsize,
				target,
				...imageProps
			} = img.image;
			return _.merge(
				{
					external: false,
					serviceName: img.serviceName,
					resolved: false,
					buildMetadata,
				},
				// Add the contract if it exists
				img.contract != null ? { contract: img.contract } : {},
				// Add the dockerfile path if we have one
				img.image.dockerfile != null
					? { dockerfilePath: img.image.dockerfile }
					: {},
				// Pass through args, context, labels, tag.
				imageProps,
				// Pass through build options from composition
				// translating to dockerode ImageBuildOptions properties
				{
					dockerOpts: {
						// TODO: JSON serialization should no longer be necessary
						// if https://github.com/apocas/dockerode/pull/793 is merged
						...(cachefrom ? { cachefrom: JSON.stringify(cachefrom) } : {}),
						...(shmsize ? { shmsize } : {}),
						...(target ? { target } : {}),
						...(extrahosts ? { extrahosts } : {}),
					},
				},
				// TODO: There is img.platform, should we allow setting this
				// to allow overwriting our platform selection logic?
			);
		}
	});
}

/**
 * Separate string containing registry and image name into its parts.
 * Example:
 *   getRegistryAndName('registry.balena-staging.com/resin/rpi')
 *   -> { registry: "registry.balena-staging.com", imageName: "resin/rpi" }
 *
 * This function was copied here from the `docker-toolbelt` module because it
 * was the only reason for `resin-multibuild` and the balena CLI to import
 * that module. TODO: modernize the `docker-toolbelt` module, including
 * deleting legacy code and converting it to TypeScript.
 */
export function getRegistryAndName(image: string) {
	// Matches (registry)/(repo)(optional :tag or @digest)
	// regex adapted from Docker's source code:
	// https://github.com/docker/distribution/blob/release/2.7/reference/normalize.go#L62
	// https://github.com/docker/distribution/blob/release/2.7/reference/regexp.go#L44

	const match = image.match(
		/^(?:(localhost|.*?[.:].*?)\/)?(.+?)(?::(.*?))?(?:@(.*?))?$/,
	);
	if (!match) {
		throw new Error(`Could not parse image "${image}"`);
	}
	const [, registry, imageName, tag, digest] = match;
	const tagName = !digest && !tag ? 'latest' : tag;
	const digestMatch = digest?.match(
		/^[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[0-9a-f-A-F]{32,}$/,
	);
	if (!imageName || (digest && !digestMatch)) {
		throw new Error(
			'Invalid image name, expected [domain.tld/]repo/image[:tag][@digest] format',
		);
	}
	return {
		registry,
		imageName,
		tagName,
		digest,
	};
}
