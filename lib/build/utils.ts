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
import * as Bluebird from 'bluebird';
import * as klaw from 'klaw';

import * as Plugin from './plugin';

/**
 * Given a docker 'arrow message' containing a sha representing
 * a layer, extract the sha digest. If the string passed in is not
 * an arrow message, undefined will be returned.
 *
 * @param message The build message to parse
 * @returns Either the sha string, or undefined
 */
export const extractLayer = (message: string): string | undefined => {
	const extract = extractArrowMessage(message);
	if (extract !== undefined) {
		const shaRegex = /^([a-f0-9]{12}[a-f0-9]*)/g;
		const match = shaRegex.exec(extract);
		if (match) {
			return match[1];
		}
	}

	return;
};

const extractArrowMessage = (message: string): string | undefined => {
	const arrowTest = /^\s*-+>\s*(.+)/;
	const match = arrowTest.exec(message);
	if (match) {
		return match[1];
	} else {
		return;
	}
};

/**
 * Go through an entire directory, splitting the entries out
 * into a list of paths to work through.
 */
export const directoryToFiles = (dirPath: string): Bluebird<string[]> => {
	return new Bluebird<string[]>((resolve, reject) => {
		const files: string[] = [];

		// Walk the directory
		klaw(dirPath)
			.on('data', (item: klaw.Item) => {
				if (!item.stats.isDirectory()) {
					files.push(item.path);
				}
			})
			.on('end', () => {
				resolve(files);
			})
			.on('error', reject);
	});
};

const fromTagPattern =
	/^(Step.+?\s*:\s*)?FROM\s+([\w-./]+)(:?([\w-./]+))?\s*(as\s+([\w-./]+))?/;

export interface FromTagInfo extends Plugin.FromTagInfo {
	alias?: string;
}

export const extractFromTag = (message: string): FromTagInfo | undefined => {
	const match = fromTagPattern.exec(message);
	if (!match) {
		return undefined;
	}
	const res: FromTagInfo = {
		repo: match[2],
		tag: match[4] || 'latest',
	};
	if (match[6]) {
		res.alias = match[6];
	}
	return res;
};
