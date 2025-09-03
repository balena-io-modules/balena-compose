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
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

import * as Compose from '../../lib/parse';

import {
	ContractValidationError,
	MultipleContractsForService,
	splitBuildStream,
} from '../../lib/multibuild';

import { TEST_FILES_PATH } from './build-utils';

describe('Container contracts', () => {
	it('should correctly extract container contracts', async () => {
		const tmpPath = path.join(os.tmpdir(), 'default.yml');
		await fs.promises.writeFile(tmpPath, Compose.defaultComposition());
		const defaultComposition = await Compose.parse(tmpPath);

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
						version: '>2.0.0',
					},
				],
			});
		await fs.promises.unlink(tmpPath);
	});

	it('should throw an error when a build task has multiple contracts', async () => {
		const tmpPath = path.join(os.tmpdir(), 'default.yml');
		await fs.promises.writeFile(tmpPath, Compose.defaultComposition());
		const defaultComposition = await Compose.parse(tmpPath);

		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/excessive-contracts.tar`,
		);

		try {
			await splitBuildStream(defaultComposition, tarStream);
			expect.fail('No error thrown for multiple contract files');
		} catch (e) {
			expect(e).to.be.instanceOf(MultipleContractsForService);
		}
		await fs.promises.unlink(tmpPath);
	});

	it('should correctly extract container contracts for multiple services', async () => {
		const multipleComposition = await Compose.parse(
			'test/multibuild/fixtures/contracts/multicontainer.yml',
		);

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
		const composition = await Compose.parse(
			'test/multibuild/fixtures/contracts/contract-labels.yml',
		);
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/standardProject.tar`,
		);
		const buildTasks = await splitBuildStream(composition, tarStream);
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
		const composition = await Compose.parse(
			'test/multibuild/fixtures/contracts/contract-labels-2.yml',
		);
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/simple-contract.tar`,
		);

		const buildTasks = await splitBuildStream(composition, tarStream);
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
		const composition = await Compose.parse(
			'test/multibuild/fixtures/contracts/contract-labels-3.yml',
		);
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/multiple-contracts.tar`,
		);

		try {
			await splitBuildStream(composition, tarStream);
			expect.fail('No error thrown for clashing contract definitions');
		} catch (e) {
			expect(e).to.be.instanceOf(MultipleContractsForService);
		}
	});

	it('should throw when a contract does not contain a name field', async () => {
		const tmpPath = path.join(os.tmpdir(), 'default.yml');
		await fs.promises.writeFile(tmpPath, Compose.defaultComposition());
		const defaultComposition = await Compose.parse(tmpPath);

		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/no-name-contract.tar`,
		);

		try {
			await splitBuildStream(defaultComposition, tarStream);
			expect.fail('No error thrown for contract without name');
		} catch (e) {
			expect(e).to.be.instanceOf(ContractValidationError);
			expect(e.message).to.equal('Container contract must have a name field');
		}
		await fs.promises.unlink(tmpPath);
	});

	it('should throw when a contract does not contain a type field', async () => {
		const tmpPath = path.join(os.tmpdir(), 'default.yml');
		await fs.promises.writeFile(tmpPath, Compose.defaultComposition());
		const defaultComposition = await Compose.parse(tmpPath);

		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/no-type-contract.tar`,
		);

		try {
			await splitBuildStream(defaultComposition, tarStream);
			expect.fail('No error thrown for contract without type');
		} catch (e) {
			expect(e).to.be.instanceOf(ContractValidationError);
			expect(e.message).to.equal('Container contract must have a type field');
		}
		await fs.promises.unlink(tmpPath);
	});

	it('should throw when a contract has the wrong type', async () => {
		const tmpPath = path.join(os.tmpdir(), 'default.yml');
		await fs.promises.writeFile(tmpPath, Compose.defaultComposition());
		const defaultComposition = await Compose.parse(tmpPath);

		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/wrong-type-contract.tar`,
		);

		try {
			await splitBuildStream(defaultComposition, tarStream);
			expect.fail('No error thrown for contract with incorrect type');
		} catch (e) {
			expect(e).to.be.instanceOf(ContractValidationError);
			expect(e.message).to.equal(
				'Container contract must have a type of sw.container',
			);
		}
		await fs.promises.unlink(tmpPath);
	});
});
