// TODO: Replace compose.ts with this file after completion

import { exec as execSync } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import * as path from 'path';

import type {
	Composition,
	Dict,
	Service,
	BuildConfig,
	Network,
	Volume,
	DevicesConfig,
	ServiceVolumeConfig,
} from '../types';

const exec = promisify(execSync);

export class ComposeError extends Error {
	// The error level, e.g. "error", "fatal", "panic"
	level: string;
	// The optional error type, e.g. "ParseError", "EncodeError"
	name: string;

	constructor(message: string, level = 'error', name?: string) {
		super(message);
		this.level = level;
		this.name = name ?? 'ComposeError';
	}
}

/**
 * Parse one or more compose files using compose-go, and return a normalized composition object
 * @param composeFilePaths - Path(s) to the compose file(s) to parse. Can be a single string or an array of strings.
 * @returns Normalized composition object
 */
export async function parse(
	composeFilePaths: string | string[],
): Promise<Composition> {
	// Normalize input to always be an array
	const filePaths = Array.isArray(composeFilePaths)
		? composeFilePaths
		: [composeFilePaths];

	// Validate that at least one file path is provided
	if (filePaths.length === 0) {
		throw new ComposeError(
			'At least one compose file path must be provided',
			'error',
			'ArgumentError',
		);
	}

	// Use a random UUID as the project name so it's easy to remove later,
	// as balena doesn't use the project name, but compose-go injects it in several places.
	const projectName = randomUUID();

	// Build the command with -f flags for each file
	const fileFlags = filePaths.map((filePath) => `-f ${filePath}`).join(' ');

	// TODO: Is this the final path of the built binary?
	const result = await exec(
		`dist/parse/balena-compose-go ${fileFlags} ${projectName}`,
		{ env: process.env },
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
		const errors = errorsOrWarnings.filter((e: ComposeError) =>
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
	// Use the first file path as the base for relative path calculations
	return normalize(parsedResult.data, filePaths[0]);
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

function normalize(
	rawComposition: Dict<any>,
	composeFilePath: string,
): Composition {
	const composition: Composition = {
		services: {},
	};

	// Balena doesn't make use of the project name, but it's injected into the
	// names of networks and volumes by compose-go, so must be removed.
	if (rawComposition.name) {
		removeProjectName(rawComposition, rawComposition.name);
	}

	// Reject top-level secrets & configs
	if (rawComposition.secrets || rawComposition.configs) {
		throw new ComposeError(
			'Top-level secrets and/or configs are not supported',
			'error',
			'ValidationError',
		);
	}

	if (rawComposition.services) {
		for (const [serviceName, service] of Object.entries(
			rawComposition.services,
		)) {
			composition.services[serviceName] = normalizeService(
				service as Dict<any>,
				composeFilePath,
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

export const SERVICE_CONFIG_DENY_LIST = [
	'blkio_config',
	'configs',
	// QUESTION: Currently, we ignore container_name and log that it was ignored on the Supervisor, should we reject this here instead as it's earlier?
	// This is a fairly common setting in user compose files
	'container_name',
	'cpu_count',
	'cpu_percent',
	'cpu_period',
	// 'cpu_quota', // TODO: Currently supported, but should remove support as kernel 6.6+ does not use CFS which this configures
	'credential_spec',
	'deploy',
	'develop',
	'external_links',
	'gpus',
	'isolation',
	'links',
	'logging',
	'mem_swappiness',
	'memswap_limit',
	'oom_kill_disable',
	'platform',
	// TODO: Currently compose-go does not include a service with profiles set if they're not specified in COMPOSE_PROFILES,
	// so a composition with profiles doesn't actually reject as the profiles are not added to the parsed compose by compose-go.
	// We should support profiles which will involve modifying this code, but in dedicated shaping + building cycles.
	// 'profiles',
	'pull_policy',
	'runtime',
	'scale',
	'secrets',
	'stdin_open',
	'storage_opt',
];

const OOM_SCORE_ADJ_WARN_THRESHOLD = -900;

const bindMountByLabel: Array<[string, string[]]> = [
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

const allowedBindMounts = bindMountByLabel.flatMap(
	([_, appliedBindMounts]) => appliedBindMounts,
);

function normalizeService(
	rawService: Dict<any>,
	composeFilePath: string,
): Service {
	const service: Service = { ...rawService };

	// Reject if unsupported fields are present
	for (const field of SERVICE_CONFIG_DENY_LIST) {
		if (field in service) {
			throw new ComposeError(
				`service.${field} is not allowed`,
				'error',
				'ValidationError',
			);
		}
	}

	if (rawService.build) {
		service.build = normalizeServiceBuild(rawService.build, composeFilePath);
	}

	// Reject if io.balena.private namespace is used for labels
	if (service.labels) {
		rejectNamespacedLabels(service.labels);
	}

	// Reject network_mode:container:${containerId} as we don't support this
	if (service.network_mode?.match(/^container:.*$/)) {
		throw new ComposeError(
			'service.network_mode container:${containerId} is not allowed',
			'error',
			'ValidationError',
		);
	}

	// Reject pid:container:${containerId} as we don't support this
	if (service.pid?.match(/^container:.*$/)) {
		throw new ComposeError(
			'service.pid container:${containerId} is not allowed',
			'error',
			'ValidationError',
		);
	}

	// Reject all security_opt settings except no-new-privileges
	if (service.security_opt?.some((opt) => !opt.match('no-new-privileges'))) {
		throw new ComposeError(
			'Only no-new-privileges is allowed for service.security_opt',
			'error',
			'ValidationError',
		);
	}

	// Reject volumes_from which references container:${containerId}
	if (service.volumes_from?.some((v) => v.match(/^container:.*$/))) {
		throw new ComposeError(
			'service.volumes_from which references a containerId is not allowed',
			'error',
			'ValidationError',
		);
	}

	// Remove null entrypoint
	/// compose-go adds `entrypoint: null` if entrypoint is unspecified.
	/// In docker-compose, this means that the default entrypoint from the image is used, but in
	/// balena, it overrides any ENTRYPOINT directive in the Dockerfile.
	/// See: https://docs.docker.com/reference/compose-file/services/#entrypoint
	if (service.entrypoint === null) {
		delete service.entrypoint;
	}

	// Convert long syntax ports to short syntax
	/// compose-go converts all port definitions to long syntax, however legacy Supervisors don't support this.
	/// TODO: Support this in Helios
	if (service.ports) {
		service.ports = longToShortSyntaxPorts(service.ports);
	}

	// Convert long syntax depends_on to short syntax
	/// compose-go converts all depends_on definitions to long syntax, however legacy Supervisors don't support this.
	/// TODO: Support this in Helios
	if (service.depends_on) {
		service.depends_on = longToShortSyntaxDependsOn(service.depends_on);
	}

	// Convert long syntax devices to short syntax
	/// compose-go converts all devices definitions to long syntax, however legacy Supervisors don't support this.
	/// TODO: Support this in Helios
	if (service.devices) {
		service.devices = longToShortSyntaxDevices(
			service.devices as DevicesConfig[],
		);
	}

	if (service.volumes) {
		// At this point, service.volumes hasn't been converted to string[] so it's safe to cast to ServiceVolumeConfig[]
		const v = service.volumes as ServiceVolumeConfig[];

		// Convert allowed bind mounts to labels
		const labels = allowedBindMountsToLabels(v);

		if (labels.length > 0) {
			service.labels = {
				...service.labels,
				...Object.fromEntries(labels.map((label) => [label, '1'])),
			};
		}

		// Convert long syntax volumes to short syntax
		/// compose-go converts all volumes definitions to long syntax, however legacy Supervisors don't support this.
		/// TODO: Support this in Helios
		const shortSyntaxVolumes = longToShortSyntaxVolumes(v);
		if (shortSyntaxVolumes.length > 0) {
			service.volumes = shortSyntaxVolumes;
		} else {
			delete service.volumes;
		}
	}

	// Add image as build tag if present
	if (service.image && service.build) {
		service.build.tags = [...(service.build.tags ?? []), service.image];
	}

	// Delete env_file, as compose-go adds env_file vars to service.environment
	delete service.env_file;

	// Delete label_file, as compose-go adds label_file labels to service.labels
	delete service.label_file;

	// Warn that expose is informational only
	if (service.expose) {
		console.warn(
			'service.expose is informational only. Removing from the composition',
		);
		delete service.expose;
	}

	// Warn of risks of breaking device functionality with oom_score_adj <= OOM_SCORE_ADJ_WARN_THRESHOLD
	if (
		service.oom_score_adj &&
		service.oom_score_adj <= OOM_SCORE_ADJ_WARN_THRESHOLD
	) {
		console.warn(
			`service.oom_score_adj values under ${OOM_SCORE_ADJ_WARN_THRESHOLD} may break device functionality`,
		);
	}

	return service;
}

export const BUILD_CONFIG_DENY_LIST = [
	'additional_contexts',
	'cache_to',
	'dockerfile_inline',
	'entitlements',
	'isolation',
	'no_cache',
	'platforms',
	'privileged',
	'pull',
	'secrets',
	'ssh',
	'tags',
	'ulimits',
];

function normalizeServiceBuild(
	rawServiceBuild: Dict<any>,
	composeFilePath: string,
): BuildConfig {
	const build: BuildConfig = { ...rawServiceBuild };

	// Reject if unsupported fields are present
	for (const field of BUILD_CONFIG_DENY_LIST) {
		if (field in build) {
			throw new ComposeError(
				`service.build.${field} is not allowed`,
				'error',
				'ValidationError',
			);
		}
	}

	// Reject if io.balena.private namespace is used for labels
	if (build.labels) {
		rejectNamespacedLabels(build.labels);
	}

	// Convert absolute context paths to relative paths
	/// compose-go converts relative context to absolute, but the existing image build methods
	/// in balena-compose rely on relative paths.
	if (build.context) {
		/// Reject if remote context (ends with .git) as we don't currently support this
		if (build.context.endsWith('.git')) {
			throw new ComposeError(
				`service.build.context cannot be a remote context`,
				'error',
				'ValidationError',
			);
		}

		build.context =
			path.relative(path.dirname(composeFilePath), build.context) || '.';
	}
	return build;
}

function rejectNamespacedLabels(labels: Dict<any>) {
	for (const [key] of Object.entries(labels)) {
		if (key.startsWith('io.balena.private')) {
			throw new ComposeError(
				`labels cannot use the "io.balena.private" namespace`,
				'error',
				'ValidationError',
			);
		}
	}
}

function longToShortSyntaxPorts(
	ports: NonNullable<Service['ports']>,
): string[] {
	const shortSyntaxPorts: string[] = [];

	for (const port of ports) {
		if (typeof port === 'string') {
			shortSyntaxPorts.push(port);
		} else if (typeof port === 'object') {
			// All long syntax configs are convertible to short syntax,
			// but some fields in long syntax are ignored if present:
			// - name: ignored as it doesn't serve a purpose in the service besides documentation
			// - app_protocol: ignored
			// - mode: ignored as we don't support Swarm features
			// See: https://docs.docker.com/reference/compose-file/services/#long-syntax-4
			shortSyntaxPorts.push(
				(port.host_ip ? `${port.host_ip}:` : '') +
					`${port.published}:${port.target}` +
					// Only include protocol if it's not default (not TCP)
					(port.protocol !== 'tcp' ? `/${port.protocol}` : ''),
			);
		}
	}

	return shortSyntaxPorts;
}

function longToShortSyntaxDependsOn(
	dependsOn: NonNullable<Service['depends_on']>,
): string[] {
	const shortSyntaxDependsOn: string[] = [];

	for (const [serviceName, dependsOnConfig] of Object.entries(dependsOn)) {
		// Some dependsOnConfigs are not convertible to short syntax, and may define a different depends_on behavior
		// than the short syntax default. We don't support long syntax depends_on in legacy Supervisors, so warn for now
		// and convert to short syntax although the dependency behavior is slightly different.
		// Short syntax depends_on is equivalent to long syntax condition: service_started and required: true
		if (
			dependsOnConfig.condition !== 'service_started' ||
			dependsOnConfig.required !== true ||
			dependsOnConfig.restart !== undefined
		) {
			console.warn(
				`Long syntax depends_on ${JSON.stringify(dependsOnConfig)} for service "${serviceName}" or a definition that generates a long syntax depends_on config is not yet supported, using short syntax to express dependency`,
			);
		}

		// If required is false, the service is optional, so we don't need to express a dependency
		// TODO: Compose warns if service isn't started or available if required=false. Supervisor will need to warn once it supports long syntax depends_on.
		if (dependsOnConfig.required !== false) {
			shortSyntaxDependsOn.push(serviceName);
		}
	}

	return shortSyntaxDependsOn;
}

function longToShortSyntaxDevices(
	devices: NonNullable<DevicesConfig[]>,
): string[] {
	const shortSyntaxDevices: string[] = [];
	const CDIRegex = new RegExp('^(?!/)');

	for (const deviceConfig of devices) {
		// Reject if CDI syntax is used, we don't intend to support this
		if (
			CDIRegex.test(deviceConfig.source) ||
			CDIRegex.test(deviceConfig.target)
		) {
			throw new ComposeError(
				`devices config with CDI syntax is not allowed`,
				'error',
				'ValidationError',
			);
		}

		shortSyntaxDevices.push(
			`${deviceConfig.source}:${deviceConfig.target}:${deviceConfig.permissions}`,
		);
	}

	return shortSyntaxDevices;
}

function allowedBindMountsToLabels(volumes: ServiceVolumeConfig[]): string[] {
	const labels: string[] = [];
	bindMountByLabel.forEach(([label, appliedBindMounts]) => {
		// EVERY bind mount associated with the label must be present for the label to be applied,
		// except in the case of balena-engine label which only requires one of either bind mount
		if (
			appliedBindMounts.every((m) =>
				volumes.some((v) => v.source && v.source === m),
			)
		) {
			labels.push(label);
		}
	});
	return labels;
}

function longToShortSyntaxVolumes(volumes: ServiceVolumeConfig[]): string[] {
	const shortSyntaxVolumes: string[] = [];

	for (const v of volumes) {
		// Ignore allowed bind mounts as they're converted to labels separately
		if (v.source && allowedBindMounts.includes(v.source)) {
			continue;
		}

		// Reject volumes of type bind, image, npipe, or cluster
		if (['bind', 'image', 'npipe', 'cluster'].includes(v.type)) {
			throw new ComposeError(
				`service.volumes cannot be of type "${v.type}"`,
				'error',
				'ValidationError',
			);
		}

		// Reject volumes if options are specified that can't be converted to short syntax
		const isLongSyntaxTmpfs =
			v.type === 'tmpfs' && v.tmpfs && Object.keys(v.tmpfs).length > 0;
		const isLongSyntaxVolume =
			v.type === 'volume' && v.volume && Object.keys(v.volume).length > 0;
		if (isLongSyntaxTmpfs || isLongSyntaxVolume) {
			throw new ComposeError(
				`long syntax service.volumes are not supported`,
				'error',
				'ValidationError',
			);
		}

		shortSyntaxVolumes.push(
			`${v.source}:${v.target}${v.read_only ? ':ro' : ''}`,
		);
	}

	return shortSyntaxVolumes;
}

export const NETWORK_CONFIG_DENY_LIST = ['attachable', 'external', 'name'];

function normalizeNetwork(rawNetwork: Dict<any>): Network {
	const network: Network = { ...rawNetwork };

	// Reject if unsupported fields are present
	for (const field of NETWORK_CONFIG_DENY_LIST) {
		if (field in network) {
			throw new ComposeError(
				`network.${field} is not allowed`,
				'error',
				'ValidationError',
			);
		}
	}

	// Reject if driver is not bridge
	if (network.driver && !['bridge', 'default'].includes(network.driver)) {
		throw new ComposeError(
			`Only "bridge" and "default" are supported for network.driver, got "${network.driver}"`,
			'error',
			'ValidationError',
		);
	}

	// Reject if `io.balena.private` namespace is used for labels
	if (network.labels) {
		rejectNamespacedLabels(network.labels);
	}

	// Warn if com.docker.network.bridge.name driver_opts is present as it may interfere with device firewall
	if (network.driver_opts?.['com.docker.network.bridge.name']) {
		console.warn(
			'com.docker.network.bridge.name network.driver_opt may interfere with device firewall',
		);
	}

	return network;
}

export const VOLUME_CONFIG_DENY_LIST = ['external', 'name'];

function normalizeVolume(rawVolume: Dict<any>): Volume {
	const volume: Volume = { ...rawVolume };

	// Reject if non-local driver is used
	if (volume.driver && !['local', 'default'].includes(volume.driver)) {
		throw new ComposeError(
			`Only "local" and "default" are supported for volume.driver, got "${volume.driver}"`,
			'error',
			'ValidationError',
		);
	}

	// Reject if unsupported fields are present
	for (const field of VOLUME_CONFIG_DENY_LIST) {
		if (field in volume) {
			throw new ComposeError(
				`volume.${field} is not allowed`,
				'error',
				'ValidationError',
			);
		}
	}

	// Reject if `io.balena.private` namespace is used for labels
	if (volume.labels) {
		rejectNamespacedLabels(volume.labels);
	}

	return volume;
}
