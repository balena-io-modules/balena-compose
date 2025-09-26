import { expect } from 'chai';
import * as yml from 'js-yaml';
import { describe } from 'mocha';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as Compose from '@balena/compose-parser';
import * as os from 'os';

import { defaultComposition } from '../../lib/parse';

// Unlink if file exists and resolve silently if doesn't exist
async function safeUnlink(p: string) {
	try {
		await fs.unlink(p);
	} catch (err) {
		if (err.code !== 'ENOENT') {
			throw err;
		}
	}
}

describe('default composition', () => {
	let tmpPath: string;
	beforeEach(() => {
		tmpPath = path.join(os.tmpdir(), 'compose.yml');
	});

	afterEach(async () => {
		await safeUnlink(tmpPath);
	});

	it('with build context', async () => {
		const composeStr = defaultComposition();
		await fs.writeFile(tmpPath, composeStr);

		const composition = await Compose.parse(tmpPath);
		const imageDescriptors = Compose.toImageDescriptors(composition);

		expect(imageDescriptors).to.deep.equal([
			{
				serviceName: 'main',
				image: { context: '.', dockerfile: 'Dockerfile' },
			},
		]);
	});

	it('with build dockerfile name', async () => {
		const composeStr = defaultComposition(undefined, 'MyDockerfile');
		await fs.writeFile(tmpPath, composeStr);

		const composition = await Compose.parse(tmpPath);
		const imageDescriptors = Compose.toImageDescriptors(composition);

		expect(imageDescriptors).to.deep.equal([
			{
				serviceName: 'main',
				image: { context: '.', dockerfile: 'MyDockerfile' },
			},
		]);
	});

	it('with image', async () => {
		const composeStr = defaultComposition('some/image');
		await fs.writeFile(tmpPath, composeStr);

		const composition = await Compose.parse(tmpPath);
		const imageDescriptors = Compose.toImageDescriptors(composition);

		expect(imageDescriptors).to.deep.equal([
			{ serviceName: 'main', image: 'some/image' },
		]);
	});
});

describe('normalization', () => {
	let c: Compose.Composition;

	before(async () => {
		c = await Compose.parse('test/parse/fixtures/default.yml');
	});

	it('should generate image descriptors from composition services', () => {
		expect(Compose.toImageDescriptors(c)).to.deep.equal([
			{ serviceName: 's1', image: { context: 's1', dockerfile: 'Dockerfile' } },
			{
				serviceName: 's2',
				image: { context: 's2', target: 'stage1', dockerfile: 'Dockerfile' },
			},
			{ serviceName: 's3', image: 'some/image' },
			{ serviceName: 's4', image: 'some/image' },
		]);
	});

	it('should parse composition depends_on', () => {
		expect(c.services.s1.depends_on).to.deep.equal(['s3']);
		expect(c.services.s2.depends_on).to.deep.equal(['s1', 's3']);
	});

	it('should parse composition environment and fold in env_file', () => {
		expect(c.services.s1.environment).to.deep.equal({
			EMPTYOVERWRITE: 'shouldbeoverwrittenempty',
			OVERWRITES: 'shouldbeoverwritten',
			SOME_VAR: 'some=value',
			sharedfoo: 'sharedbar',
			sharedvar: 'sharedval',
		});
		expect(c.services.s2.environment).to.deep.equal({
			EMPTYOVERWRITE: 'shouldbeoverwrittenempty',
			OVERWRITES: 'shouldbeoverwritten',
			SOME_VAR: 'some value',
			sharedfoo: 'sharedbar',
			sharedvar: 'sharedval',
		});
		// @balena/compose-parser deletes env_file after folding into environment
		expect(c.services.s1.env_file).to.be.undefined;
		expect(c.services.s2.env_file).to.be.undefined;
	});

	it('should parse composition ports, converting numbers to strings', () => {
		expect(c.services.s3.ports).to.deep.equal([
			'1000',
			'1001:1002',
			'1003:1004/udp',
		]);
	});

	it('should parse composition extra_hosts from objects or arrays', () => {
		expect(c.services.s2.extra_hosts).to.deep.equal(['foo=127.0.0.1']);
		expect(c.services.s3.extra_hosts).to.deep.equal(['bar=8.8.8.8']);
	});

	it('should parse composition networks and add on default network', () => {
		expect(c.networks).to.deep.equal({
			default: {
				ipam: {},
			},
			n1: {
				ipam: {},
			},
			n2: {
				ipam: {},
			},
		});
	});

	it('should parse composition volumes', () => {
		expect(c.volumes).to.deep.equal({
			v1: {},
			v2: {},
		});
	});

	it('should parse composition volume references', () => {
		expect(c.services.s2.volumes).to.deep.equal(['v2:/v2:ro']);
		expect(c.services.s3.volumes).to.deep.equal(['v1:/v1']);
		expect(c.services.s3.tmpfs).to.deep.equal(['/tmp1', '/tmp2']);
	});

	it('should convert well-known bind mounts to labels', () => {
		expect(c.services.s4.volumes).to.be.undefined;
		expect(c.services.s4.labels).to.deep.equal({
			'io.balena.features.balena-socket': '1',
			'io.balena.features.dbus': '1',
			'io.balena.features.sysfs': '1',
			'io.balena.features.procfs': '1',
			'io.balena.features.kernel-modules': '1',
			'io.balena.features.firmware': '1',
			'io.balena.features.journal-logs': '1',
		});
	});
});

