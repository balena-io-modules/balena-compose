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

import * as Dockerode from 'dockerode';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as Path from 'path';
import * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as Url from 'url';

import BuildMetadata from '../../lib/multibuild/build-metadata';
import { BalenaYml } from '../../lib/multibuild/build-secrets';

export const TEST_FILES_PATH = 'test/multibuild/test-files';

const printOutput = process.env.DISPLAY_TEST_OUTPUT === '1';
let docker: Dockerode;

export function getDocker(extraOpts?: any): Dockerode {
	if (extraOpts || !docker) {
		docker = new Dockerode(getDockerOpts(extraOpts));
	}
	return docker;
}

function getDockerOpts(extraOpts?: any): Dockerode.DockerOptions {
	let dockerOpts: Dockerode.DockerOptions = {};
	if (process.env.CIRCLECI != null) {
		let ca: string;
		let cert: string;
		let key: string;

		const certs = ['ca.pem', 'cert.pem', 'key.pem'].map((f) =>
			Path.join(process.env.DOCKER_CERT_PATH!, f),
		);
		[ca, cert, key] = certs.map((c) => fs.readFileSync(c, 'utf-8'));
		const parsed = Url.parse(process.env.DOCKER_HOST!);

		dockerOpts = {
			host: 'https://' + parsed.hostname,
			port: parsed.port,
			ca,
			cert,
			key,
		};
	} else {
		dockerOpts = {
			socketPath:
				process.platform === 'win32'
					? '//./pipe/docker_engine'
					: '/var/run/docker.sock',
		};
	}
	_.assign(dockerOpts, extraOpts);
	// extraOpts.host takes precedence over default dockerOpts.socketPath
	if (extraOpts && extraOpts.host && !extraOpts.socketPath) {
		delete dockerOpts.socketPath;
	}
	return dockerOpts;
}

export function fileToTarPack(filename: string): tar.Pack {
	// A little hacky, but it's fine for the tests
	return fs.createReadStream(filename) as any as tar.Pack;
}

export async function checkExists(
	name: string,
): Promise<Dockerode.ImageInspectInfo> {
	return docker.getImage(name).inspect();
}

export function streamPrinter(stream: Stream.Readable) {
	if (printOutput) {
		stream.on('data', (data) => console.log(data.toString()));
	}
}

export class TestBuildMetadata extends BuildMetadata {
	public constructor(metadataDirectories: string[], balenaYml: BalenaYml) {
		super(metadataDirectories);
		this.balenaYml = balenaYml;
	}
}
