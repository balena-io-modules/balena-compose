import type { Readable } from 'stream';
import * as _ from 'lodash';
import * as path from 'path';

import {
	InternalInconsistencyError,
	ServiceError,
	ValidationError,
} from './errors';
import {
	DEFAULT_SCHEMA_VERSION,
	SchemaError,
	SchemaVersion,
	validate,
} from './schemas';
import type {
	BuildConfig,
	Composition,
	Dict,
	ImageDescriptor,
	ListOrDict,
	Network,
	Service,
	StringOrList,
	Volume,
} from './types';

export function defaultComposition(
	image?: string,
	dockerfile?: string,
): string {
	let context: string;
	if (image) {
		context = `image: ${image}`;
	} else {
		if (dockerfile) {
			context = `build: {context: ".", dockerfile: "${dockerfile}"}`;
		} else {
			context = 'build: "."';
		}
	}
	return `# This file has been auto-generated.
version: '${DEFAULT_SCHEMA_VERSION}'
networks: {}
volumes:
  resin-data: {}
services:
  main:
    ${context}
    privileged: true
    tty: true
    restart: always
    network_mode: host
    volumes:
      - type: volume
        source: resin-data
        target: /data
    labels:
      io.resin.features.kernel-modules: 1
      io.resin.features.firmware: 1
      io.resin.features.dbus: 1
      io.resin.features.supervisor-api: 1
      io.resin.features.resin-api: 1
`;
}

/**
 * Validates, normalises and returns the input composition. If the composition
 * does not have the expected structure and discrepancies can't be resolved,
 * validation errors are thrown. The input composition is mutated in-place.
 *
 * @param inputCompositionObject The input composition as a plain JS object
 */
export function normalize(inputCompositionObject: any): Composition;

/**
 * Validates, normalises and returns the input composition. If the composition
 * does not have the expected structure and discrepancies can't be resolved,
 * validation errors are thrown. The input composition is mutated in-place.
 *
 * The context for the composition is the project directory which contains the composition
 * and describes additional context for the composition. E.g. environment varialbe files
 * This context is read and expanded into the composition.
 *
 * To access this context (files) a callback function fileResolverCb is needed as argument,
 * that reads a filePath:string and creates an promisfied Readable from this file.
 * Callback has to validate that no symbolic links are used outside project folder.
 * Using on filesystem files it should call fs.realpath to validate the filePath.
 * Using a tar archive which contains the file should add additional validation for
 * the file resinding in the archive (e.g. symbolic links by default are references in
 * tar archives)
 *
 * Drops env_file propertie from composition to indicate that the expand has taken place.
 *
 * @param inputCompositionObject The input composition as a plain JS object
 * @param fileResolverCb Callback to access filePath and returning a Readable
 * Callback tries to read the filePath as file and create a Readable for it.
 */
export async function normalize(
	inputCompositionObject: any,
	fileResolverCb: (path: string) => Promise<Readable>,
): Promise<Composition>;
export function normalize(
	inputCompositionObject: any,
	fileResolverCb?: (path: string) => Promise<Readable>,
): Composition | Promise<Composition> {
	if (fileResolverCb === undefined) {
		return normalizeObjectToComposition(inputCompositionObject);
	} else {
		const composition = normalizeObjectToComposition(inputCompositionObject);
		return expandContext(composition, fileResolverCb);
	}
}

