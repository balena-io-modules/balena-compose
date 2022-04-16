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
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import * as Compose from '@balena/compose-parse';
import * as semver from 'semver';

import {
	checkExists,
	fileToTarPack,
	getDocker,
	streamPrinter,
	TestBuildMetadata,
	TEST_FILES_PATH,
} from './build-utils';

import {
	splitBuildStream,
	BuildTask,
	BuildProcessError,
	LocalImage,
} from '../../lib/multibuild';
import { runBuildTask } from '../../lib/multibuild/build';
import { resolveTask } from '../../lib/multibuild/resolve';

chai.use(chaiAsPromised);
const expect = chai.expect;

const docker = getDocker();

const buildMetadata = new TestBuildMetadata(['.balena', '.resin'], {
	buildSecrets: {},
	buildVariables: {},
});
const secretMap = {};
const buildVars = {};

describe('Project building', () => {
	it('should correctly build a standard dockerfile project', async () => {
		const task = {
			resolved: false,
			external: false,
			buildStream: fileToTarPack(`${TEST_FILES_PATH}/standardProject.tar`),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		const image = await runBuildTask(task, docker, secretMap, buildVars);
		expect(image).to.have.property('successful').that.equals(true);
		expect(image).to.have.property('layers').that.is.an('array');
		expect(image)
			.to.have.property('baseImageTags')
			.that.is.an('array')
			.that.has.length(1);
		expect(image.baseImageTags[0]).to.be.deep.equal({
			repo: 'alpine',
			tag: 'latest',
		});
		await checkExists(image.name!);
	});

	it('should correctly return an image with a build error', async () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(`${TEST_FILES_PATH}/failingProject.tar`),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		const image = await runBuildTask(task, docker, secretMap, buildVars);
		expect(image).to.have.property('successful').that.equals(false);
		expect(image)
			.to.have.property('layers')
			.that.is.an('array')
			.and.have.length(1);
		expect(image)
			.to.have.property('baseImageTags')
			.that.is.an('array')
			.that.has.length(1);
		expect(image.baseImageTags[0]).to.be.deep.equal({
			repo: 'alpine',
			tag: 'latest',
		});
		// tslint:disable-next-line:no-unused-expression
		expect(image).to.have.property('error').that.is.not.null;
		await checkExists(image.name!);
	});

	it('should correctly return no layers or name when a base image cannot be downloaded', async () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(
				`${TEST_FILES_PATH}/missingBaseImageProject.tar`,
			),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		const image = await runBuildTask(task, docker, secretMap, buildVars);
		expect(image).to.not.have.property('name');
		expect(image).to.have.property('layers').that.has.length(0);
		expect(image)
			.to.have.property('baseImageTags')
			.that.is.an('array')
			.that.has.length(1);
		expect(image.baseImageTags[0]).to.be.deep.equal({
			repo: 'does-not-exist',
			tag: 'latest',
		});
		// tslint:disable-next-line:no-unused-expression
		expect(image).to.have.property('error').that.is.not.null;
	});

	it('should correctly tag an image', async () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(`${TEST_FILES_PATH}/standardProject.tar`),
			serviceName: 'test',
			streamHook: streamPrinter,
			tag: 'resin-multibuild-tag',
			buildMetadata,
		};

		const image = await runBuildTask(task, docker, secretMap, buildVars);
		expect(image).to.have.property('name').that.equals('resin-multibuild-tag');
		await checkExists('resin-multibuild-tag');
	});

	it('should correctly set the start and end time', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(`${TEST_FILES_PATH}/standardProject.tar`),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then((image) => {
			expect(image).to.have.property('startTime').that.is.a('number');
			expect(image).to.have.property('endTime').that.is.a('number');
		});
	});

	it('should set start and end time for a failed build', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(`${TEST_FILES_PATH}/failingProject.tar`),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then((image) => {
			expect(image).to.have.property('startTime').that.is.a('number');
			expect(image).to.have.property('endTime').that.is.a('number');
		});
	});

	it('should set the start and end time for a build with a missing base image', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(
				`${TEST_FILES_PATH}/missingBaseImageProject.tar`,
			),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then((image) => {
			expect(image).to.have.property('startTime').that.is.a('number');
			expect(image).to.have.property('endTime').that.is.a('number');
		});
	});
});

