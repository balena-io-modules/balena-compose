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
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import isString = require('lodash/isString');
import { Readable } from 'stream';
import * as tar from 'tar-stream';
import * as TarUtils from 'tar-utils';

import * as Resolve from '../../lib/resolve';
import * as Utils from '../../lib/resolve/utils';

use(chaiAsPromised);

// The following indices are mapped to the order of resolvers returned
// by Resolve.getDefaultResolvers()
// If the order that they are returned changes, then so should these indices
// but that will be obvious because the tests will fail
const dockerfileResolverIdx = 0;
const dockerfileTemplateResolverIdx = 1;
const archDockerfileResolverIdx = 2;
const nodeResolverIdx = 3;
const defaultResolvers: () => Resolve.Resolver[] = () =>
	Resolve.getDefaultResolvers();

function getDockerfileFromTarStream(
	stream: Readable,
	name = 'Dockerfile',
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const extract = tar.extract();
		let foundDockerfile = false;

		extract.on(
			'entry',
			(
				header: tar.Headers,
				entryStream: NodeJS.ReadableStream,
				next: () => void,
			) => {
				if (TarUtils.normalizeTarEntry(header.name) === name) {
					let contents = '';
					entryStream.on('data', (data: string) => {
						contents += data;
					});
					entryStream.on('end', () => {
						foundDockerfile = true;
						resolve(contents);
					});
				} else {
					entryStream.resume();
				}
				next();
			},
		);

		stream.on('error', reject);
		extract.on('error', reject);

		extract.on('finish', () => {
			if (!foundDockerfile) {
				reject(new Error('Could not find a dockerfile in returned archive'));
			}
		});
		stream.pipe(extract);
	});
}

function getPromiseForEvents(
	events: { [event: string]: (eventArg: Error | string) => void },
	rejectOnError = true,
	resolveOnEnd = false,
): [Promise<unknown>, Resolve.ResolveListeners] {
	const listeners: Resolve.ResolveListeners = {};
	const resolvePromise = new Promise((resolve, reject) => {
		listeners['error'] = [rejectOnError ? reject : resolve];
		if (resolveOnEnd) {
			listeners['end'] = [resolve];
		}
		for (const event of Object.keys(events)) {
			listeners[event] = [
				(eventArg) => {
					try {
						events[event](eventArg);
						if (resolveOnEnd) {
							if (event === 'end') {
								resolve({ event: eventArg });
							}
						} else {
							resolve({ event: eventArg });
						}
					} catch (error) {
						reject(error);
					}
				},
			];
		}
	});
	return [resolvePromise, listeners];
}

async function testResolveInput({
	architecture = '',
	deviceType = '',
	dockerfileContentMatcher = (contents) => contents === 'correct',
	expectedResolvedDockerfilePath,
	expectedResolverName,
	shouldCallHook = true,
	specifiedDockerfilePath,
	tarFilePath,
	additionalTemplateVars,
	dockerfileHook,
}: {
	architecture?: string;
	deviceType?: string;
	dockerfileContentMatcher?: (contents: string) => boolean;
	expectedResolvedDockerfilePath: string;
	expectedResolverName: string;
	shouldCallHook?: boolean;
	specifiedDockerfilePath: string;
	tarFilePath: string;
	additionalTemplateVars?: { [key: string]: string };
	dockerfileHook?: (content: string) => string | Promise<string>;
}) {
	let content: string;
	let resolvedName: string;
	let resolverName: string;
	const hook =
		dockerfileHook ??
		((hookContent) => {
			if (shouldCallHook) {
				content = hookContent;
			} else {
				throw new Error('hook should not be called');
			}
		});
	const tarStream = fs.createReadStream(require.resolve(tarFilePath));
	const bundle = new Resolve.Bundle(tarStream, deviceType, architecture, hook);
	const [resolvePromise, listeners] = getPromiseForEvents(
		{
			resolver: (name: string) => {
				resolverName = name;
			},
			'resolved-name': (name: string) => {
				resolvedName = name;
			},
		},
		true,
		true,
	);
	let outputStream;

	outputStream = Resolve.resolveInput(
		bundle,
		defaultResolvers(),
		listeners,
		specifiedDockerfilePath,
		additionalTemplateVars,
	);

	let tarContent;
	if (expectedResolvedDockerfilePath) {
		tarContent = await getDockerfileFromTarStream(
			outputStream,
			expectedResolvedDockerfilePath,
		);
	} else {
		outputStream.resume();
	}

	await resolvePromise;

	expect(resolverName).to.equal(expectedResolverName);
	if (expectedResolvedDockerfilePath) {
		if (specifiedDockerfilePath) {
			expect(resolvedName).to.equal(expectedResolvedDockerfilePath);
		}
		expect(dockerfileContentMatcher(tarContent.trim())).to.equal(
			true,
			`Bad stream contents for "${expectedResolvedDockerfilePath}": ${tarContent.trim()}`,
		);
	}
	if (shouldCallHook && dockerfileHook == null) {
		expect(dockerfileContentMatcher(content.trim())).to.equal(
			true,
			`Bad contents in hook call: ${content.trim()}`,
		);
	}
}

