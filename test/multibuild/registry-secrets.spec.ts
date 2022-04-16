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

/**
 * Tests for the registry-secrets.ts module
 */
import { expect } from 'chai';
import * as fs from 'fs';
import * as _ from 'lodash';
import { normalize } from '@balena/compose-parse';

import {
	addCanonicalDockerHubEntry,
	RegistrySecrets,
	RegistrySecretValidator,
	RegistrySecretValidationError,
	splitBuildStream,
} from '../../lib/multibuild';

import { TEST_FILES_PATH } from './build-utils';

describe('Registry secret JSON validation', () => {
	const validator = new RegistrySecretValidator();

	it('should pass when given a valid JSON string', () => {
		const validSecrets = {
			'': { username: 'bob', password: 'dog' },
			'docker.example.com': { username: 'ann', password: 'hunter2' },
			'https://idx.docker.io/v1/': { username: 'mck', password: 'cze14' },
		};
		const validSecretStr = JSON.stringify(validSecrets);
		const parsed = validator.parseRegistrySecrets(validSecretStr);
		expect(parsed).to.deep.equal(validSecrets);
	});

	it('should fail when the registry hostname contains blank space characters', () => {
		const invalidSecrets = {
			'host dot com': { username: 'ann', password: 'hunter2' },
		};
		const parse = () =>
			validator.parseRegistrySecrets(JSON.stringify(invalidSecrets));
		expect(parse).to.throw(
			RegistrySecretValidationError,
			'data should NOT have additional properties',
		);
	});

	it('should fail when the input is blank', () => {
		const parse = () => validator.parseRegistrySecrets(' ');
		expect(parse).to.throw(SyntaxError, 'Unexpected end of JSON input');
	});

	it('should fail when there is a typo in the username or password fields', () => {
		let invalidSecrets: any = {
			hostname: { usrname: 'ann', password: 'hunter2' },
		};
		let parse = () =>
			validator.parseRegistrySecrets(JSON.stringify(invalidSecrets));
		expect(parse).to.throw(
			RegistrySecretValidationError,
			"data['hostname'] should NOT have additional properties",
		);

		invalidSecrets = { hostname: { username: 'ann', pasword: 'hunter2' } };
		parse = () =>
			validator.parseRegistrySecrets(JSON.stringify(invalidSecrets));
		expect(parse).to.throw(
			RegistrySecretValidationError,
			"data['hostname'] should NOT have additional properties",
		);
	});
});

describe('RegistrySecretValidator.addCanonicalDockerHubEntry', () => {
	const canonicalEntry = 'https://index.docker.io/v1/';
	const c = { 'https://index.docker.io/v1/': 0 };
	const e1 = { 'index.docker.io': 1 };
	const e2 = { 'https://idx.docker.io/v1/': 2 };
	const e3 = { 'https://docker.io/v9/': 3 };
	const e4 = { 'cloud.docker.com/v1': 4 };
	const e5 = { 'docker.com': 5 };
	const e6 = { '/docker.com': 6 };
	const e7 = { 'eu.gcr.io': 7 };
	const e8 = { '': 8 }; // empty domain also means Docker Hub

	it('should only add a canonical entry when required', () => {
		const testCases: Array<[object[], number, number | undefined]> = [
			[[], 0, undefined],
			[[c], 1, 0],
			[[e1], 2, 1],
			[[e2], 2, 2],
			[[e3], 2, 3],
			[[e4], 2, 4],
			[[e5], 2, 5],
			[[e6], 1, undefined],
			[[e7], 1, undefined],
			[[e8], 2, 8],
			[[e1, e2], 3, 1],
			[[e2, e3], 3, 2],
			[[e5, e6], 3, 5],
			[[e6, e7], 2, undefined],
			[[e7, e8], 3, 8],
			[[e1, e2, e3, e4, e5, e6, e7, e8], 9, 1],
		];

		for (const [entries, expectedLength, expectedValue] of testCases) {
			const registrySecrets: RegistrySecrets = {};
			_.assign(registrySecrets, ...entries);
			addCanonicalDockerHubEntry(registrySecrets);
			expect(Object.keys(registrySecrets)).to.have.lengthOf(expectedLength);
			expect(registrySecrets[canonicalEntry]).to.equal(expectedValue);
		}
	});
});

describe('Registry secret extraction', () => {
	it('should correctly extract the registry secrets from the metadata directory', async () => {
		const composition = normalize({
			version: '2',
			services: {
				main: {
					build: { context: '.' },
				},
			},
		});
		const tasks = await splitBuildStream(
			composition,
			fs.createReadStream(`${TEST_FILES_PATH}/registry-secrets.tar`),
		);

		expect(tasks).to.have.length(1);
		expect(tasks[0]).to.have.property('buildMetadata');
		const metadata = tasks[0].buildMetadata;
		// Force a parse without having to build
		metadata.parseMetadata();

		expect(metadata)
			.to.have.property('registrySecrets')
			.that.deep.equals({
				'https://index.docker.io/v1/': {
					username: 'testuser',
					password: 'testpassword',
				},
			});
	});
});
