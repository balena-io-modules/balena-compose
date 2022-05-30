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

import { Stream } from 'stream';

/**
 * Additional typing information that is merged with that available in the npm
 * package `@types/event-stream`.
 * TODO: create a pull request for github.com/DefinitelyTyped/DefinitelyTyped
 */
declare module 'event-stream' {
	function through<T extends Stream>(
		write?: (data: any) => void,
		end?: () => void,
	): T;
}
