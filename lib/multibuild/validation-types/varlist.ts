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

import * as t from 'io-ts';

type AcceptedVarList = VarList | string[];

export interface VarList {
	[key: string]: string;
}

const stringRegex = /([^\s=]+?)=(.+)/;

const validate = (value: unknown): value is VarList => {
	if (Array.isArray(value)) {
		return validateStringArray(value);
	} else if (value != null && typeof value === 'object') {
		return Object.entries(value as Dictionary<unknown>).every(([k, v]) => {
			return typeof v === 'string' && typeof k === 'string';
		});
	}
	return false;
};

const convert = (value: unknown): VarList | undefined => {
	if (!validate(value)) {
		return;
	}
	if (Array.isArray(value)) {
		const varList: VarList = {};
		for (const str of value) {
			const match = str.match(stringRegex);
			if (match == null) {
				return;
			}
			varList[match[1]] = match[2];
		}
		return varList;
	} else {
		return value;
	}
};

export const PermissiveVarList = new t.Type<VarList, AcceptedVarList, unknown>(
	'VarList',
	validate,
	(u, ctx) => {
		const value = convert(u);
		if (value != null) {
			return t.success(value);
		}
		return t.failure('Invalid variable list', ctx);
	},
	() => {
		throw new Error('Encode not implemented for type VarList');
	},
);

function validateStringArray(arr: unknown[]): boolean {
	if (!arr.every((a) => typeof a === 'string')) {
		return false;
	}

	// Perform a regex on every value to make sure it's in the
	// correct format
	return arr.every((a) => stringRegex.test(a));
}
