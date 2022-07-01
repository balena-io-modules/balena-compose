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
 * There is a `@types/jsonstream` package, but the version of the typescript
 * compiler used by CircleCI makes a distinction between uppercase 'JSONStream'
 * and lowercase 'jsonstream'.
 *
 * TODO: create a pull request for github.com/DefinitelyTyped/DefinitelyTyped
 * for the uppercase 'JSONStream' style, which is the official capitalisation
 * according to the project's website.
 */
declare module 'JSONStream' {
	function parse(pattern?: any): NodeJS.ReadWriteStream;
}
