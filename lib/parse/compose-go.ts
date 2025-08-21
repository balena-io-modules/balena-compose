// TODO: Replace compose.ts with this file after completion

import { exec as execSync } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

import type {
	Composition,
	Dict,
	Service,
	BuildConfig,
	Network,
	Volume,
} from '../types';

const exec = promisify(execSync);

class ComposeError extends Error {
	// The error level, e.g. "error", "fatal", "panic"
	level: string;
	// The optional error type, e.g. "ParseError", "EncodeError"
	name: string;

	constructor(message: string, level: string, name?: string) {
		super(message);
		this.level = level;
		this.name = name ?? 'ComposeError';
	}
}

/**
 * Parse a compose file using compose-go, and return a normalized composition object
 * @param composeFilePath - Path to the compose file to parse
 * @returns Normalized composition object
 */
export async function parse(composeFilePath: string): Promise<Composition> {
	// Use a random UUID as the project name so it's easy to remove later,
	// as balena doesn't use the project name, but compose-go injects it in several places.
	const projectName = randomUUID();

	// TODO: Is this the final path of the built binary?
	const result = await exec(
		`dist/parse/balena-compose-go ${composeFilePath} ${projectName}`,
	).catch((e) => {
		// If exec error has stdout/stderr, handle them later; otherwise throw immediately
		if (e.stdout !== undefined && e.stderr !== undefined) {
			return e;
		}
		throw e;
	});

	const { stdout, stderr } = result;

	if (stderr) {
		// Compose-go logs warnings to stderr, and we don't need to throw for those. Just ignore them for now.
		/// QUESTION: Should we log warnings to console, throw them for the module consumer to handle, or just ignore them?
		/// For example, "the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion" compose-go log
		/// appears whenever version is specified, and it may be poor UX to throw for that as all balena compose files have required a version until now.
		/// However, there are a bunch of other useful compose-go warnings: https://github.com/search?q=repo%3Acompose-spec%2Fcompose-go%20logrus&type=code
		const errorsOrWarnings = toComposeError(stderr);
		const errors = errorsOrWarnings.filter((e) =>
			['error', 'fatal', 'panic'].includes(e.level),
		);
		// Only throw the first error
		if (errors.length > 0) {
			throw errors[0];
		}
	}

	const parsedResult = JSON.parse(stdout) as {
		success: boolean;
		data: Dict<any>;
	};

	// Normalize raw composition into a balena-acceptable composition
	return normalize(parsedResult.data);
}

/**
 * Convert stderr output from compose-go into a list of ComposeError objects
 * @param stderr - stderr string output from compose-go
 * @returns List of ComposeErrors
 */
function toComposeError(stderr: string): ComposeError[] {
	// TODO: Compose-go logs message strings using logrus, which have a specific format. For example:
	// `time="2025-01-01T01:00:00-07:00" level=warning msg="error message"`
	// These also output to stderr, but not formatted in the same way as the typed errors our Go
	// wrapper outputs. Both formats should be handled.
	const errors: ComposeError[] = [];
	const lines = stderr.split('\n').filter((line) => line.trim() !== '');
	lines.forEach((line) => {
		const match = line.match(/time="[^"]+" level=([a-z]+) msg="([^"]+)"/);
		if (match) {
			// This is an error logged directly from logrus
			errors.push(new ComposeError(match[2], match[1]));
		} else {
			// This is a JSON-formatted error output by our Go wrapper
			const { error } = JSON.parse(line) as {
				success: boolean;
				error: {
					name: string;
					message: string;
				};
			};
			errors.push(new ComposeError(error.message, 'error', error.name));
		}
	});
	return errors;
}

// TODO: Finish normalize as currently no data is actually normalized except project name
function normalize(rawComposition: Dict<any>): Composition {
	const composition: Composition = {
		services: {},
	};

	// Balena doesn't make use of the project name, but it's injected into the
	// names of networks and volumes by compose-go, so must be removed.
	if (rawComposition.name) {
		removeProjectName(rawComposition, rawComposition.name);
	}

	if (rawComposition.services) {
		for (const [serviceName, service] of Object.entries(
			rawComposition.services,
		)) {
			composition.services[serviceName] = normalizeService(
				service as Dict<any>,
			);
		}
	}

	if (rawComposition.networks) {
		composition.networks = {};
		for (const [networkName, network] of Object.entries(
			rawComposition.networks,
		)) {
			composition.networks[networkName] = normalizeNetwork(
				network as Dict<any>,
			);
		}
	}

	if (rawComposition.volumes) {
		composition.volumes = {};
		for (const [volumeName, volume] of Object.entries(rawComposition.volumes)) {
			composition.volumes[volumeName] = normalizeVolume(volume as Dict<any>);
		}
	}

	return composition;
}

/**
 * Remove project name based on top-level `name` key, and any nested values that
 * contain the project name. compose-go injects the project name into the composition
 * in network.name and volume.name (and possibly elsewhere), which aren't used by balena
 * as the Supervisor uses its own naming scheme for networks and volumes.
 * @param obj - Composition object to remove project name from
 * @param projectName - Project name to remove
 */
function removeProjectName(obj: Dict<any>, projectName: string) {
	const stack: Array<Dict<any>> = [obj];

	while (stack.length > 0) {
		const current = stack.pop()!;

		for (const [key, value] of Object.entries(current)) {
			if (typeof value === 'object' && value) {
				stack.push(value);
			} else if (typeof value === 'string' && value.includes(projectName)) {
				delete current[key];
			}
		}
	}
}

function normalizeService(rawService: Dict<any>): Service {
	const service: Service = { ...rawService };

	if (rawService.build) {
		service.build = normalizeServiceBuild(rawService.build);
	}

	return service;
}

function normalizeServiceBuild(rawServiceBuild: Dict<any>): BuildConfig {
	const build: BuildConfig = { ...rawServiceBuild };
	return build;
}

function normalizeNetwork(rawNetwork: Dict<any>): Network {
	const network: Network = { ...rawNetwork };
	return network;
}

function normalizeVolume(rawVolume: Dict<any>): Volume {
	const volume: Volume = { ...rawVolume };
	return volume;
}
