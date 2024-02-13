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

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import type * as Stream from 'stream';

import {
	checkExists,
	fileToTarPack,
	getDocker,
	TEST_FILES_PATH,
} from './build-utils';

import type { BuildTask, LocalImage } from '../../lib/multibuild';
import { performBuilds } from '../../lib/multibuild';
import BuildMetadata from '../../lib/multibuild/build-metadata';

chai.use(chaiAsPromised);
const expect = chai.expect;

class StreamOutputParser {
	public outputLines: string[] = [];

	public captureOutput(stream: Stream.Readable) {
		stream.on('data', (data) => this.outputLines.push(data.toString()));
	}
}

describe('performBuilds()', () => {
	// Test skipped because it requires balenaEngine (instead of standard Docker).
	// See `extraOpts` below for how to run this test manually against a device.
	it.skip('correctly builds a task using build secrets', async () => {
		const outParser = new StreamOutputParser();
		const tarFilename = `${TEST_FILES_PATH}/build-secrets-1.tar`;
		const buildMetadata = new BuildMetadata(['.balena', '.resin']);
		await buildMetadata.extractMetadata(fs.createReadStream(tarFilename));

		const task: BuildTask = {
			buildMetadata,
			buildStream: fileToTarPack(tarFilename),
			dockerOpts: { nocache: true },
			external: false,
			serviceName: 'test',
			streamHook: outParser.captureOutput.bind(outParser),
			resolved: false,
		};
		const extraOpts = {
			// device running balenaEngine (eg RPi or NUC), for manual testing
			host: '192.168.0.21',
			port: 2375,
		};
		const balenaEngineTmpPath = '/var/lib/docker/tmp';
		const images = await performBuilds(
			[task],
			getDocker(extraOpts),
			balenaEngineTmpPath,
		);
		const image: LocalImage = images[0];
		expect(image).to.have.property('successful').that.equals(true);
		expect(image).to.have.property('layers').that.is.an('array');

		const imageInspectInfo = await checkExists(image.name!);
		// tslint:disable-next-line: no-unused-expression
		expect(imageInspectInfo).to.be.an('object').that.is.not.empty;

		const relevantLines: string[] = outParser.outputLines.filter(
			(value) =>
				value.includes('RUN cat /run/secrets/my-secret.txt') ||
				value.includes('abc\n'),
		);
		expect(relevantLines.length).to.equal(2);
	});
});
