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
import * as fs from 'fs';
import * as Compose from '@balena/compose-parser';

import { defaultComposition } from '../../lib/parse';

import {
	ContractValidationError,
	MultipleContractsForService,
	splitBuildStream,
} from '../../lib/multibuild';

import { TEST_FILES_PATH } from './build-utils';

describe('Container contracts', () => {
	it('should correctly extract container contracts', async () => {
		const comp = defaultComposition();
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/simple-contract.tar`,
		);

		const buildTasks = await splitBuildStream(comp, tarStream);
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
						version: '>2.0.0',
					},
				],
			});
	});

	it('should throw an error when a build task has multiple contracts', async () => {
		const comp = defaultComposition();
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/excessive-contracts.tar`,
		);

		return splitBuildStream(comp, tarStream)
			.then(() => {
				throw new Error('No error thrown for multiple contract files');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(MultipleContractsForService);
			});
	});

	it('should correctly extract container contracts for multiple services', async () => {
		const comp = await Compose.parse(
			`${TEST_FILES_PATH}/contracts/multicontainer.yml`,
		);
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/multiple-contracts.tar`,
		);

		const buildTasks = await splitBuildStream(comp, tarStream);
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
						version: '>2.0.0',
					},
				],
			});
	});

	it('should correctly derive contracts from composition labels', async () => {
		const comp = await Compose.parse(
			`${TEST_FILES_PATH}/contracts/contract-labels.yml`,
		);
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/standardProject.tar`,
		);
		const buildTasks = await splitBuildStream(comp, tarStream);
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
						type: 'arch.sw',
						slug: 'amd64',
					},
					{
						type: 'sw.supervisor',
						version: '>=16.1.0',
					},
				],
			});
	});

	it('should correctly combine container contracts with label contracts', async () => {
		const comp = await Compose.parse(
			`${TEST_FILES_PATH}/contracts/contract-labels-2.yml`,
		);
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/simple-contract.tar`,
		);

		const buildTasks = await splitBuildStream(comp, tarStream);
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
		const comp = await Compose.parse(
			`${TEST_FILES_PATH}/contracts/contract-labels-3.yml`,
		);
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/multiple-contracts.tar`,
		);

		await splitBuildStream(comp, tarStream)
			.then(() => {
				throw new Error('No error thrown for clashing contract definitions');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(MultipleContractsForService);
			});
	});

	it('should throw when a contract does not contain a name field', async () => {
		const comp = defaultComposition();
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/no-name-contract.tar`,
		);

		return splitBuildStream(comp, tarStream)
			.then(() => {
				throw new Error('No error thrown for contract without name');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(ContractValidationError);
				expect(e.message).to.equal('Container contract must have a name field');
			});
	});

	it('should throw when a contract does not contain a type field', async () => {
		const comp = defaultComposition();
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/no-type-contract.tar`,
		);

		return splitBuildStream(comp, tarStream)
			.then(() => {
				throw new Error('No error thrown for contract without type');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(ContractValidationError);
				expect(e.message).to.equal('Container contract must have a type field');
			});
	});

	it('should throw when a contract has the wrong type', async () => {
		const comp = defaultComposition();
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/wrong-type-contract.tar`,
		);

		return splitBuildStream(comp, tarStream)
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
