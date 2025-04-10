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
 *
 */

import type * as Dockermodem from 'docker-modem';
import { getAuthConfigObj } from './registry-secrets';

export const MEDIATYPE_MANIFEST_V1 =
	'application/vnd.docker.distribution.manifest.v1+prettyjws';
export const MEDIATYPE_MANIFEST_V2 =
	'application/vnd.docker.distribution.manifest.v2+json';
export const MEDIATYPE_MANIFEST_LIST_V2 =
	'application/vnd.docker.distribution.manifest.list.v2+json';
export const MEDIATYPE_OCI_IMAGE_INDEX_V1 =
	'application/vnd.oci.image.index.v1+json';

export type DockerImageManifestPlatform = {
	architecture?: string;
	os?: string;
	variant?: string;
};

export type DockerImageManifestDescriptor = {
	mediaType: string;
	digest: string;
	platform?: DockerImageManifestPlatform;
};

export type DockerImageManifest = {
	Descriptor: DockerImageManifestDescriptor;
	Platforms: DockerImageManifestPlatform[];
};

export function getManifest(
	modem: Dockermodem,
	repository: string,
	dockerOpts: { [key: string]: any } = {},
): Promise<DockerImageManifest> {
	let options = {};

	if (dockerOpts?.authconfig && Object.keys(dockerOpts.authconfig).length > 0) {
		options = { authconfig: dockerOpts.authconfig };
	} else if (dockerOpts?.registryconfig) {
		const authconfig = getAuthConfigObj(repository, dockerOpts.registryconfig);
		options = authconfig ? { authconfig } : {};
	}

	const optsf = {
		path: `/distribution/${repository}/json?`,
		method: 'GET',
		statusCodes: {
			200: true,
			403: 'not found or not authorized',
			500: 'server error',
		},
		...options,
	};

	return new Promise<DockerImageManifest>((resolve, reject) => {
		modem.dial(optsf, (err: unknown, data: DockerImageManifest) => {
			if (err) {
				reject(err as Error);
				return;
			}
			resolve(data);
		});
	});
}
