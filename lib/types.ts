// Types from https://docs.docker.com/reference/compose-file/ are the output
// from the compose-go parser, meaning that some inputs have been normalized.

export interface Dict<T> {
	[key: string]: T;
}

// Helper types for schema primitive values, lists and dicts.
export type Value = string | number | null;
export type ByteValue = string;
export type DurationValue = string;
export type ListOrDict<T> = T[] | Dict<T>;
export type StringOrList = string | string[];
export type NonEmpty<T> = keyof T extends never ? never : T;

interface BlkioLimit {
	path?: string;
	rate?: number | ByteValue;
}

interface BlkioWeight {
	path?: string;
	weight?: number;
}

interface ConfigMount {
	source: string;
	target?: string;
	uid?: string;
	gid?: string;
	mode?: number;
}
type Config = ConfigMount;
type Secret = ConfigMount;

interface DependsOnConfig {
	condition: string;
	restart?: boolean;
	required?: boolean;
}

export interface DevicesConfig {
	source: string;
	target: string;
	permissions: string;
}

interface EnvFileConfig {
	path: string;
	required?: boolean;
	format?: string;
}

interface GPUConfig {
	driver?: string;
	count?: number;
	device_ids?: string[];
	options?: Dict<string>;
}

interface LifecycleHook {
	command: string[]; // Normalized from StringOrList
	user?: string;
	privileged?: boolean;
	working_dir?: string;
	environment?: Dict<string>; // Normalized from ListOrDict<string>
}

interface PortConfig {
	name?: string;
	target?: number;
	host_ip?: string;
	published?: string;
	protocol?: string;
	app_protocol?: string;
	mode?: string;
}

interface Ulimit {
	soft: number;
	hard: number;
}

interface ServiceVolumeBase {
	type: string;
	source?: string;
	target?: string;
	read_only?: boolean;
	consistency?: string;
}

interface ServiceBindMount extends ServiceVolumeBase {
	type: 'bind';
	bind: {
		propagation?: string;
		create_host_path?: boolean;
		selinux?: string;
	};
}

interface ServiceVolumeMount extends ServiceVolumeBase {
	type: 'volume';
	volume: {
		nocopy?: boolean;
		subpath?: boolean;
	};
}

interface ServiceTmpfsMount extends ServiceVolumeBase {
	type: 'tmpfs';
	tmpfs: {
		size?: number | ByteValue;
		mode?: number;
	};
}

interface ServiceImageMount extends ServiceVolumeBase {
	type: 'image';
	image: {
		subpath?: string;
	};
}

export type ServiceVolumeConfig =
	| ServiceBindMount
	| ServiceVolumeMount
	| ServiceTmpfsMount
	| ServiceImageMount;

export interface BuildConfig {
	additional_contexts?: Dict<string>; // Normalized from ListOrDict<string>
	args?: Dict<string>; // Normalized from ListOrDict<string>
	context?: string;
	cache_from?: string[];
	cache_to?: string[];
	dockerfile?: string;
	dockerfile_inline?: string;
	entitlements?: string[];
	extra_hosts?: string[]; // Normalized from ListOrDict<string>
	isolation?: string;
	labels?: Dict<string>; // Normalized from ListOrDict<string>
	network?: string;
	no_cache?: boolean;
	platforms?: string[];
	privileged?: boolean;
	pull?: boolean;
	secrets?: Secret[]; // Normalized from Array<string | Secret>
	ssh?: string[];
	shm_size?: number | string;
	tags?: string[];
	target?: string;
	ulimits?: Dict<number | Ulimit>;
}

