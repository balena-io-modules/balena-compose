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
import { expect } from 'chai';
import * as fs from 'fs';
import * as _ from 'lodash';
import type * as Stream from 'stream';
import * as tar from 'tar-stream';

import * as Compose from '../../lib/parse';

import { splitBuildStream } from '../../lib/multibuild';

import { TEST_FILES_PATH } from './build-utils';

const checkIsInStream = (
	tarStream: Stream.Readable,
	filenames: string | string[],
): Promise<boolean> => {
	if (!Array.isArray(filenames)) {
		filenames = [filenames];
	}

	return new Promise((resolve, reject) => {
		const extract = tar.extract();

		extract.on('entry', (header, stream, next) => {
			_.remove(filenames, (f) => f === header.name);

			stream.on('data', _.noop);
			stream.on('end', next);
			stream.on('error', reject);
		});
		extract.on('finish', () => {
			resolve(filenames.length === 0);
		});

		extract.on('error', reject);
		tarStream.pipe(extract);
	});
};

describe('Stream splitting', () => {
	it('should correctly split a stream', async () => {
		const composeObj = await import('./test-files/stream/docker-compose');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(`${TEST_FILES_PATH}/stream/project.tar`);

		await splitBuildStream(comp, stream).then((tasks) => {
			expect(tasks).to.have.length(2);
			return Promise.all(
				tasks.map((task) => {
					return checkIsInStream(task.buildStream, 'Dockerfile').then(
						(found) => {
							expect(found).to.equal(true);
						},
					);
				}),
			);
		});
	});

	it('should allow the sharing of build contexts', async () => {
		const composeObj = await import(
			'./test-files/stream/docker-compose-shared.json'
		);
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(`${TEST_FILES_PATH}/stream/project.tar`);

		await splitBuildStream(comp, stream).then((tasks) => {
			expect(tasks).to.have.length(2);
			return Promise.all(
				tasks.map((task) => {
					return checkIsInStream(task.buildStream, 'Dockerfile').then(
						(found) => {
							expect(found).to.equal(true);
						},
					);
				}),
			);
		});
	});

	it('should allow the sharing of the root build context', async () => {
		const composeObj = await import(
			'./test-files/stream/docker-compose-shared-root'
		);
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(
			`${TEST_FILES_PATH}/stream/shared-root-context.tar`,
		);

		await splitBuildStream(comp, stream).then((tasks) => {
			expect(tasks).to.have.length(2);

			return Promise.all(
				tasks.map((task) => {
					if (task.context === './') {
						return checkIsInStream(task.buildStream, [
							'Dockerfile',
							'test1/Dockerfile',
						]).then((found) => expect(found).to.equal(true));
					} else {
						return checkIsInStream(task.buildStream, 'Dockerfile').then(
							(found) => expect(found).to.equal(true),
						);
					}
				}),
			);
		});
	});

	describe('Specifying a Dockerfile', () => {
		it('should throw an error when a build object does not contain a context and dockerfile', async () => {
			const composeObj = await import(
				'./test-files/stream/docker-compose-specified-dockerfile-no-context.json'
			);
			const comp = Compose.normalize(composeObj);

			const stream = fs.createReadStream(
				`${TEST_FILES_PATH}/stream/specified-dockerfile.tar`,
			);

			try {
				await splitBuildStream(comp, stream);
				expect.fail('Expected an error to be thrown, but none was thrown');
			} catch {
				// We expect an error to be thrown, so we do nothing here
			}
		});

		it('should allow specifying a dockerfile in the composition', async () => {
			const composeObj = await import(
				'./test-files/stream/docker-compose-specified-dockerfile.json'
			);
			const comp = Compose.normalize(composeObj);

			const stream = fs.createReadStream(
				`${TEST_FILES_PATH}/stream/specified-dockerfile.tar`,
			);

			const tasks = await splitBuildStream(comp, stream);
			expect(tasks).to.have.length(1);
		});
	});
});
