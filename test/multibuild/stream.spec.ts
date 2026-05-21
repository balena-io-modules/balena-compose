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
import * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as TarUtils from 'tar-utils';
import * as Compose from '@balena/compose-parser';

import { splitBuildStream } from '../../lib/multibuild';
import { defaultComposition } from '../../lib/parse';

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
		const comp = await Compose.parse(
			`${TEST_FILES_PATH}/stream/docker-compose.yml`,
		);

		const stream = fs.createReadStream(`${TEST_FILES_PATH}/stream/project.tar`);

		await splitBuildStream(comp, stream).then((tasks) => {
			expect(tasks).to.have.length(2);
			return Promise.all(
				tasks.map((task) => {
					return checkIsInStream(task.buildStream!, 'Dockerfile').then(
						(found) => {
							expect(found).to.equal(true);
						},
					);
				}),
			);
		});
	});

	it('should allow the sharing of build contexts', async () => {
		const comp = await Compose.parse(
			`${TEST_FILES_PATH}/stream/docker-compose-shared.yml`,
		);

		const stream = fs.createReadStream(`${TEST_FILES_PATH}/stream/project.tar`);

		await splitBuildStream(comp, stream).then((tasks) => {
			expect(tasks).to.have.length(2);
			return Promise.all(
				tasks.map((task) => {
					return checkIsInStream(task.buildStream!, 'Dockerfile').then(
						(found) => {
							expect(found).to.equal(true);
						},
					);
				}),
			);
		});
	});

	it('should allow the sharing of the root build context', async () => {
		const comp = await Compose.parse(
			`${TEST_FILES_PATH}/stream/docker-compose-shared-root.yml`,
		);

		const stream = fs.createReadStream(
			`${TEST_FILES_PATH}/stream/shared-root-context.tar`,
		);

		await splitBuildStream(comp, stream).then((tasks) => {
			expect(tasks).to.have.length(2);

			return Promise.all(
				tasks.map((task) => {
					if (task.context === './') {
						return checkIsInStream(task.buildStream!, [
							'Dockerfile',
							'test1/Dockerfile',
						]).then((found) => expect(found).to.equal(true));
					} else {
						return checkIsInStream(task.buildStream!, 'Dockerfile').then(
							(found) => expect(found).to.equal(true),
						);
					}
				}),
			);
		});
	});

	describe('Streaming behaviour', () => {
		// fromImageDescriptors used to await streamToBuffer on every tar entry
		// before forwarding it, which blew up on multi-GB build contexts
		// (EINVAL writev to the docker daemon socket, or ERR_INVALID_ARG_VALUE
		// past Buffer.MAX_LENGTH). It now pipes non-contract single-task
		// entries straight through, so memory stays bounded as long as the
		// caller is draining buildStream — which performBuilds does.
		it('does not buffer non-contract entries when only one task matches', async () => {
			const original = TarUtils.streamToBuffer;
			let streamToBufferCalls = 0;
			(
				TarUtils as { streamToBuffer: typeof TarUtils.streamToBuffer }
			).streamToBuffer = async (s) => {
				streamToBufferCalls++;
				return original(s);
			};

			try {
				const sourceTar = tar.pack();
				sourceTar.entry({ name: 'Dockerfile' }, 'FROM scratch\n');
				sourceTar.entry({ name: 'src/blob.bin' }, Buffer.alloc(1024));
				sourceTar.finalize();

				const tasks = await splitBuildStream(defaultComposition(), sourceTar);
				expect(tasks).to.have.length(1);

				const found = await checkIsInStream(tasks[0].buildStream!, [
					'Dockerfile',
					'src/blob.bin',
				]);
				expect(found).to.equal(true);
				expect(streamToBufferCalls).to.equal(0);
			} finally {
				(
					TarUtils as { streamToBuffer: typeof TarUtils.streamToBuffer }
				).streamToBuffer = original;
			}
		});

		// Multi-MB entry exercises the actual backpressure path: the pack's
		// default highWaterMark is 16 KB, so anything that exceeded it used
		// to deadlock with the streaming pipe unless splitBuildStream had
		// already resolved and a consumer was draining concurrently. This
		// would hang under the original Promise-wrapped implementation that
		// resolved on extract.finish; it passes once splitBuildStream returns
		// tasks synchronously.
		it('streams large non-contract entries without deadlocking', async () => {
			const sourceTar = tar.pack();
			sourceTar.entry({ name: 'Dockerfile' }, 'FROM scratch\n');
			const bigEntry = sourceTar.entry({
				name: 'src/blob.bin',
				size: 4 * 1024 * 1024,
			});
			const chunk = Buffer.alloc(64 * 1024);
			for (let i = 0; i < 64; i++) {
				bigEntry.write(chunk);
			}
			bigEntry.end();
			sourceTar.finalize();

			const tasks = await splitBuildStream(defaultComposition(), sourceTar);
			expect(tasks).to.have.length(1);

			const found = await checkIsInStream(tasks[0].buildStream!, [
				'Dockerfile',
				'src/blob.bin',
			]);
			expect(found).to.equal(true);
		});

		// Errors used to come back as a Promise rejection from splitBuildStream
		// itself; with the streaming refactor extract runs in the background
		// so errors surface on each task.buildStream once a consumer drains.
		it('surfaces tar errors on task.buildStream rather than the split promise', async () => {
			const sourceTar = tar.pack();
			sourceTar.entry({ name: 'Dockerfile' }, 'FROM scratch\n');
			sourceTar.finalize();

			// Corrupt the source by inserting non-tar bytes; the metadata
			// extract should reject this with a TarError mapped onto the
			// task's buildStream.
			const corrupted = new Stream.PassThrough();
			sourceTar.on('data', (data) => corrupted.write(data));
			sourceTar.on('end', () => {
				corrupted.write(Buffer.from('not a tar entry header at all'));
				corrupted.end();
			});

			const tasks = await splitBuildStream(defaultComposition(), corrupted);
			expect(tasks).to.have.length(1);

			try {
				await new Promise<void>((resolve, reject) => {
					tasks[0]
						.buildStream!.on('end', resolve)
						.on('error', reject)
						.on('data', () => undefined);
				});
				throw new Error('Expected an error on buildStream');
			} catch (e) {
				expect(e).to.be.instanceOf(Error);
			}
		});
	});

	describe('Specifying a Dockerfile', () => {
		it('should throw an error when a build object does not contain a context and dockerfile', async () => {
			const comp = await Compose.parse(
				`${TEST_FILES_PATH}/stream/docker-compose-specified-dockerfile-no-context.yml`,
			);

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
			const comp = await Compose.parse(
				`${TEST_FILES_PATH}/stream/docker-compose-specified-dockerfile.yml`,
			);

			const stream = fs.createReadStream(
				`${TEST_FILES_PATH}/stream/specified-dockerfile.tar`,
			);

			const tasks = await splitBuildStream(comp, stream);
			expect(tasks).to.have.length(1);
		});
	});
});
