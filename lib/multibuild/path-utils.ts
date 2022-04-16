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
import * as path from 'path';

const nativeSepRE = new RegExp(_.escapeRegExp(path.sep), 'g');
const nativeDotDotRE = new RegExp('^\\.\\.$|\\.\\.' + _.escapeRegExp(path.sep));

/**
 * Given two native (platform-dependent) paths, check whether the first
 * contains the second
 * @param path1 The potentially containing native path
 * @param path2 The potentially contained native path
 * @return A boolean indicating whether `path1` contains `path2`
 */
export const contains = (path1: string, path2: string): boolean => {
	// First normalise the input, to remove any path weirdness
	path1 = path.normalize(path1);
	path2 = path.normalize(path2);

	// Now test if any part of the relative path contains a .. ,
	// which would tell us that path1 is not part of path2
	return !nativeDotDotRE.test(path.relative(path1, path2));
};

/**
 * Given two POSIX paths, check whether the first contains the second
 * @param path1 The potentially containing POSIX path
 * @param path2 The potentially contained POSIX path
 * @return A boolean indicating whether `path1` contains `path2`
 */
export const posixContains = (path1: string, path2: string): boolean => {
	// First normalise the input, to remove any path weirdness
	path1 = path.posix.normalize(path1);
	path2 = path.posix.normalize(path2);

	// Now test if any part of the relative path contains a .. ,
	// which would tell us that path1 is not part of path2
	return !/^\.\.$|\.\.\//.test(path.posix.relative(path1, path2));
};

/**
 * Replace "native path separators" like '\' with the POSIX '/' separator.
 * This function is handy but bear in mind that conversion from Windows paths
 * to POSIX is not that simple when a drive letter is specified for either
 * absolute or per-drive relative paths, e.g. 'C:\absolute' or 'C:relative',
 * or when the path refers to a network server, e.g. '\\server\folder\file'.
 */
export function toPosixPath(p: string): string {
	return p.replace(nativeSepRE, '/');
}

export function toNativePath(p: string): string {
	return p.replace(/\//g, path.sep);
}
