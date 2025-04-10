/**
 * @license
 * Copyright 2018 Balena Ltd.
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

import { expect } from 'chai';
import * as Path from 'path';

import { PathUtils } from '../../lib/multibuild';

describe('Path utilities', () => {
	it('should correctly create relative paths', (done) => {
		const testCases = [
			// [from, to, expected]
			['.', 'testDirectory', 'testDirectory'],
			['test1', 'test1/test2', 'test2'],
			['./test1', 'test1/test2', 'test2'],
			['.', 'file', 'file'],
			['.', './file', 'file'],
			['test1/test2/', 'test1/test2/test3', 'test3'],
		];
		for (let [from, to, expected] of testCases) {
			expect(Path.posix.relative(from, to)).to.equal(
				expected,
				`expected posix.relative("${from}", "${to}") to equal "${expected}"`,
			);
			from = PathUtils.toNativePath(from);
			to = PathUtils.toNativePath(to);
			expected = PathUtils.toNativePath(expected);
			expect(Path.relative(from, to)).to.equal(
				expected,
				`expected native relative("${from}", "${to}") to equal "${expected}"`,
			);
		}
		done();
	});

	it('should correctly detect contained paths', (done) => {
		const testCases: Array<[string, string, boolean]> = [
			// [path1, path2, expected]
			['.', 'test', true],
			['.', './test', true],
			['./test', 'test/file', true],
			['./test1/test2', 'test1/file', false],
			['./test1', 'file', false],
			['test1/test2/test3', 'test1', false],
			['./test1/test2/test3', 'test1/test2/test3/file', true],
			['.', '..', false],
			['test1', 'test2/../test1/file', true],
		];
		for (let [path1, path2, expected] of testCases) {
			expect(PathUtils.posixContains(path1, path2)).to.equal(
				expected,
				`expected posixContains("${path1}", "${path2}") to equal "${expected}"`,
			);
			path1 = PathUtils.toNativePath(path1);
			path2 = PathUtils.toNativePath(path2);
			expect(PathUtils.contains(path1, path2)).to.equal(
				expected,
				`expected PathUtils.contains("${path1}", "${path2}") to equal "${expected}"`,
			);
		}
		done();
	});

	it('should convert from posix to native and back without loss', (done) => {
		const testCases = [
			['..'],
			['.'],
			['./test'],
			['./test1'],
			['./test1/test2'],
			['./test1/test2/test3'],
			['file'],
			['test'],
			['test/file'],
			['test1'],
			['test1/file'],
			['test1/test2/test3'],
			['test2/../test1/file'],
		];
		for (const [path] of testCases) {
			expect(path).to.equal(PathUtils.toPosixPath(path));
			expect(path).to.equal(
				PathUtils.toPosixPath(PathUtils.toNativePath(path)),
			);
		}
		done();
	});
});
