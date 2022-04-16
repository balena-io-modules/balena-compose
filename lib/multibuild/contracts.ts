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
import * as jsYaml from 'js-yaml';
import * as _ from 'lodash';
import * as TarUtils from 'tar-utils';

import type { BuildTask } from './build-task';
import { ContractValidationError, NonUniqueContractNameError } from './errors';

export const CONTRACT_TYPE = 'sw.container';

export function isContractFile(filename: string): boolean {
	const normalized = TarUtils.normalizeTarEntry(filename);
	return normalized === 'contract.yml' || normalized === 'contract.yaml';
}

export function processContract(buffer: Buffer): Dictionary<unknown> {
	const parsedBuffer = jsYaml.load(buffer.toString('utf8'));

	if (parsedBuffer == null || typeof parsedBuffer !== 'object') {
		throw new ContractValidationError('Container contract must be an object');
	}

	const contractObj = parsedBuffer as Dictionary<unknown>;

	if (contractObj.name == null) {
		throw new ContractValidationError(
			'Container contract must have a name field',
		);
	}

	if (contractObj.type == null) {
		throw new ContractValidationError(
			'Container contract must have a type field',
		);
	}
	if (contractObj.type !== CONTRACT_TYPE) {
		throw new ContractValidationError(
			`Container contract must have a type of ${CONTRACT_TYPE}`,
		);
	}
	if (contractObj.slug == null) {
		throw new ContractValidationError(
			'Container contract must have a slug field',
		);
	}

	return contractObj;
}

export function checkContractNamesUnique(tasks: BuildTask[]) {
	const foundNames: { [contractName: string]: string[] } = {};
	let unique = true;
	tasks.forEach((t) => {
		if (t.contract != null) {
			const name = t.contract.name as string;
			if (name in foundNames) {
				foundNames[name].push(t.serviceName);
				unique = false;
			} else {
				foundNames[name] = [t.serviceName];
			}
		}
	});

	if (!unique) {
		throw new NonUniqueContractNameError(
			_.pickBy(foundNames, (names) => names.length > 1),
		);
	}
}