describe('validation', () => {
	let tmpPath: string;
	beforeEach(() => {
		tmpPath = path.join(os.tmpdir(), 'compose.yml');
	});

	afterEach(async () => {
		await safeUnlink(tmpPath);
	});

	it('should throw ServiceError for service validation errors', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							labels: {
								mal_formed: 'true',
							},
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'ServiceError not thrown');
		} catch (err) {
			expect(err).to.be.instanceOf(Compose.ServiceError);
			expect(err).to.have.property('serviceName').that.equals('main');
		}
	});

	it('should throw if label name contains forbidden characters', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							labels: {
								mal_formed: 'true',
							},
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'ServiceError not thrown');
		} catch (err) {
			expect(err.message).to.include('Invalid label name: "mal_formed"');
		}
	});

	it('should throw if a relative bind mount is specified', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							volumes: ['./localPath:/some-place'],
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Bind mount error not thrown');
		} catch (err) {
			expect(err.message).to.include(
				'service.volumes cannot be of type "bind"',
			);
		}
	});

	it('should throw if an absolute bind mount is specified', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							volumes: [
								{ type: 'bind', source: '/localPath', target: '/some-place' },
							],
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Bind mount error not thrown');
		} catch (err) {
			expect(err.message).to.include(
				'service.volumes cannot be of type "bind"',
			);
		}
	});

	it('should throw with an invalid volume definition', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							volumes: ['thisIsNotAValidVolume'],
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Volume error not thrown');
		} catch (err) {
			expect(err.message).to.include(
				'service.volumes {"type":"volume","target":"thisIsNotAValidVolume","volume":{}} must specify source and target',
			);
		}
	});

	it('should throw if a volume definition is missing', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							volumes: [
								{ type: 'volume', source: 'someVolume', target: '/some-place' },
							],
						},
					},
					volumes: {
						someOtherVolume: {},
					},
				}),
			);
			await Compose.parse(tmpPath);
		} catch (err) {
			expect(err.message).to.include(
				'Failed to parse compose file: service "main" refers to undefined volume someVolume: invalid compose project',
			);
		}
	});

	it('should not throw if a port matches the ports regex', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							ports: ['1002:1003/tcp'],
						},
					},
				}),
			);
			const comp = await Compose.parse(tmpPath);
			expect(comp.services.main.ports).to.deep.equal(['1002:1003/tcp']);
		} catch {
			expect(false, 'Port error should not have been thrown');
		}
	});

	it('should throw if a port does not match the ports regex', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							ports: ['1002:1003/tc'],
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Port error should have been thrown');
		} catch (err) {
			expect(err.message).to.include(
				'Failed to parse compose file: Invalid proto: tc',
			);
		}
	});

	it('should not throw if a volume definition is present', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							image: 'some/image',
							volumes: ['someVolume:/some-place'],
						},
					},
					volumes: {
						someVolume: {},
					},
				}),
			);
			const comp = await Compose.parse(tmpPath);
			expect(comp.services.main.volumes).to.deep.equal([
				'someVolume:/some-place',
			]);
		} catch {
			expect(false, 'Volume error should not have been thrown');
		}
	});

	it('should not allow build networks', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							build: { context: '.', network: 'mynet' },
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Network error should have been thrown');
		} catch (err) {
			expect(err.message).to.include('service.build.network is not allowed');
		}
	});

	it('should support extension fields', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							build: '.',
							'x-my-custom-attribute': true,
						},
					},
				}),
			);
			const comp = await Compose.parse(tmpPath);
			expect(comp.services.main['x-my-custom-attribute']).to.equal(true);
		} catch {
			expect(false, 'Custom attribute error should not have been thrown');
		}
	});

	it('should throw when long syntax depends_on does not specify service_started condition', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							build: '.',
							depends_on: {
								dependency: { condition: 'service_healthy' },
							},
						},
						dependency: {
							build: '.',
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Depends on error should have been thrown');
		} catch (err) {
			expect(err).to.be.instanceOf(Compose.ServiceError);
			expect(err.serviceName).to.equal('main');
			expect(err.message).to.include(
				'Long syntax depends_on dependency:{"condition":"service_healthy","required":true} for service "main" is not yet supported',
			);
		}
	});

	it('should throw when long syntax tmpfs mounts specify options', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					version: '2.4',
					services: {
						main: {
							build: '.',
							volumes: [
								{ type: 'tmpfs', target: '/tmp2', tmpfs: { size: 5000 } },
							],
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Tmpfs error should have been thrown');
		} catch (err) {
			expect(err).to.be.instanceOf(Compose.ServiceError);
			expect(err.serviceName).to.equal('main');
			expect(err.message).to.include(
				'long syntax service.volumes are not supported',
			);
		}
	});

	it('should throw when long syntax volume mounts specify options', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							build: '.',
							volumes: [
								{
									type: 'volume',
									source: 'v1',
									target: '/v1',
									volume: { nocopy: true },
								},
							],
						},
					},
					volumes: {
						v1: {},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Volume error should have been thrown');
		} catch (err) {
			expect(err).to.be.instanceOf(Compose.ServiceError);
			expect(err.serviceName).to.equal('main');
			expect(err.message).to.include(
				'long syntax service.volumes are not supported',
			);
		}
	});

	it('should not throw when long syntax tmpfs or volume does not specify options', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							build: '.',
							volumes: [
								{ type: 'tmpfs', target: '/tmp2' },
								{ type: 'volume', source: 'v1', target: '/v1' },
							],
						},
					},
					volumes: {
						v1: {},
					},
				}),
			);
			const comp = await Compose.parse(tmpPath);
			expect(comp.services.main.volumes).to.deep.equal([
				{ type: 'tmpfs', target: '/tmp2' },
				{ type: 'volume', source: 'v1', target: '/v1' },
			]);
		} catch {
			expect(false, 'Volume error should not have been thrown');
		}
	});

	it('should throw if label `io.balena.features.requires.sw.supervisor` uses a wrong version range', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							build: '.',
							labels: {
								'io.balena.features.requires.sw.supervisor': 'not-valid',
							},
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Label error should have been thrown');
		} catch (err) {
			expect(err).to.be.instanceOf(Compose.ValidationError);
			expect(err.message).to.include(
				"Invalid value for label 'io.balena.features.requires.sw.supervisor'. Expected a valid semver range; got 'not-valid'",
			);
		}
	});

	it('should throw if label `io.balena.features.requires.sw.l4t` uses a wrong version range', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							build: '.',
							labels: {
								'io.balena.features.requires.sw.l4t': 'not-valid',
							},
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Label error should have been thrown');
		} catch (err) {
			expect(err).to.be.instanceOf(Compose.ValidationError);
			expect(err.message).to.include(
				"Invalid value for label 'io.balena.features.requires.sw.l4t'. Expected a valid semver range; got 'not-valid'",
			);
		}
	});

	it('should throw if label `io.balena.features.requires.arch.sw` uses an invalid architecture', async () => {
		try {
			await fs.writeFile(
				tmpPath,
				yml.dump({
					services: {
						main: {
							build: '.',
							labels: {
								'io.balena.features.requires.arch.sw': 'not-valid',
							},
						},
					},
				}),
			);
			await Compose.parse(tmpPath);
			expect(false, 'Label error should have been thrown');
		} catch (err) {
			expect(err).to.be.instanceOf(Compose.ValidationError);
			expect(err.message).to.include(
				"Invalid value for label 'io.balena.features.requires.arch.sw'. Expected a valid architecture string got 'not-valid'",
			);
		}
	});
});