describe('Resolvers', () => {
	it('should return resolve a standard Dockerfile project', () => {
		return testResolveInput({
			dockerfileContentMatcher: (contents) =>
				contents === `FROM debian:jessie\n\nRUN apt-get update`,
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Standard Dockerfile',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/Dockerfile/archive.tar',
		});
	});

	it('should resolve a Dockerfile.template correctly', () => {
		const deviceType = 'device-type-test';
		const arch = 'architecture-test';
		return testResolveInput({
			architecture: arch,
			deviceType,
			dockerfileContentMatcher: (contents) =>
				contents === `FROM resin/${deviceType}-node:slim\nRUN echo ${arch}`,
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Dockerfile.template',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/DockerfileTemplate/archive.tar',
		});
	});

	it('should resolve a balena Dockerfile.template correctly', () => {
		const deviceType = 'device-type-test';
		const arch = 'architecture-test';
		return testResolveInput({
			architecture: arch,
			deviceType,
			dockerfileContentMatcher: (contents) =>
				contents === `FROM resin/${deviceType}-node:slim\nRUN echo ${arch}`,
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Dockerfile.template',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/BalenaDockerfileTemplate/archive.tar',
		});
	});

	it('should resolve an architecture specific dockerfile', () => {
		return testResolveInput({
			architecture: 'i386',
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Architecture-specific Dockerfile',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/ArchitectureDockerfile/archive.tar',
		});
	});

	it('should prioritise architecture dockerfiles over dockerfile templates', () => {
		return testResolveInput({
			architecture: 'i386',
			dockerfileContentMatcher: (contents) => contents === 'i386',
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Architecture-specific Dockerfile',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/ArchPriority/archive.tar',
		});
	});

	it('should prioritise device type over architecture dockerfiles', () => {
		return testResolveInput({
			architecture: 'armv7hf',
			deviceType: 'raspberry-pi2',
			dockerfileContentMatcher: (contents) => contents === 'raspberry-pi2',
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Architecture-specific Dockerfile',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/ArchPriority/archive.tar',
		});
	});

	it('should handle incorrect template variables', () => {
		const resolvers = defaultResolvers();
		const stream = fs.createReadStream(
			require.resolve('./test-files/IncorrectTemplateMacros/archive.tar'),
		);
		const bundle = new Resolve.Bundle(stream, '', '');
		const [resolvePromise, listeners] = getPromiseForEvents(
			{
				end: () => {
					throw new Error('No error thrown for incorrect template variables');
				},
				error: (err) => {
					expect(isString(err) ? err : err.message).to.equal(
						'RESIN_DEVICE_TYPE is not defined',
					);
				},
			},
			false,
		);
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		outStream.resume();
		return resolvePromise;
	});

	it('should reject a nodeJS project with no engines entry', async function () {
		let errorMessage: string;
		try {
			await testResolveInput({
				expectedResolvedDockerfilePath: undefined,
				expectedResolverName: 'NodeJS',
				specifiedDockerfilePath: undefined,
				tarFilePath: './test-files/NoEngineNodeProject/archive.tar',
			});
		} catch (err) {
			errorMessage = err.message;
		}
		expect(errorMessage).to.equal(
			'package.json: engines.node must be specified',
		);
	});

	it.skip('should resolve a nodeJS project', function () {
		this.timeout(3600000);
		const deviceType = 'raspberrypi3';
		return testResolveInput({
			deviceType,
			dockerfileContentMatcher: (contents) =>
				contents.startsWith(`FROM resin/${deviceType}-node:10.0.0-onbuild`),
			expectedResolvedDockerfilePath: undefined,
			expectedResolverName: 'NodeJS',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/NodeProject/archive.tar',
		});
	});
});

