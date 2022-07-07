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
import type { ProgressCallback } from 'docker-progress';
import type * as Stream from 'stream';
import type * as tar from 'tar-stream';
import type BuildMetadata from './build-metadata';

/**
 * A structure representing a list of build tasks to be performed,
 * as defined in a composition. These are generated and then acted
 * upon by this module.
 */
export interface BuildTask {
	/**
	 * Does this task represent the pulling of an external image
	 * from a registry?
	 */
	external: boolean;
	/**
	 * If this task is an external image pull, this is the registry
	 * URL of the image.
	 *
	 * If this task is not an external image pull, this field will be null.
	 */
	imageName?: string;
	/**
	 * If this is a Docker build task, this field will be set to the context
	 * path of the build.
	 */
	context?: string;
	/**
	 * If this is a Docker build task, this field will be set to the build
	 * arguments which are to passed into the daemon
	 */
	args?: Dictionary<string>;
	/**
	 * If this is a Docker build task, this field will be set to the labels
	 * which should be attached to the resulting image.
	 */
	labels?: Dictionary<string>;
	/**
	 * If this value is set, the resulting image will be tagged as this
	 * once built (or pulled).
	 */
	tag?: string;
	/**
	 * This field will be set to the dockerfile after resolution.
	 */
	dockerfile?: string;
	/**
	 * This will be the path of the dockerfile if specified
	 */
	dockerfilePath?: string;
	/**
	 * An object which will be forwarded to the docker daemon, with options
	 * for the build or pull
	 */
	dockerOpts?: { [key: string]: any };
	/**
	 * This field will be filled with the project type, after resolution
	 */
	projectType?: string;
	/**
	 * A stream which when read will produce a tar archive for an individual
	 * build.
	 *
	 * If this task is an external image pull, this field will be null.
	 */
	buildStream?: tar.Pack;
	/**
	 * This function should be provided by the caller. It is a hook which will
	 * be called with the docker build output.
	 *
	 * For an external image build this function will not be called.
	 */
	streamHook?: (stream: Stream.Readable) => void;
	/**
	 * This function will be called by docker-progress with objects that
	 * represent the pull progress of external images.
	 *
	 * For docker builds this function will not be called.
	 */
	progressHook?: ProgressCallback;
	/**
	 * The name of the service that this task if for, as it appears in
	 * the composition
	 */
	serviceName: string;
	/**
	 * Has this task failed to be resolved?
	 */
	resolved: boolean;

	/**
	 * A handle to the metadata manager - note that there is
	 * a single metadata manager per docker-compose build
	 */
	buildMetadata: BuildMetadata;

	/**
	 * The architecture of the build that we are performing.
	 * This is populated in the resolution step, and used for
	 * setting up the build secrets on the host (we need to
	 * know the host architecture so we can build the correct
	 * docker image for this host)
	 */
	architecture?: string;

	/**
	 * The platform string used used by docker resolve the correct
	 * image in manifest lists.
	 * Populated in the resolution step by translating from the
	 * architecture property unless `useDefaultPlatformOnly` is `true`.
	 */
	dockerPlatform?: string;

	/**
	 * If true, then do not attempt to query base image manifests for
	 * a matching platform. The default platform (builder arch) will be used.
	 */
	useDefaultPlatformForMultiarchBaseImages?: boolean;

	/**
	 * The container contract for this service
	 */
	contract?: Dictionary<unknown>;

	/**
	 * Promise to ensure that build task is resolved before
	 * progressing to next steps in the build process (workaround).
	 */
	resolvedPromise?: Promise<void>;

	/** Logger to be used for events related to this build task */
	logger?: Logger;
}

export interface Logger {
	debug: (msg: string) => void;
	error: (msg: string) => void;
	info: (msg: string) => void;
	warn: (msg: string) => void;
}