describe('Resolved project building', () => {
	it('should correctly build a resolved project', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(`${TEST_FILES_PATH}/templateProject.tar`),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};
		return new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			const newTask = resolveTask(task, 'amd64', 'intel-nuc', resolveListeners);
			resolve(runBuildTask(newTask, docker, secretMap, buildVars));
		})
			.then((image) => {
				expect(image).to.have.property('successful').that.equals(true);
				return checkExists(image.name!);
			})
			.then((inspect: any) => {
				expect(inspect).to.have.property('Architecture').that.equals('amd64');
			});
	});

	const dockerSupportsPlatform = async () =>
		semver.satisfies(
			semver.coerce((await docker.version()).ApiVersion),
			'>=1.38.0',
		);

	it('should build using "platform" flag (v2 manifest) on Dockerhub', async () => {
		if (!(await dockerSupportsPlatform())) {
			console.log("skipped... Docker does not support 'platform'");
			return;
		}

		// NOTE:  This test also covers the case of building for a different platform
		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(
				`${TEST_FILES_PATH}/platformProjectWithV2.tar`,
			),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
			dockerOpts: { pull: true },
		};
		return new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			const newTask = resolveTask(task, 'i386', 'qemux86', resolveListeners);

			// also test that a `platform: undefined` value in `task.dockerOpts`
			// does not override a valid value in `task.dockerPlatform`
			task.dockerOpts.platform = undefined;

			resolve(runBuildTask(newTask, docker, secretMap, buildVars));
		})
			.then((image) => {
				expect(image).to.have.property('successful').that.equals(true);
				return checkExists(image.name!);
			})
			.then((inspect: any) => {
				expect(inspect).to.have.property('Architecture').that.equals('386');
			});
	});

	it('should build without "platform" flag (v1 manifest)', async () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(
				`${TEST_FILES_PATH}/platformProjectWithV1.tar`,
			),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
			dockerOpts: { pull: true },
		};
		return new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			const newTask = resolveTask(task, 'amd64', 'intel-nuc', resolveListeners);

			resolve(runBuildTask(newTask, docker, secretMap, buildVars));
		})
			.then((image) => {
				expect(image).to.have.property('successful').that.equals(true);
				return checkExists(image.name!);
			})
			.then((inspect: any) => {
				expect(inspect).to.have.property('Architecture').that.equals('amd64');
			});
	});

	it('should build using "platform" flag (v2 manifest) on third party registry', async () => {
		if (!(await dockerSupportsPlatform())) {
			console.log("skipped... Docker does not support 'platform'");
			return;
		}

		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack(
				`${TEST_FILES_PATH}/platformProjectWithV2grcio.tar`,
			),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
			dockerOpts: { pull: true },
		};
		return new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			const newTask = resolveTask(task, 'amd64', 'intel-nuc', resolveListeners);

			resolve(runBuildTask(newTask, docker, secretMap, buildVars));
		}).then((image) => {
			expect(image).to.have.property('successful').that.equals(true);
			return checkExists(image.name!);
		});
	});
});

describe('Invalid build input', () => {
	it('should throw a BuildProcessError on incorrect input', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			serviceName: 'test',
			buildMetadata,
		};
		return runBuildTask(task, docker, secretMap, buildVars)
			.then(() => {
				throw new Error('Error not thrown on null buildStream input');
			})
			.catch((e) => {
				// This is what we want
				if (!(e instanceof BuildProcessError)) {
					throw new Error(
						'Incorrect error thrown on null buildStream input: ' + e,
					);
				}
			});
	});
});

