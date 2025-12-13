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
import { expect } from 'chai';
import { fs } from 'mz';

import * as jsYaml from 'js-yaml';

import * as compose from '../../lib/parse';

import {
	ContractValidationError,
	MultipleContractsForService,
	splitBuildStream,
} from '../../lib/multibuild';

import { TEST_FILES_PATH } from './build-utils';

const defaultComposition = compose.normalize(
	jsYaml.load(compose.defaultComposition()),
);

const multipleComposition = compose.normalize({
	version: '2',
	services: {
		one: { build: './one' },
		two: { build: './two' },
	},
});

describe('Container contracts', () => {
	it('should correctly extract container contracts', async () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/simple-contract.tar`,
		);

		const buildTasks = await splitBuildStream(defaultComposition, tarStream);
		expect(buildTasks).to.have.length(1);
		expect(buildTasks[0])
			.to.have.property('contract')
			.that.deep.equals({
				type: 'sw.container',
				name: 'container-contract',
				slug: 'container-contract',
				requires: [
					{
						type: 'sw.os',
						slug: 'balena-os',
						version: '>2.0.0',
					},
				],
			});
	});

	it('should throw an error when a build task has multiple contracts', () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/excessive-contracts.tar`,
		);

		return splitBuildStream(defaultComposition, tarStream)
			.then(() => {
				throw new Error('No error thrown for multiple contract files');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(MultipleContractsForService);
			});
	});

	it('should correctly extract container contracts for multiple services', async () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/multiple-contracts.tar`,
		);

		const buildTasks = await splitBuildStream(multipleComposition, tarStream);
		expect(buildTasks).to.have.length(2);
		expect(buildTasks[0])
			.to.have.property('contract')
			.that.deep.equals({
				type: 'sw.container',
				slug: 'container-one-contract',
				name: 'container-one-contract',
				requires: [
					{
						type: 'sw.os',
						slug: 'balena-os',
						version: '>2.0.0',
					},
				],
			});
		expect(buildTasks[1])
			.to.have.property('contract')
			.that.deep.equals({
				type: 'sw.container',
				slug: 'container-two-contract',
				name: 'container-two-contract',
				requires: [
					{
						type: 'sw.os',
						slug: 'balena-os',
						version: '>2.0.0',
					},
				],
			});
	});

	it('should correctly derive contracts from composition labels', async () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/standardProject.tar`,
		);
		const buildTasks = await splitBuildStream(
			compose.normalize({
				version: '2',
				services: {
					one: {
						build: './',
						labels: {
							'io.balena.features.requires.hw.device-type': 'raspberrypi3',
							'io.balena.features.requires.sw.l4t': '<=5',
						},
					},
					two: {
						image: 'alpine:latest',
						labels: {
							'io.balena.features.requires.sw.supervisor': '>=16.1.0',
							'io.balena.features.requires.arch.sw': 'amd64',
						},
					},
				},
			}),
			tarStream,
		);
		expect(buildTasks).to.have.length(2);
		expect(buildTasks[0])
			.to.have.property('contract')
			.that.deep.equals({
				type: 'sw.container',
				slug: 'contract-for-one',
				requires: [
					{
						type: 'hw.device-type',
						slug: 'raspberrypi3',
					},
					{ type: 'sw.l4t', version: '<=5' },
				],
			});
		expect(buildTasks[1])
			.to.have.property('contract')
			.that.deep.equals({
				type: 'sw.container',
				slug: 'contract-for-two',
				requires: [
					{
						type: 'sw.supervisor',
						version: '>=16.1.0',
					},
					{
						type: 'arch.sw',
						slug: 'amd64',
					},
				],
			});
	});

	it('should correctly combine container contracts with label contracts', async () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/simple-contract.tar`,
		);

		const buildTasks = await splitBuildStream(
			compose.normalize({
				version: '2',
				services: {
					main: { build: './' },
					other: {
						image: 'alpine:latest',
						labels: {
							'io.balena.features.requires.hw.device-type': 'raspberrypi3',
						},
					},
				},
			}),
			tarStream,
		);
		expect(buildTasks).to.have.length(2);
		expect(buildTasks[0])
			.to.have.property('contract')
			.that.deep.equals({
				type: 'sw.container',
				name: 'container-contract',
				slug: 'container-contract',
				requires: [
					{
						type: 'sw.os',
						slug: 'balena-os',
						version: '>2.0.0',
					},
				],
			});
		expect(buildTasks[1])
			.to.have.property('contract')
			.that.deep.equals({
				type: 'sw.container',
				slug: 'contract-for-other',
				requires: [
					{
						type: 'hw.device-type',
						slug: 'raspberrypi3',
					},
				],
			});
	});

	it('should throw if contracts are defined both as a labels and in `contract.yml`', async () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/multiple-contracts.tar`,
		);

		await splitBuildStream(
			compose.normalize({
				version: '2',
				services: {
					one: {
						build: './one',
						labels: {
							'io.balena.features.requires.hw.device-type': 'raspberrypi3',
						},
					},
					two: { build: './two' },
				},
			}),
			tarStream,
		)
			.then(() => {
				throw new Error('No error thrown for clashing contract definitions');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(MultipleContractsForService);
			});
	});

	it('should throw when a contract does not contain a name field', () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/no-name-contract.tar`,
		);

		return splitBuildStream(defaultComposition, tarStream)
			.then(() => {
				throw new Error('No error thrown for contract without name');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(ContractValidationError);
				expect(e.message).to.equal('Container contract must have a name field');
			});
	});

	it('should throw when a contract does not contain a type field', () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/no-type-contract.tar`,
		);

		return splitBuildStream(defaultComposition, tarStream)
			.then(() => {
				throw new Error('No error thrown for contract without type');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(ContractValidationError);
				expect(e.message).to.equal('Container contract must have a type field');
			});
	});

	it('should throw when a contract has the wrong type', () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/wrong-type-contract.tar`,
		);

		return splitBuildStream(defaultComposition, tarStream)
			.then(() => {
				throw new Error('No error thrown for contract with incorrect type');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(ContractValidationError);
				expect(e.message).to.equal(
					'Container contract must have a type of sw.container',
				);
			});
	});
});
