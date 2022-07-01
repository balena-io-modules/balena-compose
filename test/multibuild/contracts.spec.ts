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
	NonUniqueContractNameError,
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

	it('should throw an error when contracts have the same name', () => {
		const tarStream = fs.createReadStream(
			`${TEST_FILES_PATH}/multiple-contracts-same-name.tar`,
		);

		return splitBuildStream(multipleComposition, tarStream)
			.then(() => {
				throw new Error('No error thrown for same named contracts');
			})
			.catch((e) => {
				expect(e).to.be.instanceOf(NonUniqueContractNameError);
				expect(e.nonUniqueNames).to.deep.equal({
					'container-contract': ['one', 'two'],
				});
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