function normalizeObjectToComposition(
	inputCompositionObject: any,
): Composition {
	if (
		inputCompositionObject == null &&
		typeof inputCompositionObject !== 'object'
	) {
		throw new ValidationError('Invalid composition format');
	}

	let version: SchemaVersion;
	let c = inputCompositionObject as {
		version: any;
		[key: string]: any;
	};

	if (c.version == null) {
		version = SchemaVersion.v1;
	} else {
		if (typeof c.version !== 'string') {
			c.version = `${c.version}`;
		}
		switch (c.version) {
			case '2':
			case '2.0':
			case '2.1':
			case '2.2':
			case '2.3':
			case '2.4':
				version = DEFAULT_SCHEMA_VERSION;
				break;
			default:
				throw new ValidationError('Unsupported composition version');
		}
	}

	preflight(version, c);

	try {
		validate(version, c);
	} catch (e) {
		if (e instanceof SchemaError) {
			throw new ValidationError(e);
		}
		throw e;
	}

	switch (version) {
		case SchemaVersion.v1:
			// FIXME: perform attribute migration
			c = { version: DEFAULT_SCHEMA_VERSION, services: c };
		// eslint-disable-next-line no-fallthrough
		case DEFAULT_SCHEMA_VERSION: {
			// Normalise volumes
			if (c.volumes) {
				c.volumes = _.mapValues(c.volumes, normalizeVolume);
			}

			// Normalise networks
			if (c.networks) {
				c.networks = _.mapValues(c.networks, normalizeNetwork);
			}

			// Normalise services
			const services: Dict<any> = c.services || {};
			const serviceNames = Object.keys(services ?? {});
			const volumeNames = Object.keys(c.volumes ?? {});
			const networkNames = Object.keys(c.networks ?? {});

			c.services = _(services)
				.map((service, serviceName) => {
					try {
						const normalizedService = normalizeService(
							service,
							serviceNames,
							volumeNames,
							networkNames,
						);
						return [serviceName, normalizedService];
					} catch (err) {
						if (err instanceof ValidationError) {
							throw new ServiceError(serviceName, err);
						}
						throw err;
					}
				})
				.fromPairs()
				.value();
		}
	}

	c.version = DEFAULT_SCHEMA_VERSION;
	return c as Composition;
}

function preflight(_version: SchemaVersion, data: any) {
	// Convert `null` networks to empty objects
	if (data.networks != null && typeof data.networks === 'object') {
		data.networks = _.mapValues(data.networks, (n) => n || {});
	}

	// Convert `null` volumes to empty objects
	if (data.volumes != null && typeof data.volumes === 'object') {
		data.volumes = _.mapValues(data.volumes, (v) => v || {});
	}
}

function normalizeService(
	service: any,
	serviceNames: string[],
	volumeNames: string[],
	networkNames: string[],
): Service {
	if (!service.image && !service.build) {
		throw new ValidationError('You must specify either an image or a build');
	}

	if (service.build) {
		service.build = normalizeServiceBuild(service.build, networkNames);
	}

	if (service.depends_on) {
		if (!Array.isArray(service.depends_on)) {
			// Try to convert long-form into list-of-strings
			service.depends_on = _.map(service.depends_on, (dep, serviceName) => {
				if (['service_started', 'service-started'].includes(dep.condition)) {
					return serviceName;
				}
				throw new ValidationError(
					'Only "service_started" type of service dependency is supported',
				);
			});
		}
		if (_.uniq(service.depends_on).length !== service.depends_on.length) {
			throw new ValidationError('Service dependencies must be unique');
		}
		_.forEach(service.depends_on, (dep) => {
			if (!serviceNames.includes(dep)) {
				throw new ValidationError(`Unknown service dependency: ${dep}`);
			}
		});
	}

	if (service.environment) {
		service.environment = normalizeKeyValuePairs(service.environment);
	}

	if (service.env_file) {
		service.env_file = normalizeAndValidateFilePath(service.env_file);
	}

	if (service.extra_hosts) {
		if (!Array.isArray(service.extra_hosts)) {
			// At this point we know that the extra_hosts entry is an object, so cast to
			// keep TS happy
			service.extra_hosts = normalizeExtraHostObject(
				service.extra_hosts as any,
			);
		}
	}

	if (service.labels) {
		service.labels = normalizeKeyValuePairs(service.labels);
		validateLabels(service.labels);
	}

	if (service.ports) {
		service.ports = normalizeArrayOfStrings(service.ports);
	}

	if (service.volumes) {
		const [volumes, tmpfs, labels] = normalizeServiceVolumes(
			service.volumes,
			volumeNames,
		);
		service.volumes = volumes;
		if (service.tmpfs) {
			if (typeof service.tmpfs === 'string') {
				service.tmpfs = [service.tmpfs].concat(tmpfs);
			} else {
				service.tmpfs = service.tmpfs.concat(tmpfs);
			}
		}
		if (labels.length > 0) {
			service.labels = {
				...labels.reduce((o, l) => ({ ...o, [l]: 1 }), {}),
				...service.labels,
			};
		}
	}

	if (service.scale) {
		throw new ValidationError('service.scale is not allowed');
	}

	return service;
}