describe('Hooks', () => {
	it('should call a hook on a resolved Dockerfile.template bundle', () => {
		const arch = 'arch';
		const deviceType = 'dt';
		return testResolveInput({
			architecture: arch,
			deviceType,
			dockerfileContentMatcher: (contents) =>
				contents === `${deviceType}:${arch}`,
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Dockerfile.template',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/Hooks/Template/archive.tar',
		});
	});

	it('should call a hook on a resolved Dockerfile bundle', () => {
		return testResolveInput({
			dockerfileContentMatcher: (contents) =>
				contents === 'This is the dockerfile contents',
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Standard Dockerfile',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/Hooks/Dockerfile/archive.tar',
		});
	});

	it('should allow a hook to change a Dockerfile in-place', () => {
		return testResolveInput({
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Standard Dockerfile',
			specifiedDockerfilePath: undefined,
			dockerfileContentMatcher: (contents) => contents === 'Hook replacement',
			dockerfileHook: () => {
				console.log('The dockerfile hook  is being called');
				return Promise.resolve('Hook replacement');
			},
			tarFilePath: './test-files/Hooks/Dockerfile/archive.tar',
		});
	});

	it('should allow a hook to change a Dockerfile.template in-place', () => {
		const deviceType = 'device-type-test';
		const arch = 'architecture-test';
		return testResolveInput({
			architecture: arch,
			deviceType,
			dockerfileContentMatcher: (contents) => contents === 'Hook replacement',
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Dockerfile.template',
			dockerfileHook: () => Promise.resolve('Hook replacement'),
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/DockerfileTemplate/archive.tar',
		});
	});
});

describe('Utils', () => {
	it('should correctly normalize tar entries', () => {
		const fn = TarUtils.normalizeTarEntry;
		expect(fn('Dockerfile')).to.equal('Dockerfile');
		expect(fn('./Dockerfile')).to.equal('Dockerfile');
		expect(fn('../Dockerfile')).to.equal('../Dockerfile');
		expect(fn('/Dockerfile')).to.equal('Dockerfile');
		expect(fn('./a/b/Dockerfile')).to.equal('a/b/Dockerfile');
	});

	it('should correctly remove file extensions', () => {
		const fn = Utils.removeExtension;
		expect(fn('Dockerfile.template')).to.equal('Dockerfile');
		expect(fn('test/Dockerfile.template')).to.equal('test/Dockerfile');
		expect(fn('Dockerfile')).to.equal('Dockerfile');
		expect(fn('test/Dockerfile')).to.equal('test/Dockerfile');
	});
});