export interface Service {
	annotations?: Dict<string>; // Normalized from ListOrDict<string>
	attach?: boolean;
	build?: BuildConfig;
	blkio_config?: {
		weight?: number;
		weight_device?: BlkioWeight[];
		device_read_bps?: BlkioLimit[];
		device_write_bps?: BlkioLimit[];
		device_read_iops?: BlkioLimit[];
		device_write_iops?: BlkioLimit[];
	};
	cpu_count?: number;
	cpu_percent?: number;
	cpu_shares?: number | string;
	cpu_period?: number | string;
	cpu_quota?: number | string;
	cpu_rt_runtime?: number | string;
	cpu_rt_period?: number | string;
	cap_add?: string[];
	cap_drop?: string[];
	cpus?: string;
	cpuset?: string;
	cgroup?: string;
	cgroup_parent?: string;
	command?: string[]; // Normalized from StringOrList
	configs?: Config[]; // Normalized from Array<string | Config>
	container_name?: string;
	credential_spec?: Dict<string>;
	depends_on?: string[] | Dict<DependsOnConfig>;
	deploy?: Dict<any>; // Unsupported with no intention to support, therefore `any` is permissible
	develop?: Array<{ watch: any }>; // Unsupported with no current intention to support (as we have livepush) therefore `any` is permissible
	device_cgroup_rules?: string[];
	devices?: string[] | DevicesConfig[];
	dns?: string[]; // Normalized from StringOrList
	dns_opt?: string[];
	dns_search?: string[]; // Normalized from StringOrList
	domainname?: string;
	entrypoint?: string[]; // Normalized from StringOrList
	env_file?: Array<string | EnvFileConfig>; // Normalized from StringOrList | EnvFileConfig[]; Files pointed by this are loaded and vars are folded into `environment`, with `environment` taking precedence
	environment?: Dict<string>; // Normalized from ListOrDict<string>
	expose?: string[];
	// extends?: { file?: string; service: string }; While a field in the raw yaml file, this isn't included in the parsed composition
	external_links?: string[];
	extra_hosts?: string[]; // Normalized from ListOrDict<string>
	gpus?: Array<NonEmpty<GPUConfig>>; // Normalized from 'all' | Array<GPUConfig>
	group_add?: string[]; // Normalized from Array<string | number>
	healthcheck?: NonEmpty<{
		test?: string[]; // Normalized from StringOrList
		disable?: boolean;
		retries?: number;
		interval?: DurationValue;
		start_period?: DurationValue;
		start_interval?: DurationValue;
		timeout?: DurationValue;
	}>;
	hostname?: string;
	image?: string;
	init?: boolean;
	ipc?: string;
	isolation?: string;
	labels?: Dict<string>; // Normalized from ListOrDict<string>
	label_file?: string[]; // Normalized from string | string[]; Files pointed by this are loaded and labels are folded into `labels`, with `labels` taking precedence
	links?: string[];
	logging?: {
		driver?: string;
		options?: Dict<string>; // Normalized from Dict<string | number>
	};
	mac_address?: string;
	mem_limit?: number | ByteValue;
	mem_reservation?: number | ByteValue;
	mem_swappiness?: number;
	memswap_limit?: number | ByteValue;
	network_mode?: string;
	networks?: Dict<null | {
		aliases?: string[];
		driver_opts?: Dict<string>; // Normalized from Dict<string | number>
		interface_name?: string;
		ipv4_address?: string;
		ipv6_address?: string;
		link_local_ips?: string[];
		mac_address?: string;
		gw_priority?: number;
		priority?: number;
	}>; // Normalized from string[] | Dict<{..(same object as above)..}>;
	oom_kill_disable?: boolean;
	oom_score_adj?: number;
	pid?: string;
	pids_limit?: number;
	platform?: string;
	ports?: Array<string | PortConfig>;
	post_start?: LifecycleHook[];
	pre_stop?: LifecycleHook[];
	privileged?: boolean;
	// profiles?: string[]; While a field in the raw yaml file, this isn't included in the parsed composition
	pull_policy?: string;
	read_only?: boolean;
	restart?: string;
	runtime?: string;
	scale?: number;
	secrets?: Secret[]; // Normalized from Array<string | Secret>
	security_opt?: string[];
	shm_size?: number | ByteValue;
	stdin_open?: boolean;
	stop_grace_period?: DurationValue;
	stop_signal?: string;
	storage_opt?: Dict<string>; // Normalized from Dict<any>
	sysctls?: Dict<string>; // Normalized from string[] | Dict<string | number>;
	tmpfs?: string[]; // Normalized from StringOrList
	tty?: boolean;
	ulimits?: Dict<number | Ulimit>;
	user?: string;
	userns_mode?: string;
	uts?: string;
	volumes?: string[] | ServiceVolumeConfig[];
	volumes_from?: string[];
	working_dir?: string;
}

export interface Network {
	driver?: string;
	driver_opts?: Dict<string>; // Normalized from Dict<string | number>
	attachable?: boolean;
	enable_ipv4?: boolean;
	enable_ipv6?: boolean;
	external?: boolean;
	ipam?: {
		driver?: string;
		config?: Array<{
			subnet?: string;
			ip_range?: string;
			gateway?: string;
			aux_addresses?: Dict<string>;
		}>;
		options?: Dict<string>;
	};
	internal?: boolean;
	labels?: Dict<string>; // Normalized from ListOrDict<string>
	name?: string;
}

export interface Volume {
	driver?: string;
	driver_opts?: Dict<string>; // Normalized from Dict<string | number>
	external?: boolean;
	labels?: Dict<string>; // Normalized from ListOrDict<string>
	name?: string;
}

export interface Composition {
	name?: string;
	version?: string;
	services: Dict<Service>;
	networks?: Dict<Network>;
	volumes?: Dict<Volume>;
}

export type ContractObject = {
	type: string;
} & { [key: string]: any };

export interface ImageDescriptor {
	serviceName: string;
	image: string | BuildConfig;
	contract?: ContractObject;
}
