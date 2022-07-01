/**
 * @license
 * Copyright 2019 Balena Ltd.
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

/**
 * ValidHooks: A list of valid hooks to enable the compiler to do
 * some safety checking
 */
export type ValidHook = 'buildStream' | 'buildSuccess' | 'buildFailure';

/** FromTagInfo: Information about an image tag referred in the Dockerfile. */
export interface FromTagInfo {
	repo: string;
	tag: string;
}

/**
 * BuildHooks
 *
 * This interface details the hooks that *can* be implemented by a `resin-docker-build` plugin.
 * No callbacks are required to be provided and in that case the build will continue as normal,
 * with the caveat of there will be no caching and output. It also would not be possible to tell
 * when/if the build finished successfully.
 *
 * Because of this the minimum recommended registered hooks are buildSuccess and buildFailure,
 * but this is not enforced, or required.
 */
export interface BuildHooks {
	/**
	 * This hook is called after a build is started, with `stream` being populated with
	 * a ReadableStream which is connected to the output of the docker daemon.
	 *
	 * @param stream A duplex stream that can be used to send and receive data
	 * to/from the docker daemon.
	 *
	 * Example implementation:
	 *
	 * buildStream = (stream) => {
	 *     stream.pipe(process.stdout);
	 * }
	 *
	 */
	buildStream?: (stream: NodeJS.ReadWriteStream) => void;

	/**
	 * This hook will be called after a build has successfully finished.
	 *
	 * @param imageId Digest that points to the built image
	 * @param layers Intermediate layers used by the build, can be used for GC.
	 * The last id in the layers array is also the imageId, so care should be
	 * taken to not GC the built image.
	 * @param fromTags image tags referred during the build
	 */
	buildSuccess?: (
		imageId: string,
		layers: string[],
		fromTags: FromTagInfo[],
	) => void;

	/**
	 * This hook will be called upon build failure, with the error that caused
	 * the failure.
	 *
	 * @param error Error that caused the build failure
	 * @param layers The layers that were successful
	 */
	buildFailure?: (
		error: Error,
		layers: string[],
		fromTags: FromTagInfo[],
	) => void;
}
