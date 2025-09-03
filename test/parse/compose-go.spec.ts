import { expect } from 'chai';
import type { SinonStub } from 'sinon';
import { stub } from 'sinon';

import {
	parse,
	BUILD_CONFIG_DENY_LIST,
	SERVICE_CONFIG_DENY_LIST,
	NETWORK_CONFIG_DENY_LIST,
	VOLUME_CONFIG_DENY_LIST,
} from '../../lib/parse/compose-go';
import {
	ComposeError,
	ServiceError,
	ValidationError,
} from '../../lib/parse/errors';

describe('compose-go parsing & validation', () => {
	it('should parse a simple compose file', async () => {
		const composition = await parse('test/parse/fixtures/compose/simple.yml');
		expect(composition.services).to.be.an('object');
		expect(composition.networks).to.be.an('object');
		expect(composition.volumes).to.be.an('object');
	});

	it('should remove project name and version from composition', async () => {
		const composition = await parse('test/parse/fixtures/compose/name.yml');
		// `name` is not used by balena
		expect(composition.name).to.be.undefined;
		// `version` is deprecated
		expect(composition.version).to.be.undefined;
	});

	it('should normalize a simple compose file', async () => {
		const composition = await parse('test/parse/fixtures/compose/simple.yml');
		expect(composition).to.deep.equal({
			services: {
				web: {
					image: 'nginx:latest',
					command: ['nginx', '-g', 'daemon off;'],
					ports: ['80:80'],
					networks: {
						'my-network': null,
					},
					volumes: ['my-volume:/var/www/html'],
				},
			},
			networks: {
				'my-network': {
					ipam: {},
				},
			},
			volumes: {
				'my-volume': {},
			},
		});
	});

	it('should reject top-level secrets', async () => {
		try {
			await parse('test/parse/fixtures/compose/secrets.yml');
			expect.fail('Expected compose parser to reject top-level secrets');
		} catch (error) {
			expect(error).to.be.instanceOf(ComposeError);
			expect(error.message).to.equal(
				'Top-level secrets and/or configs are not supported',
			);
		}
	});

	it('should reject top-level configs', async () => {
		try {
			await parse('test/parse/fixtures/compose/configs.yml');
			expect.fail('Expected compose parser to reject top-level configs');
		} catch (error) {
			expect(error).to.be.instanceOf(ComposeError);
			expect(error.message).to.equal(
				'Top-level secrets and/or configs are not supported',
			);
		}
	});

	describe('services', () => {
		let warnStub: SinonStub;

		beforeEach(() => {
			warnStub = stub(console, 'warn');
		});

		afterEach(() => {
			warnStub.restore();
		});

		it('should normalize a service config with all supported fields, including fields with multiple allowed syntaxes', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/full.yml',
			);

			expect(warnStub.callCount).to.equal(1);
			expect(warnStub.firstCall.args[0]).to.equal(
				'service.expose is informational only. Removing from the composition',
			);

			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						annotations: {
							'com.example.annotation': 'value',
						},
						attach: false,
						cgroup: 'host',
						cpu_rt_runtime: 100000,
						cpu_rt_period: 100000,
						cpus: 0.5,
						cpuset: '0-2',
						depends_on: ['one'],
						device_cgroup_rules: ['c 1:3 mr', 'a 7:* rmw'],
						devices: ['/dev/sda:/dev/sda:rwm', '/dev/sdb:/dev/sdb:r'],
						dns: ['8.8.8.8'],
						dns_opt: ['use-vc', 'no-tld-query'],
						dns_search: ['balena.io', 'balenadev.io'],
						domainname: 'balenatest.io',
						entrypoint: ['/bin/sh', '-c', 'sleep infinity'],
						environment: {
							ENV_TEST: 'true',
						},
						extra_hosts: ['host1=127.0.0.1', 'host2=127.0.0.2'],
						group_add: ['mail', '1111'],
						healthcheck: {
							test: ['CMD', 'curl', '-f', 'http://localhost:8080'],
							interval: '30s',
							timeout: '10s',
							retries: 3,
							start_period: '40s',
							start_interval: '10s',
						},
						hostname: 'balena',
						init: true,
						ipc: 'service:one',
						labels: {
							'com.example.label': 'value',
							'com.example.label2': 'value2',
						},
						mac_address: '02:42:ac:11:00:02',
						mem_limit: '1073741824',
						mem_reservation: '536870912',
						networks: {
							default: null,
						},
						pids_limit: 50,
						post_start: [
							{
								command: ['./do_something_on_startup.sh'],
								environment: {
									FOO: 'BAR1',
								},
								working_dir: '/app',
								user: 'root',
								privileged: true,
							},
						],
						pre_stop: [
							{
								command: ['./do_something_on_shutdown.sh'],
								environment: {
									FOO: 'BAR2',
								},
								working_dir: '/app',
								user: 'root',
								privileged: true,
							},
						],
						privileged: true,
						read_only: true,
						security_opt: ['no-new-privileges'],
						shm_size: '1073741824',
						stop_grace_period: '3s',
						stop_signal: 'SIGUSR1',
						sysctls: {
							'net.ipv4.ip_forward': '1',
							'kernel.msgmax': '65536',
						},
						tmpfs: ['/data:mode=755,uid=1009,gid=1009', '/run'],
						tty: true,
						ulimits: {
							noproc: 65535,
							nofile: {
								soft: 20000,
								hard: 40000,
							},
						},
						user: 'balena',
						userns_mode: 'host',
						uts: 'host',
					},
					one: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						annotations: {
							'com.example.annotation2': 'value2',
						},
						dns: ['8.8.8.8', '8.8.4.4'],
						entrypoint: [
							'php',
							'-d',
							'zend_extension=/usr/local/lib/php/extensions/no-debug-non-zts-20100525/xdebug.so',
							'-d',
							'memory_limit=-1',
							'vendor/bin/phpunit',
						],
						environment: {
							ENV_TEST_2: 'true',
						},
						extra_hosts: ['host3=127.0.0.3', 'host4=127.0.0.4'],
						ipc: 'shareable',
						labels: {
							'com.example.label3': 'value3',
							'com.example.label4': 'value4',
						},
						networks: {
							default: null,
						},
						pids_limit: -1,
						shm_size: '1073741824',
						sysctls: {
							'net.ipv4.ip_forward': '1',
							'kernel.msgmax': '65536',
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should reject forbidden service config fields', async () => {
			for (const field of SERVICE_CONFIG_DENY_LIST) {
				try {
					await parse(
						`test/parse/fixtures/compose/services/unsupported/${field}.yml`,
					);
					expect.fail(`Expected compose parser to reject service.${field}`);
				} catch (error) {
					// Top-level secrets and configs are rejected earlier so have a different error message
					if (['secrets', 'configs'].includes(field)) {
						expect(error).to.be.instanceOf(ComposeError);
						expect(error.message).to.equal(
							'Top-level secrets and/or configs are not supported',
						);
					} else {
						expect(error).to.be.instanceOf(ServiceError);
						expect(error.message).to.equal(`service.${field} is not allowed`);
						expect(error.serviceName).to.equal('main');
					}
				}
			}
		});

		it('should reject io.balena.private namespace in labels', async () => {
			try {
				await parse('test/parse/fixtures/compose/services/label_namespace.yml');
				expect.fail(
					'Expected compose parser to reject io.balena.private namespace in labels',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.message).to.equal(
					'labels cannot use the "io.balena.private" namespace',
				);
				expect(error.serviceName).to.equal('main');
			}
		});

		it('should warn on long syntax depends_on config', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/depends_on_long_syntax.yml',
			);
			expect(warnStub.callCount).to.equal(3);
			expect(warnStub.firstCall.args[0]).to.equal(
				'Long syntax depends_on {"condition":"service_healthy","restart":true,"required":true} for service "db" or a definition that generates a long syntax depends_on config is not yet supported, using short syntax to express dependency',
			);
			expect(warnStub.secondCall.args[0]).to.equal(
				'Long syntax depends_on {"condition":"service_completed_successfully","required":true} for service "main" or a definition that generates a long syntax depends_on config is not yet supported, using short syntax to express dependency',
			);
			expect(warnStub.thirdCall.args[0]).to.equal(
				'Long syntax depends_on {"condition":"service_started","required":false} for service "redis" or a definition that generates a long syntax depends_on config is not yet supported, using short syntax to express dependency',
			);

			expect(composition).to.deep.equal({
				services: {
					web: {
						image: 'alpine:latest',
						command: null,
						depends_on: ['db', 'main'],
						networks: {
							default: null,
						},
					},
					db: {
						image: 'postgres',
						command: null,
						networks: {
							default: null,
						},
					},
					redis: {
						image: 'redis',
						command: null,
						networks: {
							default: null,
						},
					},
					main: {
						image: 'alpine:latest',
						command: null,
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should reject devices config with CDI syntax', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/devices_cdi_syntax.yml',
				);
				expect.fail(
					'Expected compose parser to reject devices config with CDI syntax',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.message).to.equal(
					'devices config with CDI syntax is not allowed',
				);
				expect(error.serviceName).to.equal('main');
			}
		});

		it('should read from env_file and combine with environment config in environment -> env_file resolution order', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/env_file.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						environment: {
							ENV: 'value',
							ENV_B: 'test',
							ENV_ONE: '1',
							ENV_TO_OVERRIDE: 'overridden',
							ENV_TWO: 'true',
							// These two vars are set in .env.a and .env.b, but them being unset in services.environment
							// overrides them as environment takes precedence over env_file
							UNSET_A: '',
							UNSET_B: '',
						},
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should merge services from extends config', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/extends.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					common: {
						image: 'busybox',
						environment: {
							PORT: '80',
							TZ: 'utc',
						},
						command: null,
						networks: {
							default: null,
						},
					},
					cli: {
						image: 'busybox',
						environment: {
							PORT: '8080',
							TZ: 'utc',
						},
						command: null,
						networks: {
							default: null,
						},
					},
					web: {
						image: 'nginx:latest',
						environment: {
							ENV_TEST: 'overridden',
							ENV_TEST_2: 'true',
						},
						command: null,
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should error if extends references a nonexistent file', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/extends_nonexistent.yml',
				);
				expect.fail(
					'Expected compose parser to error if extends references a nonexistent file',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.match(
					/Failed to parse compose file: .*extends_nonexistent_file\.yml: no such file or directory/,
				);
			}
		});

		it('should inject a service dependency if ipc:service:${serviceName} is defined', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/ipc.yml',
			);

			expect(warnStub.callCount).to.equal(1);
			expect(warnStub.firstCall.args[0]).to.equal(
				'Long syntax depends_on {"condition":"service_started","restart":true,"required":true} for service "one" or a definition that generates a long syntax depends_on config is not yet supported, using short syntax to express dependency',
			);

			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						ipc: 'service:one',
						depends_on: ['one'],
						networks: {
							default: null,
						},
					},
					one: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should read from label_file and combine with labels config in labels -> label_file resolution order', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/label_file.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						labels: {
							'io.balena.label': 'overridden',
							'io.balena.test.a': 'true',
							'io.balena.test.b': 'true',
						},
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should inject a service dependency if network_mode:service:${serviceName} is defined', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/network_mode.yml',
			);

			expect(warnStub.callCount).to.equal(1);
			expect(warnStub.firstCall.args[0]).to.equal(
				'Long syntax depends_on {"condition":"service_started","restart":true,"required":true} for service "main" or a definition that generates a long syntax depends_on config is not yet supported, using short syntax to express dependency',
			);

			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						network_mode: 'host',
					},
					one: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						network_mode: 'none',
					},
					two: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						network_mode: 'service:main',
						depends_on: ['main'],
					},
				},
			});
		});

		it('should reject network_mode:container:${containerId}', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/network_mode_container.yml',
				);
				expect.fail(
					'Expected compose parser to reject network_mode:container:${containerId}',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('main');
				expect(error.message).to.equal(
					'service.network_mode container:${containerId} is not allowed',
				);
			}
		});

		it('should normalize networks config', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/networks.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						networks: {
							net: null,
						},
					},
					one: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						networks: {
							net: {
								aliases: ['net1'],
								interface_name: 'eth0',
								ipv4_address: '10.0.0.2',
								ipv6_address: '2001:db8::2',
								link_local_ips: ['169.254.1.2', '169.254.1.3'],
								mac_address: '02:42:ac:11:00:02',
								driver_opts: {
									foo: 'bar',
									baz: '1',
								},
								gw_priority: 1,
								priority: 2,
							},
						},
					},
				},
				networks: {
					net: {
						driver: 'bridge',
						ipam: {
							config: [
								{
									subnet: '10.0.0.0/24',
									gateway: '10.0.0.1',
								},
								{
									subnet: '2001:db8::/64',
									gateway: '2001:db8::1',
								},
							],
						},
					},
				},
			});
		});

		it('should warn of oom_score_adj values under -900', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/oom_score_adj.yml',
			);
			expect(warnStub.callCount).to.equal(1);
			expect(warnStub.firstCall.args[0]).to.equal(
				`service.oom_score_adj values under -900 may break device functionality`,
			);

			expect(composition).to.deep.equal({
				services: {
					one: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						oom_score_adj: -900,
						networks: {
							default: null,
						},
					},
					two: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						oom_score_adj: 1000,
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should inject a service dependency if pid:service:${serviceName} is defined', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/pid.yml',
			);

			expect(warnStub.callCount).to.equal(1);
			expect(warnStub.firstCall.args[0]).to.equal(
				'Long syntax depends_on {"condition":"service_started","restart":true,"required":true} for service "one" or a definition that generates a long syntax depends_on config is not yet supported, using short syntax to express dependency',
			);

			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						pid: 'service:one',
						depends_on: ['one'],
						networks: {
							default: null,
						},
					},
					one: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						networks: {
							default: null,
						},
					},
					host: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						pid: 'host',
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should reject pid:container:${containerId}', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/pid_container.yml',
				);
				expect.fail(
					'Expected compose parser to reject pid:container:${containerId}',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('main');
				expect(error.message).to.equal(
					'service.pid container:${containerId} is not allowed',
				);
			}
		});

		it('should normalize port definitions to short syntax', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/ports.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						ports: ['8080:8080', '8081:8081'],
						networks: {
							default: null,
						},
					},
					long: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						ports: ['127.0.0.1:9090:9090', '127.0.0.2:9091:9091/udp'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should parse restart policy', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/restart.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						restart: 'always',
						networks: {
							default: null,
						},
					},
					one: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						restart: 'on-failure',
						networks: {
							default: null,
						},
					},
					two: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						restart: 'no',
						networks: {
							default: null,
						},
					},
					three: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						restart: 'unless-stopped',
						networks: {
							default: null,
						},
					},
					four: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						restart: 'on-failure:3',
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should reject all security_opt settings except no-new-privileges', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/security_opt_unsupported.yml',
				);
				expect.fail(
					'Expected compose parser to reject security_opt settings except no-new-privileges',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('main');
				expect(error.message).to.equal(
					'Only no-new-privileges is allowed for service.security_opt',
				);
			}
		});

		it('should reject volumes of type bind', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volume_bind.yml',
				);
				expect.fail('Expected compose parser to reject volumes of type bind');
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('main');
				expect(error.message).to.equal(
					'service.volumes cannot be of type "bind"',
				);
			}
		});

		it('should reject volumes of type bind with relative paths', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volume_bind_relative.yml',
				);
				expect.fail(
					'Expected compose parser to reject volumes of type bind with relative paths',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'service.volumes cannot be of type "bind"',
				);
			}
		});

		it('should reject volumes of type bind with relative paths', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volume_bind_relative.yml',
				);
				expect.fail(
					'Expected compose parser to reject volumes of type bind with relative paths',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'service.volumes cannot be of type "bind"',
				);
			}
		});

		it('should reject volumes of type image', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volume_image.yml',
				);
				expect.fail('Expected compose parser to reject volumes of type image');
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('main');
				expect(error.message).to.equal(
					'service.volumes cannot be of type "image"',
				);
			}
		});

		it('should reject volumes of type npipe', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volume_npipe.yml',
				);
				expect.fail('Expected compose parser to reject volumes of type npipe');
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('main');
				expect(error.message).to.equal(
					'service.volumes cannot be of type "npipe"',
				);
			}
		});

		it('should reject volumes of type cluster', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volume_cluster.yml',
				);
				expect.fail(
					'Expected compose parser to reject volumes of type cluster',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('main');
				expect(error.message).to.equal(
					'service.volumes cannot be of type "cluster"',
				);
			}
		});

		it('should reject invalid volume definitions', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volume_invalid.yml',
				);
				expect.fail(
					'Expected compose parser to reject invalid volume definitions',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.message).to.equal(
					'service.volumes {"type":"volume","target":"thisIsNotAValidVolume","volume":{}} must specify source and target',
				);
				expect(error.serviceName).to.equal('main');
			}
		});

		it('should reject a composition where a volume definition is missing in top-level volumes', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volume_missing.yml',
				);
				expect.fail(
					'Expected compose parser to reject a composition where a volume definition is missing in top-level volumes',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'Failed to parse compose file: service "main" refers to undefined volume thisIsNotAValidVolume: invalid compose project',
				);
			}
		});

		it('should convert allowed bind mounts to labels', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/volumes_allowed_bind_mount.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						labels: {
							'io.balena.features.balena-socket': '1',
							'io.balena.features.dbus': '1',
							'io.balena.features.sysfs': '1',
							'io.balena.features.procfs': '1',
							'io.balena.features.kernel-modules': '1',
							'io.balena.features.firmware': '1',
							'io.balena.features.journal-logs': '1',
						},
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		// QUESTION: This is balena-compose's current behavior, should we loosen the requirements?
		it('should not convert allowed bind mounts to labels if not all bind mounts associated with label are present', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/volumes_allowed_bind_mount_partial.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						networks: {
							default: null,
						},
						labels: {
							// balena-socket only requires that one of either bind mount be present
							'io.balena.features.balena-socket': '1',
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should normalize service volumes to short syntax', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/volumes.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						volumes: ['vol1:/data', 'vol2:/run:ro', 'vol3:/app'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
				volumes: {
					vol1: {},
					vol2: {},
					vol3: {},
				},
			});
		});

		it('should reject if service volume of type volume defines volume options', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/build/unsupported/volume_options.yml',
				);
				expect.fail(
					'Expected compose parser to reject if service volume of type volume defines volume options',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.message).to.equal(
					'long syntax service.volumes are not supported',
				);
			}
		});

		it('should reject if service volume of type tmpfs defines tmpfs options', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/build/unsupported/tmpfs_options.yml',
				);
				expect.fail(
					'Expected compose parser to reject if service volume of type tmpfs defines tmpfs options',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.message).to.equal(
					'long syntax service.volumes are not supported',
				);
			}
		});

		// QUESTION: This isn't currently supported in SV but balena-compose allows it,
		// should we continue to allow it?
		it('should allow short syntax tmpfs options', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/build/unsupported/tmpfs_short_syntax_options.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						tmpfs: ['/tmp:mode=755,uid=1000,gid=1000,size=100m'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should inject a service dependency if volumes_from is defined', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/volumes_from.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					one: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						volumes_from: ['two:ro'],
						depends_on: ['two'],
						networks: {
							default: null,
						},
					},
					two: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						volumes: ['test:/test'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
				volumes: {
					test: {},
				},
			});
		});

		it('should reject volumes_from which references container:${containerId}', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/services/unsupported/volumes_from_container.yml',
				);
				expect.fail(
					'Expected compose parser to reject volumes_from which references container:${containerId}',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('one');
				expect(error.message).to.equal(
					'service.volumes_from which references a containerId is not allowed',
				);
			}
		});

		it('should add image as build tag if present', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/services/image_build.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						build: {
							context: '.',
							dockerfile: 'Dockerfile',
							tags: ['alpine:latest'],
						},
						command: ['sh', '-c', 'sleep infinity'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});
	});

	describe('service.build', () => {
		it('should normalize service build config', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/build/supported_fields.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						build: {
							context: '.',
							dockerfile: 'Dockerfile',
							args: {
								ARG2: 'value2',
							},
							cache_from: ['my_cache', 'my_cache2'],
							extra_hosts: ['host1=127.0.0.1', 'host2=127.0.0.2'],
							labels: {
								'com.example.label': 'value',
								'com.example.label2': 'value2',
							},
							network: 'build_net',
							shm_size: '1073741824',
							target: 'my_target',
						},
						command: ['sleep', 'infinity'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					build_net: {
						ipam: {},
					},
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should normalize service build context paths', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/build/context.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						build: {
							context: '.',
							dockerfile: 'Dockerfile.main',
						},
						command: ['sleep', 'infinity'],
						networks: {
							default: null,
						},
					},
					one: {
						build: {
							context: 'one',
							dockerfile: 'Dockerfile.one',
						},
						command: ['sleep', 'infinity'],
						networks: {
							default: null,
						},
					},
					two: {
						build: {
							context: 'two',
							dockerfile: 'Dockerfile.two',
						},
						command: ['sleep', 'infinity'],
						networks: {
							default: null,
						},
					},
					three: {
						build: {
							context: 'three',
							dockerfile: 'Dockerfile.three',
						},
						command: ['sleep', 'infinity'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should reject remote build context', async () => {
			try {
				await parse('test/parse/fixtures/compose/build/context_remote.yml');
				expect.fail('Expected compose parser to reject remote build context');
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('remote');
				expect(error.message).to.equal(
					'service.build.context cannot be a remote context',
				);
			}
		});

		it('should reject forbidden build config fields', async () => {
			for (const field of BUILD_CONFIG_DENY_LIST) {
				try {
					await parse(
						`test/parse/fixtures/compose/build/unsupported/${field}.yml`,
					);
					expect.fail(`Expected compose parser to reject build.${field}`);
				} catch (error) {
					if (['secrets', 'configs'].includes(field)) {
						expect(error).to.be.instanceOf(ValidationError);
						expect(error.message).to.equal(
							'Top-level secrets and/or configs are not supported',
						);
					} else {
						expect(error).to.be.instanceOf(ServiceError);
						expect(error.serviceName).to.equal('main');
						expect(error.message).to.equal(
							`service.build.${field} is not allowed`,
						);
					}
				}
			}
		});

		it('should reject io.balena.private namespace in labels', async () => {
			try {
				await parse('test/parse/fixtures/compose/build/label_namespace.yml');
				expect.fail(
					'Expected compose parser to reject io.balena.private namespace in labels',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ServiceError);
				expect(error.serviceName).to.equal('main');
				expect(error.message).to.equal(
					'labels cannot use the "io.balena.private" namespace',
				);
			}
		});
	});

	describe('networks', () => {
		let warnStub: SinonStub;

		beforeEach(() => {
			warnStub = stub(console, 'warn');
		});

		afterEach(() => {
			warnStub.restore();
		});

		it('should normalize network config', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/networks/supported_fields.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						command: ['sh', '-c', 'sleep infinity'],
						image: 'alpine:latest',
						networks: {
							my_network: null,
							my_network_2: null,
						},
					},
				},
				networks: {
					my_network: {
						driver: 'bridge',
						driver_opts: {
							'com.docker.network.driver.mtu': '1500',
						},
						ipam: {
							driver: 'default',
							config: [
								{
									subnet: '2001:db8::/64',
									gateway: '2001:db8::1',
									ip_range: '2001:db8:1::/64',
									aux_addresses: {
										host1: '2001:db8:1::1',
										host2: '2001:db8:1::2',
										host3: '2001:db8:1::3',
									},
								},
								{
									subnet: '2021:db8::/64',
									gateway: '2021:db8::1',
									ip_range: '2021:db8:1::/64',
									aux_addresses: {
										host1: '2021:db8:1::1',
										host2: '2021:db8:1::2',
										host3: '2021:db8:1::3',
									},
								},
							],
						},
						internal: true,
						labels: {
							'io.balena.label': 'test',
						},
						enable_ipv4: false,
						enable_ipv6: true,
					},
					my_network_2: {
						driver: 'bridge',
						ipam: {
							driver: 'default',
							config: [
								{
									subnet: '10.0.0.0/16',
									gateway: '10.0.0.1',
									ip_range: '10.0.1.0/24',
									aux_addresses: {
										host1: '10.0.1.1',
										host2: '10.0.1.2',
										host3: '10.0.1.3',
									},
								},
							],
						},
						labels: {
							'io.balena.label': 'test2',
						},
						enable_ipv6: false,
					},
				},
			});
		});

		it('should reject unsupported network config fields', async () => {
			for (const field of NETWORK_CONFIG_DENY_LIST) {
				try {
					await parse(
						`test/parse/fixtures/compose/networks/unsupported/${field}.yml`,
					);
					expect.fail(`Expected compose parser to reject network.${field}`);
				} catch (error) {
					expect(error).to.be.instanceOf(ComposeError);
					expect(error.message).to.equal(`network.${field} is not allowed`);
				}
			}
		});

		it('should reject non-bridge or non-default network drivers', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/networks/unsupported/driver_custom.yml',
				);
				expect.fail(
					'Expected compose parser to reject non-bridge or non-default network drivers',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'Only "bridge" and "default" are supported for network.driver, got "custom"',
				);
			}
		});

		it('should warn if com.docker.network.bridge.name driver_opts is present', async () => {
			await parse(
				'test/parse/fixtures/compose/networks/driver_opt_bridge_name.yml',
			);
			expect(warnStub.callCount).to.equal(1);
			expect(warnStub.firstCall.args[0]).to.equal(
				'com.docker.network.bridge.name network.driver_opt may interfere with device firewall',
			);
		});

		it('should reject io.balena.private namespace in labels', async () => {
			try {
				await parse('test/parse/fixtures/compose/networks/label_namespace.yml');
				expect.fail(
					'Expected compose parser to reject io.balena.private namespace in labels',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'labels cannot use the "io.balena.private" namespace',
				);
			}
		});
	});

	describe('volumes', () => {
		it('should normalize volume config', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/volumes/supported_fields.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						volumes: ['my_volume:/app'],
						networks: {
							default: null,
						},
					},
				},
				volumes: {
					my_volume: {
						driver: 'local',
						driver_opts: {
							type: 'tmpfs',
							o: 'size=100m,uid=1000,gid=1000,mode=700',
							device: 'tmpfs',
						},
						labels: {
							'io.foo.bar': 'baz',
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should normalize a volume without configuration to an empty object', async () => {
			const composition = await parse(
				'test/parse/fixtures/compose/volumes/null.yml',
			);
			expect(composition).to.deep.equal({
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sh', '-c', 'sleep infinity'],
						volumes: ['my-volume:/data'],
						networks: {
							default: null,
						},
					},
				},
				volumes: {
					'my-volume': {},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should reject unsupported volume config fields', async () => {
			for (const field of VOLUME_CONFIG_DENY_LIST) {
				try {
					await parse(
						`test/parse/fixtures/compose/volumes/unsupported/${field}.yml`,
					);
					expect.fail(`Expected compose parser to reject volume.${field}`);
				} catch (error) {
					expect(error).to.be.instanceOf(ComposeError);
					expect(error.message).to.equal(`volume.${field} is not allowed`);
				}
			}
		});

		it('should reject non-local or non-default volume drivers', async () => {
			try {
				await parse(
					'test/parse/fixtures/compose/volumes/unsupported/driver_custom.yml',
				);
				expect.fail(
					'Expected compose parser to reject non-local or non-default volume drivers',
				);
			} catch (error) {
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'Only "local" and "default" are supported for volume.driver, got "custom"',
				);
			}
		});
	});

	// See https://docs.docker.com/reference/compose-file/merge/
	describe('multiple file merging', () => {
		it('should merge scalars by adding missing entries and merging conflicting ones', async () => {
			const composition = await parse([
				'test/parse/fixtures/compose/merge/scalar-base.yml',
				'test/parse/fixtures/compose/merge/scalar-override.yml',
			]);

			expect(composition).to.deep.equal({
				services: {
					web: {
						image: 'nginx:1.19',
						command: null,
						restart: 'no',
						attach: true,
						mem_limit: '1073741824', // 1g
						networks: {
							backend: null,
							frontend: null,
						},
						volumes: ['web-data:/var/www/html'],
					},
				},
				networks: {
					backend: {
						ipam: {},
					},
					frontend: {
						ipam: {},
					},
				},
				volumes: {
					'web-data': {},
				},
			});
		});

		it('should replace shell commands', async () => {
			const composition = await parse([
				'test/parse/fixtures/compose/merge/shell-base.yml',
				'test/parse/fixtures/compose/merge/shell-override.yml',
			]);

			expect(composition).to.deep.equal({
				services: {
					web: {
						image: 'nginx:1.19',
						command: ['sh', '-c', 'sleep 50'],
						entrypoint: ['sh', '-c', 'sleep 51'],
						healthcheck: {
							test: ['CMD', 'curl', '-f', 'http://localhost:3001'],
						},
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should merge mappings by adding missing entries and merging conflicting ones', async () => {
			const composition = await parse([
				'test/parse/fixtures/compose/merge/mapping-base.yml',
				'test/parse/fixtures/compose/merge/mapping-override-1.yml',
				'test/parse/fixtures/compose/merge/mapping-override-2.yml',
			]);

			expect(composition).to.deep.equal({
				services: {
					web: {
						image: 'nginx:1.21',
						command: ['sh', '-c', "echo 'one' && sleep infinity"],
						environment: {
							DEBUG: 'false',
							LOG_LEVEL: 'info',
							NEW_VAR: 'value',
							THIRD_VAR: 'third',
						},
						networks: {
							frontend: null,
						},
						labels: {
							'io.balena.test.app': 'myapp',
							'io.balena.test.tier': 'database',
							'io.balena.test.environment': 'dev',
							'io.balena.test.third': 'true',
						},
					},
					db: {
						image: 'postgres:13',
						command: ['sh', '-c', "echo 'db' && sleep infinity"],
						environment: {
							POSTGRES_DB: 'mydb',
							POSTGRES_USER: 'user',
							POSTGRES_PASSWORD: 'pass',
						},
						networks: {
							default: null,
						},
					},
					cache: {
						image: 'redis:6',
						command: ['sh', '-c', 'sleep infinity'],
						labels: {
							'io.balena.test.tier': 'backend',
						},
						networks: {
							default: null,
						},
					},
				},
				networks: {
					frontend: {
						ipam: {},
						labels: {
							'io.balena.test.network': 'frontend2',
							'io.balena.test.network2': 'frontend',
						},
					},
					default: {
						ipam: {},
					},
				},
			});
		});

		it('should merge sequences by appending values', async () => {
			const composition = await parse([
				'test/parse/fixtures/compose/merge/sequence-base.yml',
				'test/parse/fixtures/compose/merge/sequence-override.yml',
			]);

			expect(composition).to.deep.equal({
				services: {
					app: {
						image: 'node:18',
						command: ['npm', 'run', 'dev'],
						ports: ['3000:3000', '9229:9229', '3001:3001', '80:80'],
						dns: ['1.1.1.1', '8.8.8.8'],
						dns_search: ['test.local', 'dev.local', 'test2.local'],
						depends_on: ['cache', 'db'],
						tmpfs: ['/tmp', '/run'],
						devices: ['/dev/sdb:/dev/sdb:rw'],
						networks: {
							default: null,
						},
					},
					db: {
						image: 'postgres:13',
						command: ['sh', '-c', "echo 'db' && sleep infinity"],
						environment: {
							POSTGRES_DB: 'mydb',
							POSTGRES_DB_2: 'mydb2',
						},
						networks: {
							default: null,
						},
					},
					cache: {
						image: 'redis:6',
						command: ['sh', '-c', 'sleep infinity'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		// See https://docs.docker.com/reference/compose-file/merge/#unique-resources
		it('should only append entries that do not violate uniqueness constraints', async () => {
			const composition = await parse([
				'test/parse/fixtures/compose/merge/uniqueness-base.yml',
				'test/parse/fixtures/compose/merge/uniqueness-override.yml',
			]);

			expect(composition).to.deep.equal({
				services: {
					web: {
						image: 'nginx:1.19',
						command: null,
						ports: ['3000:3000', '80:80/udp', '3000:3000/udp', '80:80'],
						volumes: ['static-data:/html', 'web-data:/static'],
						networks: {
							default: null,
						},
					},
				},
				volumes: {
					'web-data': {},
					'static-data': {},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		// See https://docs.docker.com/reference/compose-file/merge/#reset-value
		it('should respect !reset YAML tag to override a previously set value', async () => {
			const composition = await parse([
				'test/parse/fixtures/compose/merge/reset-base.yml',
				'test/parse/fixtures/compose/merge/reset-override.yml',
			]);

			expect(composition).to.deep.equal({
				services: {
					app: {
						image: 'myapp',
						command: null,
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});

		// See https://docs.docker.com/reference/compose-file/merge/#replace-value
		it('should respect !override YAML tag to replace a previously set value', async () => {
			const composition = await parse([
				'test/parse/fixtures/compose/merge/replace-base.yml',
				'test/parse/fixtures/compose/merge/replace-override.yml',
			]);

			expect(composition).to.deep.equal({
				services: {
					app: {
						image: 'myapp',
						command: null,
						ports: ['8443:443'],
						networks: {
							default: null,
						},
					},
				},
				networks: {
					default: {
						ipam: {},
					},
				},
			});
		});
	});

	// See https://docs.docker.com/reference/compose-file/fragments/
	it('should support fragments', async () => {
		const composition = await parse(
			'test/parse/fixtures/compose/fragments.yml',
		);

		expect(composition).to.deep.equal({
			services: {
				main: {
					image: 'alpine:latest',
					command: null,
					volumes: ['db-data:/data', 'metrics:/metrics'],
					environment: {
						CONFIG_KEY: 'value1',
						EXAMPLE_KEY: 'value2',
						DEMO_VAR: 'value3',
					},
					dns: ['1.1.1.1', '1.0.0.1'],
					networks: {
						default: null,
					},
				},
				second: {
					image: 'alpine:latest',
					command: null,
					environment: {
						CONFIG_KEY: 'value1',
						EXAMPLE_KEY: 'value2-override',
						DEMO_VAR: 'value3',
					},
					dns: ['1.1.1.1', '1.0.0.1'],
					networks: {
						default: null,
					},
				},
			},
			volumes: {
				'db-data': {
					labels: {
						'io.balena.test': 'true',
						'io.balena.test2': 'true',
					},
				},
				metrics: {
					labels: {
						'io.balena.test': 'false',
						'io.balena.test2': 'true',
					},
				},
			},
			networks: {
				default: {
					ipam: {},
				},
			},
		});
	});

	// See https://docs.docker.com/reference/compose-file/extension/
	it('should support extensions', async () => {
		const composition = await parse(
			'test/parse/fixtures/compose/extensions.yml',
		);

		expect(composition).to.deep.equal({
			services: {
				first: {
					image: 'my-image:latest',
					command: null,
					environment: {
						CONFIG_KEY: 'value1',
						EXAMPLE_KEY: 'value2',
					},
					annotations: {
						'io.balena.test': 'true',
					},
					networks: {
						default: null,
					},
				},
				second: {
					image: 'another-image:latest',
					command: null,
					environment: {
						CONFIG_KEY: 'value1',
						EXAMPLE_KEY: 'value2',
					},
					annotations: {
						'io.balena.test': 'true',
					},
					networks: {
						default: null,
					},
				},
				third: {
					image: 'my-image:latest',
					command: null,
					environment: {
						KEY1: 'VALUE1',
						KEY2: 'VALUE2',
						YET_ANOTHER: 'VARIABLE',
					},
					networks: {
						default: null,
					},
				},
			},
			networks: {
				default: {
					ipam: {},
				},
			},
		});
	});

	it('should support include directives', async () => {
		const composition = await parse(
			'test/parse/fixtures/compose/include/main.yml',
		);

		expect(composition).to.deep.equal({
			services: {
				main: {
					image: 'alpine:latest',
					command: null,
					depends_on: ['child'],
					networks: {
						default: null,
					},
				},
				child: {
					image: 'alpine:latest',
					command: null,
					environment: {
						CHILD_VAR: 'child_value',
					},
					networks: {
						default: null,
					},
				},
				child2: {
					image: 'alpine:latest',
					command: null,
					environment: {
						CHILD2_VAR: 'child2_value',
						CHILD2_VAR2: 'child2_value2',
					},
					networks: {
						default: null,
					},
				},
				child3: {
					image: 'alpine:latest',
					command: null,
					environment: {
						CHILD3_VAR: 'child3_value',
					},
					networks: {
						default: null,
					},
				},
			},
			networks: {
				default: {
					ipam: {},
				},
			},
		});
	});

	it('should support variable interpolation', async () => {
		// Set environment variables for interpolation
		process.env.IMAGE_TAG = '3.18';
		process.env.APP_PORT = '8080';
		process.env.APP_ENV = 'production';
		process.env.DB_NAME = 'myapp_db';

		const composition = await parse(
			'test/parse/fixtures/compose/interpolation/compose.yml',
		);

		expect(composition).to.deep.equal({
			services: {
				main: {
					image: 'alpine:3.18',
					command: null,
					environment: {
						NODE_ENV: 'production',
						DATABASE: 'myapp_db',
						PORT: '8080',
						DEFAULT_VAR: 'default_value',
						VALUE_FROM_DOTENV: '', // 'value_from_dotenv', // TODO: vars from .env in working directory are not being picked up
					},
					ports: ['8080:8080'],
					networks: {
						default: null,
					},
				},
			},
			networks: {
				default: {
					ipam: {},
				},
			},
		});

		// Clean up environment variables
		delete process.env.IMAGE_TAG;
		delete process.env.APP_PORT;
		delete process.env.APP_ENV;
		delete process.env.DB_NAME;
	});
});
