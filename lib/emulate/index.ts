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

import * as parser from 'docker-file-parser';
import * as jsesc from 'jsesc';
import * as _ from 'lodash';
import * as tar from 'tar-stream';
import { normalizeTarEntry } from 'tar-utils';

/**
 * TransposeOptions:
 * Options to be passed to the transpose module
 */
export interface TransposeOptions {
	/**
	 * hostQemuPath: the path of the qemu binary on the host
	 */
	hostQemuPath: string;

	/**
	 * containerQemuPath: Where to add the qemu binary on-container
	 */
	containerQemuPath: string;

	/**
	 * Optional file mode (permission) to assign to the Qemu executable,
	 * e.g. 0o555. Useful on Windows, when Unix-like permissions are lost.
	 */
	qemuFileMode?: number;
}

interface Command extends Pick<parser.CommandEntry, 'name' | 'args'> {}

type CommandTransposer = (
	options: TransposeOptions,
	command: Command,
) => Command;

const generateQemuCopy = (options: TransposeOptions): Command => {
	return {
		name: 'COPY',
		args: [options.hostQemuPath, options.containerQemuPath],
	};
};

const processArgString = (argString: string) => {
	return jsesc(argString, { quotes: 'double' });
};

const transposeArrayRun = (
	options: TransposeOptions,
	command: Command,
): Command => {
	const args = (command.args as string[]).map(processArgString).join(' ');
	return {
		name: 'RUN',
		args: [options.containerQemuPath, '-execve', '/bin/sh', '-c'].concat(args),
	};
};

const transposeStringRun = (
	options: TransposeOptions,
	command: Command,
): Command => {
	const processed = processArgString(command.args as string);
	return {
		name: 'RUN',
		args: [options.containerQemuPath, '-execve', '/bin/sh', '-c'].concat([
			processed,
		]),
	};
};

const transposeRun = (options: TransposeOptions, command: Command): Command => {
	if (_.isArray(command.args)) {
		return transposeArrayRun(options, command);
	}
	return transposeStringRun(options, command);
};

const identity = (_options: TransposeOptions, command: Command): Command => {
	return command;
};

const commandToTranspose = (command: Command): CommandTransposer => {
	if (command.name === 'RUN') {
		return transposeRun;
	}
	return identity;
};

const spaceSeparatedArrayCommands = ['ARG', 'EXPOSE'];

const argsToString = (
	args: string | { [key: string]: string } | string[],
	commandName: string,
): string => {
	if (_.isArray(args)) {
		let ret = '';
		// Handle command meta-arguments (like --from=stage)
		if (args[0] != null && args[0].startsWith('--')) {
			ret += args[0] + ' ';
			args = args.slice(1);
		}
		if (spaceSeparatedArrayCommands.includes(commandName)) {
			return ret + args.join(' ');
		}
		return ret + '["' + (args as string[]).join('","') + '"]';
	} else if (_.isObject(args)) {
		return _.map(args, (value: string, key: string) => {
			const escapedValue = JSON.stringify(value);
			return `${key}=${escapedValue}`;
		}).join(' ');
	} else {
		return args as string;
	}
};

const commandsToDockerfile = (commands: Command[]): string => {
	let dockerfile = '';

	commands.map((command) => {
		dockerfile += `${command.name} ${argsToString(
			command.args,
			command.name,
		)}\n`;
	});
	return dockerfile;
};

/**
 * transpose:
 * Given a string representing a dockerfile, transpose it to use qemu
 * rather than native, to enable emulated builds
 *
 * @param dockerfile A string representing the dockerfile
 * @param options Options to use when doing the transposing
 */
export function transpose(
	dockerfile: string,
	options: TransposeOptions,
): string {
	// parse the Dokerfile
	const commands = parser.parse(dockerfile, { includeComments: false });

	const outCommands: Command[] = [];
	const copyCommand = generateQemuCopy(options);
	commands.forEach((c) => {
		if (c.name === 'FROM') {
			outCommands.push(c);
			outCommands.push(copyCommand);
		} else {
			outCommands.push(commandToTranspose(c)(options, c));
		}
	});

	return commandsToDockerfile(outCommands);
}

const getTarEntryHandler = (
	pack: tar.Pack,
	dockerfileName: string,
	opts: TransposeOptions,
) => {
	const streamToPromise = require('stream-to-promise');
	return (
		header: tar.Headers,
		stream: NodeJS.ReadableStream,
		next: (err?: Error) => void,
	) => {
		streamToPromise(stream)
			.then((buffer: Buffer) => {
				const name = normalizeTarEntry(header.name);
				if (name === dockerfileName) {
					const newDockerfile = transpose(buffer.toString(), opts);
					pack.entry({ name: dockerfileName }, newDockerfile);
				} else {
					if (name === opts.hostQemuPath && opts.qemuFileMode) {
						header.mode = opts.qemuFileMode;
					}
					pack.entry(header, buffer);
				}
				next();
			})
			.catch(next);
	};
};

/**
 * transposeTarStream: Given a tar stream, this function will extract
 * the files, transpose the Dockerfile using the transpose function,
 * and then re-tar the original contents and the new Dockerfile, and
 * return a new tarStream
 */
export function transposeTarStream(
	tarStream: NodeJS.ReadableStream,
	options: TransposeOptions,
	dockerfileName: string = 'Dockerfile',
) {
	const extract = tar.extract();
	const pack = tar.pack();

	return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
		pack.on('error', reject);
		extract.on('error', reject);
		extract.on('entry', getTarEntryHandler(pack, dockerfileName, options));

		extract.on('finish', () => {
			pack.finalize();
			resolve(pack);
		});

		tarStream.pipe(extract);
	});
}

/**
 * getBuildThroughStream: Get a through stream, which when piped to will remove all
 * extra output that is added as a result of this module transposing a Dockerfile.
 *
 * This function enables 'silent' emulated builds, with the only difference in output
 * from a native build being that there is an extra COPY step, where the emulator is
 * added to the container
 */
export function getBuildThroughStream(
	opts: TransposeOptions,
): NodeJS.ReadWriteStream {
	const es = require('event-stream');
	// Regex to match against 'Step 1/5:', 'Step 1/5 :' 'Step 1:' 'Step 1 :'
	// and all lower case versions.
	const stepLineRegex = /^(?:step)\s\d+(?:\/\d+)?\s?:/i;
	const isStepLine = (str: string) => stepLineRegex.test(str);

	// Function to strip the string matched with the regex above
	const stripStepPrefix = (data: string): string => {
		return data.substr(data.indexOf(':') + 1);
	};

	// Regex to match against the type of command, e.g. FROM, RUN, COPY
	const stepCommandRegex = /^\s?(\w+)(:?\s)/i;
	const getStepCommand = (str: string): string => {
		const match = stepCommandRegex.exec(str);
		if (match != null) {
			return match[1].toUpperCase();
		} else {
			return '';
		}
	};

	// Regex to remove extra flags which this module adds in
	const replaceRegexString = _.escapeRegExp(
		`${opts.containerQemuPath} -execve /bin/sh -c `,
	);
	const replaceRegex = new RegExp(replaceRegexString, 'i');
	const replaceQemuLine = (data: string): string => {
		return data.replace(replaceRegex, '');
	};

	return es.pipe(
		es.mapSync(function (data: string | Buffer) {
			data = data.toString();

			if (isStepLine(data) && getStepCommand(stripStepPrefix(data)) === 'RUN') {
				data = replaceQemuLine(data);
			}
			return data;
		}),
		es.join('\n'),
	);
}
