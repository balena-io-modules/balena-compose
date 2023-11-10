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
import 'mocha';

import * as Dockerode from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

import * as proxyquire from 'proxyquire';

import { Builder, BuildHooks } from '../../lib/build';
import * as Utils from '../../lib/build/utils';

const TEST_FILE_PATH = 'test/build/test-files';

// In general we don't want output, until we do.
// call with `env DISPLAY_TEST_OUTPUT=1 npm test` to display output
const displayOutput = process.env.DISPLAY_TEST_OUTPUT === '1';

let dockerOpts: Dockerode.DockerOptions;
if (process.env.CIRCLECI != null) {
	const certs = ['ca.pem', 'cert.pem', 'key.pem'].map((f) =>
		path.join(process.env.DOCKER_CERT_PATH!, f),
	);
	const [ca, cert, key] = certs.map((c) => fs.readFileSync(c));
	const parsed = url.parse(process.env.DOCKER_HOST!);

	dockerOpts = {
		host: 'https://' + parsed.hostname,
		port: parsed.port,
		ca,
		cert,
		key,
	};
} else {
	dockerOpts = {
		socketPath: process.env.DOCKER_HOST || '/var/run/docker.sock',
	};
}
const docker = new Dockerode(dockerOpts);

// Most of the time we just care that the correct hooks are being called
// define them here to make it slightly easier
//
// sucessHooks: for when we want the buildSuccess hook to be called
const getSuccessHooks = (done: (error?: Error) => void): BuildHooks => {
	const hooks: BuildHooks = {
		buildSuccess: () => {
			done();
		},
		buildFailure: (err) => {
			if (displayOutput) {
				console.log(err);
			}
			done(err);
		},
	};
	return hooks;
};
// failureHooks: for when we want the failure hook to be called
const getFailureHooks = (done: (error?: Error) => void): BuildHooks => {
	const hooks: BuildHooks = {
		buildSuccess: () => {
			done(new Error('Expected error, got success'));
		},
		buildFailure: (err) => {
			if (displayOutput) {
				console.log(err);
			}
			done();
		},
	};
	return hooks;
};

describe('Directory build', () => {
	it('should build a directory image', function (done) {
		// Give the build 60 seconds to finish
		this.timeout(60000);
		// Start a directory build
		const builder = Builder.fromDockerode(docker);
		const hooks = getSuccessHooks(done);

		// eslint-disable-next-line @typescript-eslint/no-floating-promises -- we are using the done callback
		builder
			.buildDir(`${TEST_FILE_PATH}/directory-successful-build`, {}, hooks)
			.then((stream) => {
				if (displayOutput) {
					stream.pipe(process.stdout);
				}
			});
	});

	it('should pass layers and FROM tags', function (done) {
		this.timeout(60000);

		const hooks: BuildHooks = {
			buildSuccess: (id, layers, fromTags) => {
				if (layers.length !== 4) {
					done(new Error(`Expected 4 layers but got ${layers}`));
					return;
				}
				const [from] = fromTags;
				if (
					fromTags.length !== 1 ||
					from.repo !== 'debian' ||
					from.tag !== 'bullseye-slim'
				) {
					done(
						new Error(
							`Expected info about FROM debian:bullseye-slim, but got ${fromTags}`,
						),
					);
					return;
				}
				done();
			},
			buildFailure: (err) => {
				if (displayOutput) {
					console.log(err);
				}
				done(err);
			},
		};

		const builder = Builder.fromDockerode(docker);
		// eslint-disable-next-line @typescript-eslint/no-floating-promises -- we are using the done callback
		builder
			.buildDir(`${TEST_FILE_PATH}/directory-successful-build`, {}, hooks)
			.then((stream) => {
				if (displayOutput) {
					stream.pipe(process.stdout);
				}
			});
	});

	it('should fail to build a directory without Dockerfile', function (done) {
		this.timeout(30000);

		const builder = Builder.fromDockerode(docker);
		const hooks = getFailureHooks(done);

		// eslint-disable-next-line @typescript-eslint/no-floating-promises -- we are using the done callback
		builder
			.buildDir(`${TEST_FILE_PATH}/directory-no-dockerfile`, {}, hooks)
			.then((stream) => {
				if (displayOutput) {
					stream.pipe(process.stdout);
				}
			});
	});

	it('should fail with invalid Dockerfile', function (done) {
		this.timeout(30000);

		const builder = Builder.fromDockerode(docker);
		const hooks = getFailureHooks(done);

		// eslint-disable-next-line @typescript-eslint/no-floating-promises -- we are using the done callback
		builder
			.buildDir(`${TEST_FILE_PATH}/directory-invalid-dockerfile`, {}, hooks)
			.then((stream) => {
				if (displayOutput) {
					stream.pipe(process.stdout);
				}
			});
	});

	it('should pass stream to caller on successful build', function (done) {
		// Shorter timeout for this test, as a timeout is the failure marker
		this.timeout(10000);
		const hooks: BuildHooks = {
			buildStream: (stream) => {
				if (displayOutput) {
					stream.pipe(process.stdout);
				}
				done();
			},
		};

		const builder = Builder.fromDockerode(docker);
		// eslint-disable-next-line @typescript-eslint/no-floating-promises -- we are using the done callback
		builder.buildDir(`${TEST_FILE_PATH}/directory-successful-build`, {}, hooks);
	});

	it('should pass stream to caller on unsuccessful build', function (done) {
		this.timeout(10000);
		const hooks: BuildHooks = {
			buildStream: (stream) => {
				if (displayOutput) {
					stream.pipe(process.stdout);
				}
				done();
			},
		};

		const builder = Builder.fromDockerode(docker);
		// eslint-disable-next-line @typescript-eslint/no-floating-promises -- we are using the done callback
		builder.buildDir(
			`${TEST_FILE_PATH}/directory-invalid-dockerfile`,
			{},
			hooks,
		);
	});
});

