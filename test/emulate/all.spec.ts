/**
 * @license
 * Copyright 2017-2019 Balena Ltd.
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

import * as Promise from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { stripIndents } from 'common-tags';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar-stream';

import * as transpose from '../../lib/emulate';

chai.use(chaiAsPromised);
const expect = chai.expect;

const opts: transpose.TransposeOptions = {
	hostQemuPath: 'hostQemu',
	containerQemuPath: 'containerQemu',
};

// FIXME: Also from resin-bundle-resolve. We really need to export these functions to a
// helper lib
function getDockerfileFromTarStream(
	stream: NodeJS.ReadableStream,
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const extract = tar.extract();
		let foundDockerfile = false;

		extract.on(
			'entry',
			(
				header: tar.Headers,
				inputStream: NodeJS.ReadableStream,
				next: () => void,
			) => {
				if (path.normalize(header.name) === 'Dockerfile') {
					foundDockerfile = true;
					let contents = '';
					inputStream.on('data', (data: string) => {
						contents += data;
					});
					inputStream.on('end', () => {
						resolve(contents);
					});
				}
				next();
			},
		);

		extract.on('finish', () => {
			if (!foundDockerfile) {
				reject(new Error('Could not find a dockerfile in returned archive'));
			}
		});
		stream.pipe(extract);
	});
}

describe('Transpose a Dockerfile', () => {
	it('should transpose a Dockerfile', () => {
		const dockerfile = stripIndents`
			FROM ubuntu
			ARG foo="bar"
			ARG myVar=zip anotherWord
			EXPOSE 80 123/udp
			EXPOSE 8080
			COPY my-file my-container-file
			ENV myvar multi word value with a "
			LABEL version=1.0
			RUN apt-get install something
			RUN ["ls", "-al"]
			`;

		const expectedOutput =
			stripIndents`
			FROM ubuntu
			COPY ["${opts.hostQemuPath}","${opts.containerQemuPath}"]
			ARG foo="bar"
			ARG myVar=zip anotherWord
			EXPOSE 80 123/udp
			EXPOSE 8080
			COPY ["my-file","my-container-file"]
			ENV myvar="multi word value with a \\""
			LABEL version="1.0"
			RUN ["${opts.containerQemuPath}","-execve","/bin/sh","-c","apt-get install something"]
			RUN ["${opts.containerQemuPath}","-execve","/bin/sh","-c","ls -al"]
			` + '\n';

		expect(transpose.transpose(dockerfile, opts)).to.equal(expectedOutput);
	});

	it('should escape double quotes', () => {
		const dockerfile = stripIndents`
			FROM ubuntu
			RUN bash -c "ls -l"
			RUN ["bash", "-c", "echo", "a \\"string\\" with \\"quotes\\""]
			`;

		const expectedOutput =
			stripIndents`
			FROM ubuntu
			COPY ["${opts.hostQemuPath}","${opts.containerQemuPath}"]
			RUN ["${opts.containerQemuPath}","-execve","/bin/sh","-c","bash -c \\"ls -l\\""]
			RUN ["${opts.containerQemuPath}","-execve","/bin/sh","-c","bash -c echo a \\"string\\" with \\"quotes\\""]
			` + '\n';
		expect(transpose.transpose(dockerfile, opts)).to.equal(expectedOutput);
	});

	it('should support multistage dockerfiles', () => {
		const dockerfile = stripIndents`
			FROM ubuntu
			RUN apt-get update
			FROM alpine
			RUN apk add curl
			CMD bash
			`;

		const expectedOutput =
			stripIndents`
			FROM ubuntu
			COPY ["${opts.hostQemuPath}","${opts.containerQemuPath}"]
			RUN ["${opts.containerQemuPath}","-execve","/bin/sh","-c","apt-get update"]
			FROM alpine
			COPY ["${opts.hostQemuPath}","${opts.containerQemuPath}"]
			RUN ["${opts.containerQemuPath}","-execve","/bin/sh","-c","apk add curl"]
			CMD bash
			` + '\n';
		expect(transpose.transpose(dockerfile, opts)).to.equal(expectedOutput);
	});
});

describe('It should support advanced dockerfiles', () => {
	it('should support copy from directives', () => {
		const dockerfile = 'COPY --from=builder src dest';

		const expectedOutput = 'COPY --from=builder ["src","dest"]\n';

		expect(transpose.transpose(dockerfile, opts)).to.equal(expectedOutput);
	});
});

describe('Transpose a tar stream', () => {
	it('should transpose a valid tar stream', () => {
		const expectedOutput =
			stripIndents`
			FROM ubuntu
			COPY ["${opts.hostQemuPath}","${opts.containerQemuPath}"]
			WORKDIR /usr/src/app
			RUN ["${opts.containerQemuPath}","-execve","/bin/sh","-c","touch file && bash -c \\"something\\""]
			RUN ["${opts.containerQemuPath}","-execve","/bin/sh","-c","apt-get update && apt-get install build-essential"]
			CMD bash -c "sleep 12"
			` + '\n';
		// open a tar stream
		const tarStream = fs.createReadStream(
			'./test/emulate/test-files/valid-archive.tar',
		);

		return transpose.transposeTarStream(tarStream, opts).then((stream) => {
			return expect(getDockerfileFromTarStream(stream)).eventually.to.equal(
				expectedOutput,
			);
		});
	});

	it('should transpose a larger tar stream', function () {
		// This tar archive was causing the process to hang. Ensure that it ends.
		return transpose.transposeTarStream(
			fs.createReadStream('./test/emulate/test-files/larger-archive.tar'),
			opts,
		);
	});
});