function normalizeArrayOfStrings(value: any[]): string[] {
	return value.map(String);
}

function normalizeServiceBuild(
	serviceBuild: any,
	networkNames: string[],
): BuildConfig {
	if (typeof serviceBuild === 'string') {
		serviceBuild = { context: serviceBuild };
	}
	if (serviceBuild.args) {
		serviceBuild.args = normalizeKeyValuePairs(serviceBuild.args);
	}
	if (serviceBuild.labels) {
		serviceBuild.labels = normalizeKeyValuePairs(serviceBuild.labels);
		validateLabels(serviceBuild.labels);
	}
	if (serviceBuild.extra_hosts && !Array.isArray(serviceBuild.extra_hosts)) {
		serviceBuild.extra_hosts = normalizeExtraHostObject(
			serviceBuild.extra_hosts as any,
		);
	}
	if (serviceBuild.isolation) {
		throw new ValidationError('service.build.isolation is not allowed');
	}
	if (
		serviceBuild.network &&
		serviceBuild.network !== 'host' &&
		serviceBuild.network !== 'none'
	) {
		if (networkNames.indexOf(serviceBuild.network) === -1) {
			throw new ValidationError(
				`Missing network definition for '${serviceBuild.network}'`,
			);
		}
	}
	return serviceBuild;
}

function normalizeServiceVolumes(
	serviceVolumes: any[],
	volumeNames: string[],
): [string[], string[], string[]] {
	const tmpfs: string[] = [];
	const volumes: string[] = [];
	const mounts: string[] = [];
	const labels: string[] = [];
	serviceVolumes.forEach((volume) => {
		const ref = normalizeServiceVolume(volume);
		validateServiceVolume(ref, volumeNames);
		switch (ref.type) {
			case 'bind':
				mounts.push(ref.source!);
				break;

			case 'tmpfs':
				if (ref.target) {
					tmpfs.push(ref.target);
				}
				break;

			case 'volume':
				volumes.push(
					`${ref.source}:${ref.target}${ref.read_only ? ':ro' : ''}`,
				);
				break;
		}
	});
	appliedBindMountsByLabel.forEach(([label, appliedBindMounts]) => {
		if (_.every(appliedBindMounts, (m) => mounts.indexOf(m) !== -1)) {
			labels.push(label);
		}
	});
	return [volumes, tmpfs, labels];
}

interface VolumeRef {
	type: string;
	source?: string;
	target?: string;
	read_only?: boolean;
	bind?: {
		propagation?: string;
	};
	volume?: {
		nocopy?: boolean;
	};
	tmpfs?: {
		size?: number;
	};
}

const appliedBindMountsByLabel: Array<[string, string[]]> = [
	['io.balena.features.balena-socket', ['/var/run/docker.sock']],
	['io.balena.features.balena-socket', ['/var/run/balena-engine.sock']],
	['io.balena.features.dbus', ['/run/dbus']],
	['io.balena.features.sysfs', ['/sys']],
	['io.balena.features.procfs', ['/proc']],
	['io.balena.features.kernel-modules', ['/lib/modules']],
	['io.balena.features.firmware', ['/lib/firmware']],
	[
		'io.balena.features.journal-logs',
		['/var/log/journal', '/run/log/journal', '/etc/machine-id'],
	],
];

const allowedBindMounts = _.flatMap(appliedBindMountsByLabel, (b) => b[1]);

function normalizeServiceVolume(serviceVolume: any): VolumeRef {
	let ref: VolumeRef = { type: 'volume', read_only: false };
	if (typeof serviceVolume === 'string') {
		const parts = serviceVolume.split(':');
		if (parts.length < 2) {
			throw new ValidationError(`Invalid volume: '${serviceVolume}'`);
		}
		ref.source = parts[0];
		ref.target = parts[1];
		if (path.parse(ref.source).dir !== '') {
			ref.type = 'bind';
		}
		if (parts[2] === 'ro') {
			ref.read_only = true;
		}
	} else {
		ref = serviceVolume;
	}
	return ref;
}

