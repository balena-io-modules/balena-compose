// Types for Docker Compose specification v2
// See: https://docs.docker.com/reference/compose-file/
// We should probably use Dockerode types but it doesn't look like there's
// a 1-to-1 correlation between compose spec fields & Dockerode fields.
// Nor do Dockerode-Compose types match the compose spec.

export interface Dict<T> {
	[key: string]: T;
}

// Helper types for schema primitive values, lists and dicts.
export type Value = string | number | null;
export type ByteValue = string;
export type DurationValue = string;
export type ListOrDict<T> = Array<T> | Dict<T>;
export type StringOrList = string | Array<string>;

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
};
type Config = ConfigMount;
type Secret = ConfigMount;
	
interface DependsOnConfig {
	condition?: string;
	restart?: boolean;
	required?: boolean;
};

interface EnvFileConfig {
	path: string;
	required: boolean;
	format?: string;
};

interface LifecycleHook {
	command: StringOrList;
	user?: string;
	privileged?: boolean;
	working_dir?: string;
	environment?: ListOrDict<string>;
}

interface Port {
	target?: number;
	host_ip?: string;
	published?: string;
	protocol?: string;
	app_protocol?: string;
	mode?: string;
};

interface Ulimit {
	soft: number;
	hard: number;
}

interface ServiceVolumeBase {
	type: string;
	source?: string;
	target?: string;
	read_only?: boolean;
	consistency?: any;
};

interface ServiceBindMount extends ServiceVolumeBase {
	type: 'bind';
	bind: {
		propagation?: string;
		create_host_path?: boolean;
		selinux?: string;
	};
};

interface ServiceVolumeMount extends ServiceVolumeBase {
	type: 'volume';
	volume: {
		nocopy?: boolean;
		subpath?: boolean;
	};
};

interface ServiceTmpfsMount extends ServiceVolumeBase {
	type: 'tmpfs';
	tmpfs: {
		size?: number | ByteValue;
		mode?: number;
	};
};

interface ServiceImageMount extends ServiceVolumeBase {
	type: 'image';
	image: {
		subpath?: string;
	};
};

type ServiceVolumeConfig = ServiceBindMount | ServiceVolumeMount | ServiceTmpfsMount | ServiceImageMount;

export interface BuildConfig {
	additional_contexts?: ListOrDict<string>;
	args?: ListOrDict<string>;
	context?: string;
	cache_from?: Array<string>;
	cache_to?: Array<string>;
	dockerfile?: string;
	dockerfile_inline?: string;
	entitlements?: Array<string>;
	extra_hosts?: ListOrDict<string>;
	isolation?: string; // Unsupported but typed so we can reject gracefully
	labels?: ListOrDict<string>;
	network?: string; // Unsupported but typed so we can reject gracefully
	no_cache?: boolean;
	platforms?: Array<string>;
	privileged?: boolean;
	pull?: boolean;
	secrets?: Array<string | Secret>;
	ssh?: Array<string>;
	shm_size?: number | string;
	tags?: Array<string>;
	target?: string;
	ulimits?: Dict<number | Ulimit>;
}