describe('Specifying dockerfiles', () => {
	it('should allow a Dockerfile to be specified in a different location', () => {
		return testResolveInput({
			expectedResolvedDockerfilePath: 'test/Dockerfile',
			expectedResolverName: 'Standard Dockerfile',
			specifiedDockerfilePath: 'test/Dockerfile',
			tarFilePath: './test-files/SpecifiedDockerfile/archive.tar',
		});
	});

	it('should allow a Dockerfile.template to be specified in a different location', () => {
		return testResolveInput({
			expectedResolvedDockerfilePath: 'test/Dockerfile',
			expectedResolverName: 'Dockerfile.template',
			specifiedDockerfilePath: 'test/Dockerfile.template',
			tarFilePath: './test-files/SpecifiedDockerfileTemplate/archive.tar',
		});
	});

	it('should allow a Dockerfile.template to have a different name', () => {
		return testResolveInput({
			expectedResolvedDockerfilePath: 'MyDockerfile',
			expectedResolverName: 'Dockerfile.template',
			specifiedDockerfilePath: 'MyDockerfile.template',
			tarFilePath: './test-files/SpecifiedMyDockerfileTemplate/archive.tar',
		});
	});

	it('should allow an arch-specific dockerfile to be specified in a different location', () => {
		return testResolveInput({
			architecture: 'armv7hf',
			expectedResolvedDockerfilePath: 'test/Dockerfile',
			expectedResolverName: 'Architecture-specific Dockerfile',
			specifiedDockerfilePath: 'test/Dockerfile.armv7hf',
			tarFilePath: './test-files/SpecifiedArchDockerfile/archive.tar',
		});
	});

	it('should allow an arch-specific dockerfile to have a different name', () => {
		return testResolveInput({
			architecture: 'armv7hf',
			expectedResolvedDockerfilePath: 'MyDockerfile',
			expectedResolverName: 'Architecture-specific Dockerfile',
			specifiedDockerfilePath: 'MyDockerfile.armv7hf',
			tarFilePath: './test-files/SpecifiedArchMyDockerfile/archive.tar',
		});
	});

	it('should allow a Dockerfile to be specified in a different location', () => {
		return testResolveInput({
			expectedResolvedDockerfilePath: 'random',
			expectedResolverName: 'Standard Dockerfile',
			specifiedDockerfilePath: 'random',
			tarFilePath: './test-files/SpecifiedRandomFile/archive.tar',
		});
	});

	it('should detect the right Dockerfile when there are many', () => {
		return testResolveInput({
			expectedResolvedDockerfilePath: 'Dockerfile',
			expectedResolverName: 'Standard Dockerfile',
			specifiedDockerfilePath: undefined,
			tarFilePath: './test-files/SpecifiedDockerfile/correct-dockerfile.tar',
		});
	});

	it('should emit an error if a specified Dockerfile cannot be found', async () => {
		let errorMessage: string;
		try {
			await testResolveInput({
				expectedResolvedDockerfilePath: undefined,
				expectedResolverName: undefined,
				specifiedDockerfilePath: 'InexistentDockerfile',
				tarFilePath: './test-files/SpecifiedArchMyDockerfile/archive.tar',
			});
		} catch (err) {
			errorMessage = err.message;
		}
		expect(errorMessage).to.equal(
			'Specified file not found or is invalid: InexistentDockerfile',
		);
	});

	it('should emit an error if an unspecified Dockerfile cannot be found', async () => {
		let errorMessage: string;
		try {
			await testResolveInput({
				expectedResolvedDockerfilePath: undefined,
				expectedResolverName: undefined,
				shouldCallHook: false,
				specifiedDockerfilePath: undefined,
				tarFilePath: './test-files/MissingDockerfile/archive.tar',
			});
		} catch (err) {
			errorMessage = err.message;
		}
		expect(errorMessage).to.equal(
			'Could not find a Dockerfile for this service',
		);
	});
});

describe('Additional template variables', () => {
	it('Should allow providing extra template variables', () => {
		return testResolveInput({
			expectedResolvedDockerfilePath: undefined,
			specifiedDockerfilePath: undefined,
			dockerfileContentMatcher: (content) => {
				return content === `test1\ntest2`;
			},
			expectedResolverName: 'Dockerfile.template',
			shouldCallHook: true,
			tarFilePath: './test-files/AdditionalTemplateVars/archive.tar',
			additionalTemplateVars: {
				TEST_VAR: 'test1',
				SECOND_TEST_VAR: 'test2',
			},
		});
	});

	it('should allow extra template variables in arch/dt specific dockerfiles', () => {
		return testResolveInput({
			architecture: 'armv7hf',
			deviceType: '',
			expectedResolvedDockerfilePath: undefined,
			specifiedDockerfilePath: undefined,
			dockerfileContentMatcher: (content) => {
				return content === `test1\ntest2`;
			},
			expectedResolverName: 'Architecture-specific Dockerfile',
			shouldCallHook: true,
			tarFilePath: './test-files/AdditionalTemplateVars/arch-template.tar',
			additionalTemplateVars: {
				TEST_VAR: 'test1',
				SECOND_TEST_VAR: 'test2',
			},
		});
	});
});
