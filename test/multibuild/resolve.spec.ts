import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import { Pack } from 'tar-stream';

import BuildMetadata from '../../lib/multibuild/build-metadata';
import { BuildTask } from '../../lib/multibuild';
import { resolveTask } from '../../lib/multibuild/resolve';

import { TEST_FILES_PATH } from './build-utils';

chai.use(chaiAsPromised);
const expect = chai.expect;

const buildMetadata = new (BuildMetadata as any)('/tmp');
buildMetadata.balenaYml = {
	buildSecrets: {},
	buildVariables: {},
};

describe('Project resolution', () => {
	it('should correctly resolve a project type', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: fs.createReadStream(
				`${TEST_FILES_PATH}/templateProject.tar`,
			) as any as Pack,
			serviceName: 'test',
			buildMetadata,
		};

		return new Promise<void>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
				end: [
					() => {
						try {
							expect(newTask.projectType).to.equal('Dockerfile.template');
							expect(newTask.resolved).to.equal(true);
							resolve();
						} catch (error) {
							reject(error);
						}
					},
				],
			};
			const newTask = resolveTask(task, 'test', 'test', resolveListeners);
			newTask.buildStream.resume();
		});
	});

	it('should indicate if it cannot resolve a project', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			serviceName: 'test',
			buildStream: fs.createReadStream(
				`${TEST_FILES_PATH}/failedProject.tar`,
			) as any as Pack,
			buildMetadata,
		};

		return new Promise((resolve, reject) => {
			const resolveListeners = {
				error: [resolve],
				end: [
					() => {
						reject(new Error('No error thrown on resolution failure'));
					},
				],
			};
			const newTask = resolveTask(task, 'test', 'test', resolveListeners);
			newTask.buildStream.resume();
		});
	});

	it('should correctly resolve extra template vars', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: fs.createReadStream(
				`${TEST_FILES_PATH}/additional-template-vars.tar`,
			) as any as Pack,
			serviceName: 'test',
			buildMetadata,
		};

		return new Promise<void>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
				end: [
					() => {
						try {
							expect(newTask.projectType).to.equal('Dockerfile.template');
							expect(newTask.resolved).to.equal(true);
							expect(newTask.dockerfile).to.equal(`test\ntest2\n`);
							resolve();
						} catch (error) {
							reject(error);
						}
					},
				],
			};
			const newTask = resolveTask(task, 'test', 'test', resolveListeners, {
				ANOTHER_VAR: 'test2',
			});
			newTask.buildStream.resume();
		});
	});

	it('should correctly resolve the target platform', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: fs.createReadStream(
				`${TEST_FILES_PATH}/templateProject.tar`,
			) as any as Pack,
			serviceName: 'test',
			buildMetadata,
		};

		return new Promise<void>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
				end: [
					() => {
						try {
							expect(newTask.dockerPlatform).to.equal('linux/386');
							expect(newTask.resolved).to.equal(true);
							resolve();
						} catch (error) {
							reject(error);
						}
					},
				],
			};
			const newTask = resolveTask(task, 'i386', 'test', resolveListeners);
			newTask.buildStream.resume();
		});
	});
});