describe('Tar stream build', () => {
	it('should build a tar stream successfully', function (done) {
		this.timeout(60000);

		const tarStream = fs.createReadStream(
			`${TEST_FILE_PATH}/archives/success.tar`,
		);

		const hooks: BuildHooks = {
			buildStream: (stream) => {
				tarStream.pipe(stream);
				if (displayOutput) {
					stream.pipe(process.stdout);
				}
			},
			buildSuccess: () => {
				done();
			},
			buildFailure: (err) => {
				if (displayOutput) {
					console.log(err);
				}
				done(err);
			},
		};

		const builder = Builder.fromDockerode(docker);
		builder.createBuildStream({}, hooks);
	});

	it('should fail to build invalid tar stream', function (done) {
		this.timeout(60000);

		const tarStream = fs.createReadStream(
			`${TEST_FILE_PATH}/archives/failure.tar`,
		);

		const hooks: BuildHooks = {
			buildStream: (stream) => {
				tarStream.pipe(stream);
				if (displayOutput) {
					stream.pipe(process.stdout);
				}
			},
			buildSuccess: () => {
				done(new Error('Expected build failure, got success hook'));
			},
			buildFailure: (err) => {
				if (displayOutput) {
					console.log(err);
				}
				done();
			},
		};

		const builder = Builder.fromDockerode(docker);

		builder.createBuildStream({}, hooks);
	});

	it('should return successful layers upon failure', function () {
		this.timeout(60000);
		return new Promise<void>((resolve, reject) => {
			const tarStream = fs.createReadStream(
				`${TEST_FILE_PATH}/archives/failure-layers.tar`,
			);

			const hooks: BuildHooks = {
				buildSuccess: () => {
					reject(new Error('Success failed on failing build'));
				},
				buildFailure: (_error, layers) => {
					const expected = 2;
					if (layers.length !== expected) {
						reject(
							new Error(
								`Incorrect number of layers (expected ${expected}, got ${layers.length})`,
							),
						);
					} else {
						resolve();
					}
				},
				buildStream: (stream) => {
					tarStream.pipe(stream);
					if (displayOutput) {
						stream.pipe(process.stdout);
					}
				},
			};
			const builder = Builder.fromDockerode(docker);
			builder.createBuildStream({}, hooks);
		});
	});

	it('should fail to build if Utils.extractLayer throws an error', async function () {
		this.timeout(30000);
		const mockUtils = {};
		Object.assign(mockUtils, Utils, {
			extractLayer: () => {
				throw new Error('spanner');
			},
		});
		const builderMod = proxyquire('../../lib/build/builder', {
			'./utils': mockUtils,
		});
		return new Promise<void>((resolve, reject) => {
			const tarStream = fs.createReadStream(
				`${TEST_FILE_PATH}/archives/success.tar`,
			);

			const hooks: BuildHooks = {
				buildSuccess: () => {
					reject(new Error('Incorrect success report on failing build'));
				},
				buildFailure: (_error, layers) => {
					const expected = 0;
					if (layers.length !== expected) {
						reject(
							new Error(
								`Incorrect number of layers (expected ${expected}, got ${layers.length})`,
							),
						);
					} else {
						resolve();
					}
				},
				buildStream: (stream) => {
					tarStream.pipe(stream);
					if (displayOutput) {
						stream.pipe(process.stdout);
					}
				},
			};

			const RewiredBuilder = builderMod.default;
			const builder = RewiredBuilder.fromDockerode(docker);
			builder.createBuildStream({}, hooks);
		});
	});
});

describe('Error handler', () => {
	it('should catch a synchronous error from a hook', function () {
		this.timeout(30000);

		return new Promise<void>((resolve, reject) => {
			const hooks: BuildHooks = {
				buildSuccess: () => {
					reject(new Error('Incorrect success report on handler error'));
				},
				buildFailure: (_error, layers) => {
					const expected = 0;
					if (layers.length !== expected) {
						reject(
							new Error(
								`Incorrect number of layers (expected ${expected}, got ${layers.length})`,
							),
						);
					} else {
						resolve();
					}
				},
				buildStream: () => {
					throw new Error(
						'Synchronous buildStream error should have been caught',
					);
				},
			};
			const builder = Builder.fromDockerode(docker);
			builder.createBuildStream({}, hooks);
		});
	});

	it('should catch an asynchronous error from a hook', function () {
		this.timeout(30000);

		return new Promise<void>((resolve, reject) => {
			const hooks: BuildHooks = {
				buildSuccess: () => {
					reject(new Error('Incorrect success report on handler error'));
				},
				buildFailure: (_error, layers) => {
					const expected = 0;
					if (layers.length !== expected) {
						reject(
							new Error(
								`Incorrect number of layers (expected ${expected}, got ${layers.length})`,
							),
						);
					} else {
						resolve();
					}
				},
				buildStream: () => {
					return Promise.reject(
						new Error('Asynchronous buildStream error should have been caught'),
					);
				},
			};
			const builder = Builder.fromDockerode(docker);
			builder.createBuildStream({}, hooks);
		});
	});
});