function validateServiceVolume(
	serviceVolume: VolumeRef,
	volumeNames: string[],
) {
	switch (serviceVolume.type) {
		case 'bind':
			if (!serviceVolume.source) {
				throw new ValidationError('Missing bind mount source');
			}
			if (!serviceVolume.target) {
				throw new ValidationError('Missing bind mount target');
			}
			if (allowedBindMounts.indexOf(serviceVolume.source) === -1) {
				// not a well-known bind mount but an arbitrary one
				throw new ValidationError('Bind mounts are not allowed');
			}
			break;

		case 'tmpfs':
			if (serviceVolume.source) {
				throw new ValidationError('Tmpfs mount can not have a source');
			}
			if (!serviceVolume.target) {
				throw new ValidationError('Tmpfs mount missing target');
			}
			if (serviceVolume.read_only) {
				throw new ValidationError('Tmpfs can not be read only');
			}
			if (serviceVolume.tmpfs) {
				throw new ValidationError('Tmpfs options are not allowed');
			}
			break;

		case 'volume':
			if (!serviceVolume.source) {
				throw new ValidationError('Missing volume source');
			}
			if (volumeNames.indexOf(serviceVolume.source) === -1) {
				throw new ValidationError(
					`Missing volume definition for '${serviceVolume.source}'`,
				);
			}
			if (serviceVolume.volume) {
				throw new ValidationError('Volume options are not allowed');
			}
			break;
	}
}