describe('External images', () => {
	it('should correctly pull down external images', () => {
		const task: BuildTask = {
			external: true,
			resolved: false,
			imageName: 'alpine:3.1',
			serviceName: 'test',
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then((image) => {
			expect(image).to.have.property('successful').that.equals(true);
			expect(image).to.have.property('startTime').that.is.a('number');
			expect(image).to.have.property('endTime').that.is.a('number');
			return checkExists(image.name!);
		});
	});

	it('should correctly report an external image that could not be downloaded', () => {
		const task: BuildTask = {
			external: true,
			resolved: false,
			imageName: 'does-not-exist',
			serviceName: 'test',
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then((image) => {
			expect(image).to.have.property('successful').that.equals(false);
			expect(image).to.not.have.property('name');
			// tslint:disable-next-line:no-unused-expression
			expect(image).to.have.property('error').that.is.not.null;
			expect(image).to.have.property('startTime').that.is.a('number');
			expect(image).to.have.property('endTime').that.is.a('number');
		});
	});

	it('should call the progress hook', () => {
		let called = false;
		const task: BuildTask = {
			external: true,
			resolved: false,
			imageName: 'alpine:3.1',
			serviceName: 'test',
			progressHook: () => {
				called = true;
			},
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(() => {
			if (!called) {
				throw new Error('Progress callback not called for image pull');
			}
		});
	});

	it('should default to latest when a tag is not provided', () => {
		const task: BuildTask = {
			external: true,
			resolved: false,
			imageName: 'alpine',
			serviceName: 'test',
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then((image) => {
			expect(image).to.have.property('name').that.equals('alpine:latest');
			expect(image).to.have.property('startTime').that.is.a('number');
			expect(image).to.have.property('endTime').that.is.a('number');
			return checkExists(image.name!);
		});
	});
});

describe('Specifying a dockerfile', () => {
	it('should allow specifying a dockerfile', async () => {
		const composeObj = require('./test-files/stream/docker-compose-specified-dockerfile.json');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(
			`${TEST_FILES_PATH}/stream/specified-dockerfile.tar`,
		);

		const tasks = await splitBuildStream(comp, stream);
		expect(tasks).to.have.length(1);

		let newTask: BuildTask;
		await new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			newTask = resolveTask(tasks[0], 'test', 'test', resolveListeners);
			resolve(runBuildTask(tasks[0], docker, secretMap, buildVars));
		}).then((image) => {
			expect(newTask).to.have.property('resolved', true);
			expect(newTask).to.have.property('projectType', 'Standard Dockerfile');
			expect(newTask).to.have.property('dockerfilePath', 'test/Dockerfile');
			expect(newTask).to.have.property('dockerfile', 'correct\n');

			expect(image)
				.to.have.property('error')
				.that.has.property('message')
				.that.matches(
					/Dockerfile parse error line 1: unknown instruction: CORRECT/i,
				);
		});
	});

	it('should allow specifying a dockerfile.template', async () => {
		const composeObj = require('./test-files/stream/docker-compose-specified-dockerfile-template.json');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(
			`${TEST_FILES_PATH}/stream/specified-dockerfile-template.tar`,
		);

		const tasks = await splitBuildStream(comp, stream);
		expect(tasks).to.have.length(1);

		let newTask: BuildTask;
		await new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			newTask = resolveTask(tasks[0], 'test', 'test', resolveListeners);
			resolve(runBuildTask(tasks[0], docker, secretMap, buildVars));
		}).then((image) => {
			expect(newTask).to.have.property('resolved', true);
			expect(newTask).to.have.property('projectType', 'Dockerfile.template');
			expect(newTask).to.have.property('dockerfilePath', 'test/Dockerfile');
			expect(newTask).to.have.property('dockerfile', 'correct\n');

			expect(image)
				.to.have.property('error')
				.that.has.property('message')
				.that.matches(
					/Dockerfile parse error line 1: unknown instruction: CORRECT/i,
				);
		});
	});
});