describe('env_file support', () => {
	it('should read environment variables from env_file and fold into environment', async () => {
		const c = await Compose.parse(
			'./test/parse/fixtures/test-env-files/env-files.yml',
		);
		expect(c).to.be.not.undefined;

		expect(c.services['s1'].environment).to.be.deep.equal({
			OVERWRITES: 'overwritten',
			EMPTYOVERWRITE: '',
			sharedfoo: 'sharedbar',
			sharedvar: 'sharedval',
			service1var: 'service1val',
			FOOBAR: 'KUNGFU',
		});

		expect(c.services['s2'].environment).to.be.deep.equal({
			OVERWRITES: 'overwritten',
			sharedfoo: 'sharedbar',
			sharedvar: 'sharedval',
			EMPTYOVERWRITE: 'shouldbeoverwrittenempty',
			service2var: 'service2val',
			FOOBAR: 'BARFOO',
		});

		expect(c.services['s3'].environment).to.be.deep.equal({
			OVERWRITES: 'overwritten',
			sharedfoo: 'sharedbar',
			sharedvar: 'sharedval',
			EMPTYOVERWRITE: 'shouldbeoverwrittenempty',
		});
		expect(c.services['s4'].environment).to.be.deep.equal({
			service4var: 'service4val',
			FOOBAR: 'BARFOO',
			EMPTY: '',
			GO: 'FORIT',
		});
	});
});