function validateLabels(labels: Dict<string>) {
	Object.keys(labels ?? {}).forEach((name) => {
		if (!/^[!#-&(-_a-~]+$/.test(name)) {
			throw new ValidationError(
				`Invalid label name: "${name}". ` +
					'Label names may contain printable ASCII characters' +
					'except space, single/double quotes and backtick',
			);
		}
	});
}

function normalizeNetwork(network: Network): Network {
	if (network.labels) {
		network.labels = normalizeKeyValuePairs(network.labels);
		validateLabels(network.labels);
	}
	return network;
}

function normalizeVolume(volume: Volume): Volume {
	if (volume.labels) {
		volume.labels = normalizeKeyValuePairs(volume.labels);
		validateLabels(volume.labels);
	}
	return volume;
}

function normalizeExtraHostObject(extraHostsObject: Dict<string>): string[] {
	return _.map(extraHostsObject, (ip, host) => `${host}:${ip}`);
}

/**
 * Parses a composition and returns a list of image descriptors that can
 * be used to pull or build a service image. The given composition version
 * must be equal to `DEFAULT_SCHEMA_VERSION`, or an exception is thrown.
 * Normalise the composition before passing it to this function.
 */
export function parse(c: Composition): ImageDescriptor[] {
	if (c.version !== DEFAULT_SCHEMA_VERSION) {
		throw new Error('Unsupported composition version');
	}
	return _.toPairs(c.services).map(([name, service]) => {
		return createImageDescriptor(name, service);
	});
}

function createImageDescriptor(
	serviceName: string,
	service: Service,
): ImageDescriptor {
	if (service.image && !service.build) {
		return { serviceName, image: service.image };
	}

	if (!service.build) {
		// should not get here
		throw new InternalInconsistencyError();
	}

	const build: BuildConfig = service.build;

	// TODO(robertgzr): could probably move this into normalizeServiceBuild
	if (service.image) {
		build.tag = service.image;
	}

	return { serviceName, image: build };
}

function normalizeKeyValuePairs(
	obj?: ListOrDict,
	sep: string = '=',
): Dict<string> {
	if (!obj) {
		return {};
	}
	if (!Array.isArray(obj)) {
		return _(obj)
			.toPairs()
			.map(([key, value]) => {
				return [key, value ? ('' + value).trim() : ''];
			})
			.fromPairs()
			.value();
	}
	return _(obj)
		.map((val) => {
			const parts = val.split(sep);
			return [parts.shift()!, parts.join('=')];
		})
		.map(([key, value]) => {
			return [key.trim(), value ? value.trim() : ''];
		})
		.fromPairs()
		.value();
}

function normalizeAndValidateFilePath(envFile: StringOrList): StringOrList {
	// use a set to store only unique normalized file paths
	const normalizedEnvFilePaths: Set<string> = new Set();
	if (!Array.isArray(envFile)) {
		envFile = [envFile];
	}
	for (let envFilePath of envFile) {
		envFilePath = path.normalize(envFilePath);
		if (path.isAbsolute(envFilePath)) {
			throw new ValidationError(
				`Absolute filepath not allowed: ${envFilePath}`,
			);
		}
		if (envFilePath.startsWith('..')) {
			throw new ValidationError(
				`Directory traversing not allowed : ${envFilePath}`,
			);
		}
		if (envFilePath.includes('*')) {
			throw new ValidationError(`Wildcards not allowed : ${envFilePath}`);
		}
		normalizedEnvFilePaths.add(envFilePath);
	}
	// spread set and return as array
	return [...normalizedEnvFilePaths];
}

async function expandContext(
	composition: Composition,
	fileResolverCb: (path: string) => Promise<Readable>,
): Promise<Composition> {
	// read all env_file delcared file paths from the composition
	const expandedEnvironmentFiles: Dict<Dict<string>> =
		await readEnvFilesFromComposition(composition, fileResolverCb);
	// assign all normalized envrionment variables to the services in the composition
	assignExpandedEnvFilesToComposition(composition, expandedEnvironmentFiles);
	return composition;
}

async function readEnvFilesFromComposition(
	composition: Composition,
	fileResolverCb: (path: string) => Promise<Readable>,
): Promise<Dict<Dict<string>>> {
	const envFileVariables: Dict<Dict<string>> = {};
	for (const service of Object.values(composition.services)) {
		let envFilePaths = service.env_file;
		if (envFilePaths) {
			if (!Array.isArray(envFilePaths)) {
				envFilePaths = [envFilePaths];
			}
			for (const envFilePath of envFilePaths) {
				if (!(envFilePath in envFileVariables)) {
					envFileVariables[envFilePath] = await readAndNormalizeExpandEnvFile(
						envFilePath,
						fileResolverCb,
					);
				}
			}
		}
	}
	return envFileVariables;
}

function assignExpandedEnvFilesToComposition(
	composition: Composition,
	envFileVariables: Dict<Dict<string>>,
): Composition {
	// Apply all read env_files content to the services referncing the env_files
	for (const service of Object.values(composition.services)) {
		let envFilePaths = service.env_file;
		if (envFilePaths) {
			service.environment = service.environment ?? {};
			if (!Array.isArray(envFilePaths)) {
				envFilePaths = [envFilePaths];
			}
			for (const envFilePath of envFilePaths) {
				for (const [key, value] of Object.entries(
					envFileVariables[envFilePath],
				)) {
					if (!(key in service.environment)) {
						service.environment[key] = value;
					}
				}
			}
		}
		// delete the env_file property as it has been translated into composition environments
		delete service.env_file;
	}
	return composition;
}

async function readAndNormalizeExpandEnvFile(
	envFile: string,
	fileResolverCb: (path: string) => Promise<Readable>,
): Promise<Dict<string>> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const readline = require('readline');
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { once } = require('events');
	const intermediateEnv: Dict<string> = {};
	let readableError;

	// instantiate readable from callback to add eventlistener to it
	const readable = await fileResolverCb(envFile);
	const lineReader = readline.createInterface({
		input: readable,
		crlfDelay: Infinity,
	});

	// get error from  stream reader and close linereader
	// no race condition as the lineReader is paused until an event listener is registered
	readable.on('error', (readError) => {
		readableError = readError;
		lineReader.close();
	});

	// process each line on event
	// now readable will be evaluated
	// read all lines in a buffer dictionary to later merge them into existing environment
	lineReader.on('line', (line: string) => {
		for (const [key, val] of Object.entries(normalizeKeyValuePairs([line]))) {
			intermediateEnv[key] = val;
		}
	});

	// wait until all lines read or stream error occured
	await once(lineReader, 'close');

	// populate stream errors
	if (readableError !== undefined) {
		throw readableError;
	}

	return intermediateEnv;
}
