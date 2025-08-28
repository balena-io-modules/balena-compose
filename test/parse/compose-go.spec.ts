import { expect } from 'chai';
import type { SinonStub } from 'sinon';
import { stub } from 'sinon';
import {
	parse,
	ComposeError,
	BUILD_CONFIG_DENY_LIST,
	SERVICE_CONFIG_DENY_LIST,
} from '../../lib/parse/compose-go';

describe('compose-go', () => {
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
					expect(error).to.be.instanceOf(ComposeError);
					// Top-level secrets and configs are rejected earlier so have a different error message
					if (['secrets', 'configs'].includes(field)) {
						expect(error.message).to.equal(
							'Top-level secrets and/or configs are not supported',
						);
					} else {
						expect(error.message).to.equal(`service.${field} is not allowed`);
					}
				}
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
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'devices config with CDI syntax is not allowed',
				);
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
				expect(error).to.be.instanceOf(ComposeError);
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
				expect(error).to.be.instanceOf(ComposeError);
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
				expect(error).to.be.instanceOf(ComposeError);
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
				expect(error).to.be.instanceOf(ComposeError);
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
				expect(error).to.be.instanceOf(ComposeError);
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
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'service.volumes cannot be of type "cluster"',
				);
			}
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
				expect(error).to.be.instanceOf(ComposeError);
				expect(error.message).to.equal(
					'service.volumes_from which references a containerId is not allowed',
				);
			}
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
				expect(error).to.be.instanceOf(ComposeError);
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
					expect(error).to.be.instanceOf(ComposeError);
					if (['secrets', 'configs'].includes(field)) {
						expect(error.message).to.equal(
							'Top-level secrets and/or configs are not supported',
						);
					} else {
						expect(error.message).to.equal(
							`service.build.${field} is not allowed`,
						);
					}
				}
			}
		});
	});
});