export interface Service {
	annotations?: ListOrDict<string>;
	attach?: boolean;
	build?: BuildConfig;
	blkio_config?: { // Unsupported but typed so we can reject gracefully
		weight?: number;
		weight_device?: BlkioWeight[];
		device_read_bps?: BlkioLimit[];
		device_write_bps?: BlkioLimit[];
		device_read_iops?: BlkioLimit[];
		device_write_iops?: BlkioLimit[];
	};
	cpu_count?: number; // Unsupported but typed so we can reject gracefully
	cpu_percent?: number; // Unsupported but typed so we can reject gracefully
	cpu_shares?: number | string;
	cpu_period?: number | string;
	cpu_quota?: number | string;
	cpu_rt_runtime?: number | string;
	cpu_rt_period?: number | string;
	cap_add?: Array<string>;
	cap_drop?: Array<string>;
	cpus?: string; // Unsupported but typed so we can reject gracefully
	cpuset?: string;
	cgroup?: string;
	cgroup_parent?: string;
	command?: StringOrList;
	configs?: Array<string | Config>; // Unsupported but typed so we can reject gracefully
	container_name?: string; // Unsupported but typed so we can reject gracefully
	credential_spec?: Dict<string>; // Unsupported but typed so we can reject gracefully
	depends_on?: Array<string | DependsOnConfig>;
	deploy?: Dict<any>; // Unsupported but typed so we can reject gracefully
	develop?: Array<{ watch: any }>; // Unsupported but typed so we can reject gracefully
	device_cgroup_rules?: Array<string>;
	devices?: Array<string>;
	dns?: StringOrList;
	dns_opt?: Array<string>;
	dns_search?: StringOrList;
	domainname?: string;
	driver_opts?: Dict<string>;
	entrypoint?: StringOrList;
	env_file?: StringOrList | Array<EnvFileConfig>; // files pointed by this are loaded and vars are folded into `environment`
	environment?: ListOrDict<string>;
	expose?: number | Array<string | number>;
	extends?: { file?: string; service: string };
	external_links?: Array<string>; // Unsupported but typed so we can reject gracefully
	extra_hosts?: ListOrDict<string>;
	gpus?: string | { driver: string; count: number }; // Unsupported but typed so we can reject gracefully
	group_add?: Array<string | number>;
	healthcheck?: {
		test?: StringOrList;
		disable?: boolean;
		retries?: number;
		interval?: DurationValue;
		start_period?: DurationValue;
		start_interval?: DurationValue;
		timeout?: DurationValue;
	};
	hostname?: string;
	image?: string;
	init?: boolean;
	ipc?: string;
	isolation?: string;
	labels?: ListOrDict<string>;
	label_file?: string | Array<string>;
	links?: Array<string>;
	logging?: {
		driver?: string;
		options?: Dict<string>;
	};
	mac_address?: string;
	mem_limit?: number | ByteValue;
	mem_reservation?: number | ByteValue;
	mem_swappiness?: number;
	memswap_limit?: number | ByteValue;
	models?: ListOrDict<string>; // Unsupported but typed so we can reject gracefully
	network_mode?: string;
	networks?:
		| Array<string>
		| Dict<{
				aliases?: Array<string>;
				driver_opts?: Dict<string>;
				interface_name?: string;
				ipv4_address?: string;
				ipv6_address?: string;
				link_local_ips?: Array<string>;
				mac_address?: string;
				gw_priority?: number;
				priority?: number;
			}>;
	oom_kill_disable?: boolean;
	oom_score_adj?: number;
	pid?: string;
	pids_limit?: number;
	platform?: string;
	ports?: Array<string | Port>;
	post_start?: Array<LifecycleHook>;
	pre_stop?: Array<LifecycleHook>;
	privileged?: boolean;
	profiles?: Array<string>;
	provider?: {
		type: string;
		options?: Dict<string>;
	}; // Unsupported but typed so we can reject gracefully
	pull_policy?: string; // Unsupported but typed so we can reject gracefully
	read_only?: boolean;
	restart?: string;
	runtime?: string;
	scale?: number;
	secrets?: Array<string | Secret>; // Unsupported but typed so we can reject gracefully
	security_opt?: Array<string>;
	shm_size?: number | ByteValue;
	stdin_open?: boolean;
	stop_grace_period?: DurationValue;
	stop_signal?: string;
	storage_opt?: Dict<any>;
	sysctls?: Array<string> | Dict<string | number>;
	tmpfs?: StringOrList;
	tty?: boolean;
	ulimits?: Dict<number | Ulimit>;
	use_api_socket?: boolean;
	user?: string;
	userns_mode?: string;
	uts?: string;
	volumes?: ServiceVolumeConfig;
	volume_driver?: string;
	volumes_from?: Array<string>;
	working_dir?: string;
}

export interface Network {
	driver?: string;
	driver_opts?: Dict<string | number>;
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
	labels?: ListOrDict<string>;
	name?: string; // Unsupported but typed so we can reject gracefully
}

export interface Volume {
	driver?: string;
	driver_opts?: Dict<string | number>;
	external?: boolean;
	labels?: ListOrDict<string>;
	name?: string; // Unsupported but typed so we can reject gracefully
}

export interface Composition {
	name?: string; // Unsupported but typed so we can reject gracefully
	version: string;
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
