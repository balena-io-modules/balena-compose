// Types for Docker Compose File schema v2.1
// https://docs.docker.com/compose/compose-file/compose-file-v2/

export interface Dict<T> {
	[key: string]: T;
}

// Helper types for schema primitive values, lists and dicts.
export type Value = string | number | null;
export type ByteValue = string;
export type DurationValue = string;
export type ListOfUniqueItems<T> = T[];
export type ListOrDict = ListOfUniqueItems<string> | Dict<Value>;
export type StringOrList = string | ListOfUniqueItems<string>;

export interface BlkioLimit {
	path?: string;
	rate?: number | ByteValue;
}

export interface BlkioWeight {
	path?: string;
	weight?: number;
}

export interface Service {
	blkio_config?: {
		weight?: number;
		weight_device?: BlkioWeight[];
		device_read_bps?: BlkioLimit[];
		device_write_bps?: BlkioLimit[];
		device_read_iops?: BlkioLimit[];
		device_write_iops?: BlkioLimit[];
	};

	build?: BuildConfig;

	image?: string; // either image or build must be specified
	init?: boolean;

	cap_add?: ListOfUniqueItems<string>;
	cap_drop?: ListOfUniqueItems<string>;
	cgroup_parent?: string;

	command?: string | string[];

	container_name?: string;

	cpu_shares?: number | string;
	cpu_quota?: number | string;
	cpu_rt_runtime?: number | string;
	cpu_rt_period?: number | string;
	cpuset?: string;

	depends_on?: ListOfUniqueItems<string>;

	devices?: ListOfUniqueItems<string>;
	device_cgroup_rules?: ListOfUniqueItems<string>;

	dns_opt?: ListOfUniqueItems<string>;
	dns_search?: StringOrList;
	dns?: StringOrList;
	domainname?: string;

	entrypoint?: string | string[];
	env_file?: StringOrList; // files pointed by this are loaded and vars are folded into `environment`
	environment?: Dict<string>;

	expose?: ListOfUniqueItems<string | number>;

	// extends?: string | { file?: string; service: string }; // unsupported for now
	// external_links?: ListOfUniqueItems<string>; // unsupported for now

	extra_hosts?: ListOfUniqueItems<string>;

	healthcheck?: {
		test?: string | string[];
		disable?: boolean;
		retries?: number;
		interval?: DurationValue;
		start_period?: DurationValue;
		timeout?: DurationValue;
	};

	hostname?: string;

	ipc?: string;
	isolation?: string;

	labels?: Dict<string>;

	links?: ListOfUniqueItems<string>;

	logging?: {
		driver?:
			| 'json-file'
			| 'syslog'
			| 'journald'
			| 'gelf'
			| 'fluentd'
			| 'awslogs'
			| 'splunk'
			| 'etwlogs'
			| 'none';
		options?: Dict<any>;
	};

	mac_address?: string;

	mem_limit?: number | ByteValue;
	mem_reservation?: number | ByteValue;
	mem_swappiness?: number;
	memswap_limit?: number | ByteValue;

	network_mode?: string;
	networks?:
		| ListOfUniqueItems<string>
		| Dict<null | {
				aliases?: ListOfUniqueItems<string>;
				ipv4_address?: string;
				ipv6_address?: string;
				link_local_ips?: ListOfUniqueItems<string>;
		  }>; // tslint:disable-line indent

	oom_kill_disable?: boolean;
	oom_score_adj?: number;

	group_add?: ListOfUniqueItems<string | number>;

	pid?: string | null;
	pids_limit?: number | string;

	ports?: ListOfUniqueItems<string>;

	platform?: string;
	privileged?: boolean;
	read_only?: boolean;
	restart?: string;
	runtime?: string;
	scale?: number;
	security_opt?: ListOfUniqueItems<string>;
	stop_grace_period?: DurationValue;
	stop_signal?: string;
	storage_opt?: Dict<any>;
	shm_size?: number | ByteValue;
	sysctls?: ListOrDict;

	stdin_open?: boolean;
	tmpfs?: StringOrList;
	tty?: boolean;

	ulimits?: Dict<
		| number
		| {
				soft: number;
				hard: number;
		  } // tslint:disable-line indent
	>;

	user?: string;
	userns_mode?: string;

	volumes?: ListOfUniqueItems<string>;
	volume_driver?: string;
	volumes_from?: ListOfUniqueItems<string>;

	working_dir?: string;
}

export interface Network {
	driver?: string;
	driver_opts?: Dict<string | number>;
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
	external?: boolean | { name?: string };
	internal?: boolean;
	enable_ipv6?: boolean;
	labels?: Dict<string>;
}

export interface Volume {
	driver?: string;
	driver_opts?: Dict<string | number>;
	external?: boolean | { name: string };
	labels?: Dict<string>;
	name?: string;
}

export interface Composition {
	version: string;
	services: Dict<Service>;
	networks?: Dict<Network>;
	volumes?: Dict<Volume>;
}

export interface BuildConfig {
	args?: Dict<string>;
	cache_from?: ListOfUniqueItems<string>;
	context: string;
	dockerfile?: string;
	extra_hosts?: ListOfUniqueItems<string>;
	isolation?: string;
	labels?: Dict<string>;
	network?: string;
	shm_size?: number | string;
	tag?: string;
	target?: string;
}

export interface ImageDescriptor {
	serviceName: string;
	image: string | BuildConfig;
}
