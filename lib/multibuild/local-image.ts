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

import { ImageRemovalError } from './errors';

export interface ImageInfo {
	external: boolean;
	successful: boolean;
}

/**
 * LocalImage
 *
 * This class represents an image on a docker daemon. It also provides
 * methods to act on this image.
 */
export class LocalImage {
	/**
	 * The dockerfile which was used to build this image, if one exists
	 */
	public dockerfile?: string;

	/**
	 * Was this image built locally or imported into the docker daemon
	 * from a registry?
	 */
	public external: boolean;

	/**
	 * The reference of this image on the docker daemon. Note that this
	 * value can be null, which in a non-external image means that the
	 * base image could not be downloaed. In an image pull, the external
	 * image could not be downloaded.
	 */
	public name?: string;

	/**
	 * The service that is image is for
	 */
	public serviceName: string;

	/**
	 * The daemon which this image is stored on
	 */
	public daemon: Dockerode;

	/**
	 * The layers which make up this image build
	 */
	public layers?: string[];

	/**
	 * Base image tags referred by this image build
	 */
	public baseImageTags?: Array<{ repo: string; tag: string }>;

	/**
	 * Was this image built successfully?
	 *
	 * Note that in the case of an image not being successfully built,
	 * this class could represent an image which is made up of all
	 * the layers that were successfully built
	 */
	public successful: boolean;

	/**
	 * If this build failed with an error, this field will contain
	 * said error.
	 */
	public error?: Error;

	/**
	 * This field will be the time at which the build started. The
	 * start time is recorded just before the stream is sent to the
	 * docker daemon.
	 */
	public startTime?: number;

	/**
	 * This field will be the time at which the build finished. Finished
	 * here is classified as when the docker daemon closes the connection.
	 */
	public endTime?: number;

	/**
	 * This is the type of project that was resolved by this module, for
	 * example Dockerfile.template or Dockerfile.arch.
	 */
	public projectType?: string;

	public constructor(
		daemon: Dockerode,
		name: string | null,
		serviceName: string,
		info: ImageInfo,
	) {
		this.daemon = daemon;
		this.external = info.external;
		this.successful = info.successful;
		this.serviceName = serviceName;
		if (name != null) {
			this.name = name;
		}
	}

	/**
	 * Get a handle to the dockerode image
	 */
	public getImage(): Dockerode.Image {
		if (this.name == null) {
			throw new Error('Attempting to get image without name');
		}
		return this.daemon.getImage(this.name);
	}

	/**
	 * Delete an image from the docker daemon
	 *
	 * @throws ImageRemovalError
	 */
	public async deleteImage(): Promise<void> {
		const image = this.getImage();
		try {
			return await image.remove();
		} catch (e) {
			throw new ImageRemovalError(e);
		}
	}
}