describe('Specifying a dockerfile hook', () => {
	it('should allow preprocessing of dockerfile', async () => {
		const composeObj = require('./test-files/stream/docker-compose-specified-dockerfile.json');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(
			`${TEST_FILES_PATH}/stream/specified-dockerfile.tar`,
		);

		const tasks = await splitBuildStream(comp, stream);
		expect(tasks).to.have.length(1);

		// Test preprocessing hook by uppercasing the content.
		const dockerFilePreprocessHook = (content) => {
			return content.toUpperCase();
		};

		let newTask: BuildTask;
		await new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			newTask = resolveTask(
				tasks[0],
				'test',
				'test',
				resolveListeners,
				{},
				dockerFilePreprocessHook,
			);
			resolve(runBuildTask(tasks[0], docker, secretMap, buildVars));
		}).then((image) => {
			expect(newTask).to.have.property('resolved', true);
			expect(newTask).to.have.property('projectType', 'Standard Dockerfile');
			expect(newTask).to.have.property('dockerfilePath', 'test/Dockerfile');
			expect(newTask).to.have.property('dockerfile', 'correct\n'.toUpperCase());

			expect(image)
				.to.have.property('error')
				.that.has.property('message')
				.that.matches(
					/Dockerfile parse error line 1: unknown instruction: CORRECT/i,
				);
		});
	});
});

describe('Specifying build options', () => {
	const composeObj = require('./test-files/stream/docker-compose-build-options.json');
	const comp = Compose.normalize(composeObj);

	it('should correctly apply "extra_hosts" configuration', async () => {
		const stream = fs.createReadStream(
			'test/multibuild/test-files/buildOptionsProject.tar',
		);

		const tasks = (await splitBuildStream(comp, stream)).filter((task) =>
			task.serviceName === 'extra_hosts' ? true : false,
		);

		expect(tasks).to.have.length(1);

		let newTask: BuildTask;
		await new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			newTask = resolveTask(tasks[0], 'test', 'test', resolveListeners);
			resolve(runBuildTask(tasks[0], docker, secretMap, buildVars));
		}).then((image) => {
			expect(newTask).to.have.property('resolved', true);
			expect(newTask)
				.to.have.property('dockerOpts')
				.that.has.property('extrahosts')
				.that.deep.equals(['foo:8.8.8.8']);

			expect(image).to.not.have.property('error');
		});
	});

	it('should correctly apply "target" configuration', async () => {
		const stream = fs.createReadStream(
			`${TEST_FILES_PATH}/buildOptionsProject.tar`,
		);

		const tasks = (await splitBuildStream(comp, stream)).filter((task) =>
			task.serviceName === 'target' ? true : false,
		);

		expect(tasks).to.have.length(1);

		let newTask: BuildTask;
		await new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			newTask = resolveTask(tasks[0], 'test', 'test', resolveListeners);
			resolve(runBuildTask(tasks[0], docker, secretMap, buildVars));
		}).then(async (image) => {
			expect(newTask).to.have.property('resolved', true);
			expect(newTask)
				.to.have.property('dockerOpts')
				.that.has.property('target')
				.that.equals('stage1');

			expect(image).to.not.have.property('error');
			const imageInspectInfo = await checkExists(image.name!);
			expect(imageInspectInfo.Config.Env).to.include('stage=stage1');
		});
	});

	it('should correctly apply "cache_from" configuration', async () => {
		const stream = fs.createReadStream(
			`${TEST_FILES_PATH}/buildOptionsProject.tar`,
		);

		const tasks = (await splitBuildStream(comp, stream)).filter((task) =>
			task.serviceName === 'cache_from' ? true : false,
		);

		expect(tasks).to.have.length(1);

		let newTask: BuildTask;
		await new Promise<LocalImage>((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			newTask = resolveTask(tasks[0], 'test', 'test', resolveListeners);
			resolve(runBuildTask(tasks[0], docker, secretMap, buildVars));
		}).then(async (image) => {
			expect(newTask).to.have.property('resolved', true);
			expect(newTask)
				.to.have.property('dockerOpts')
				.that.has.property('cachefrom')
				.that.deep.equals(['alpine:latest']);

			expect(image).to.not.have.property('error');
		});
	});
});
