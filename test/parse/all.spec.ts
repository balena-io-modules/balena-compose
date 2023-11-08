import { expect } from 'chai';
import * as yml from 'js-yaml';
import { describe } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

import * as compose from '../../lib/parse';

const { DEFAULT_SCHEMA_VERSION, ServiceError, ValidationError } = compose;

function loadFixture(filename: string): any {
	const p = path.join(__dirname, 'fixtures', filename);
	const buf = fs.readFileSync(p);
	return JSON.parse(buf.toString('utf-8'));
}

['1.0', '2.0', '2.1', '2.2', '2.3', '2.4'].forEach((version) => {
	const services = [
		{ serviceName: 's1', image: { context: './' } },
		{ serviceName: 's2', image: 'some/image' },
	];

	describe(`v${version}`, () => {
		it('should migrate composition to default version', (done) => {
			const composition = loadFixture(`test-v${version}.json`);
			expect(compose.normalize(composition).version).to.equal(
				DEFAULT_SCHEMA_VERSION,
			);
			done();
		});

		it('should parse composition services', (done) => {
			const composition = loadFixture(`test-v${version}.json`);
			const c = compose.normalize(composition);
			const d = compose.parse(c);
			expect(d).to.deep.equal(services);
			done();
		});
	});
});

describe('default composition', () => {
	it('with build context', (done) => {
		const composeStr = compose.defaultComposition();
		const composeJson = yml.load(composeStr);
		const c = compose.normalize(composeJson);
		expect(c.version).to.equal(DEFAULT_SCHEMA_VERSION);
		expect(compose.parse(c)).to.deep.equal([
			{ serviceName: 'main', image: { context: '.' } },
		]);
		done();
	});

	it('with build dockerfile name', (done) => {
		const composeStr = compose.defaultComposition(undefined, 'MyDockerfile');
		const composeJson = yml.load(composeStr);
		const c = compose.normalize(composeJson);
		expect(c.version).to.equal(DEFAULT_SCHEMA_VERSION);
		expect(compose.parse(c)).to.deep.equal([
			{
				serviceName: 'main',
				image: { context: '.', dockerfile: 'MyDockerfile' },
			},
		]);
		done();
	});

	it('with image', (done) => {
		const composeStr = compose.defaultComposition('some/image');
		const composeJson = yml.load(composeStr);
		const c = compose.normalize(composeJson);
		expect(c.version).to.equal(DEFAULT_SCHEMA_VERSION);
		expect(compose.parse(c)).to.deep.equal([
			{ serviceName: 'main', image: 'some/image' },
		]);
		done();
	});
});

describe('normalization', () => {
	const composition = loadFixture('default.json');
	const c = compose.normalize(composition);

	it('should migrate composition to default version', (done) => {
		expect(c.version).to.equal(DEFAULT_SCHEMA_VERSION);
		done();
	});

	it('should parse composition services', (done) => {
		expect(compose.parse(c)).to.deep.equal([
			{ serviceName: 's1', image: { context: './s1' } },
			{
				serviceName: 's2',
				image: { context: './s2', network: 'none', target: 'stage1' },
			},
			{ serviceName: 's3', image: 'some/image' },
			{ serviceName: 's4', image: 'some/image' },
		]);
		done();
	});

	it('depends_on', (done) => {
		expect(c.services.s1.depends_on).to.deep.equal(['s3']);
		expect(c.services.s2.depends_on).to.deep.equal(['s1', 's3']);
		done();
	});

	it('environment', (done) => {
		expect(c.services.s1.environment).to.deep.equal({
			SOME_VAR: 'some=value',
		});
		expect(c.services.s2.environment).to.deep.equal({
			SOME_VAR: 'some value',
		});
		done();
	});

	it('env_file', (done) => {
		expect(c.services.s1.env_file).to.deep.equal([
			'relative/parent1/twoupwards.env',
		]);
		expect(c.services.s2.env_file).to.deep.equal([
			'relative/parent1/twoupwards.env',
			'foo/bar/env.env',
		]);
		done();
	});

	it('parses ports converting numbers to strings', (done) => {
		expect(c.services.s3.ports).to.deep.equal([
			'1000',
			'1001:1002',
			'1003:1004/tcp',
		]);
		done();
	});

	it('normalizes extra_hosts from objects or arrays', (done) => {
		expect(c.services.s2.extra_hosts).to.deep.equal(['foo:127.0.0.1']);
		expect(c.services.s3.extra_hosts).to.deep.equal(['bar:8.8.8.8']);
		done();
	});

	it('networks', (done) => {
		expect(c.networks).to.deep.equal({
			n1: {},
			n2: {},
		});
		done();
	});

	it('volumes', (done) => {
		expect(c.volumes).to.deep.equal({
			v1: {},
			v2: {},
		});
		done();
	});

	it('should normalize volume references', (done) => {
		expect(c.services.s2.volumes).to.deep.equal(['v2:/v2:ro']);
		expect(c.services.s3.volumes).to.deep.equal(['v1:/v1']);
		expect(c.services.s3.tmpfs).to.deep.equal(['/tmp1', '/tmp2']);
		done();
	});

	it('should normalize well-known bind mounts to labels', (done) => {
		expect(c.services.s4.volumes).to.deep.equal([]);
		expect(c.services.s4.labels).to.deep.equal({
			'io.balena.features.balena-socket': 1,
			'io.balena.features.dbus': 1,
			'io.balena.features.sysfs': 1,
			'io.balena.features.procfs': 1,
			'io.balena.features.kernel-modules': 1,
			'io.balena.features.firmware': 1,
			'io.balena.features.journal-logs': 1,
		});
		done();
	});
});

describe('validation', () => {
	it('should throw ServiceError for service validation errors', () => {
		const f = () => {
			compose.normalize({
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						labels: {
							mal_formed: 'true',
						},
					},
				},
			});
		};
		try {
			f();
			expect(false, 'ServiceError not thrown');
		} catch (err) {
			expect(err).to.be.instanceOf(ServiceError);
			expect(err).to.have.property('serviceName').that.equals('main');
		}
	});

	it('should throw if label name contains forbidden characters', (done) => {
		const f = () => {
			compose.normalize({
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						labels: {
							mal_formed: 'true',
						},
					},
				},
			});
		};
		expect(f).to.throw('Invalid label name: "mal_formed"');
		done();
	});

	it('should throw if a relative bind mount is specified', () => {
		const f = () => {
			compose.normalize({
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						volumes: ['./localPath:/some-place'],
					},
				},
			});
		};
		expect(f).to.throw('Bind mounts are not allowed');
	});

	it('should throw if an absolute bind mount is specified', () => {
		const f = () => {
			compose.normalize({
				version: '2.4',
				services: {
					main: {
						image: 'some/image',
						volumes: [
							{ type: 'bind', source: '/localPath', target: '/some-place' },
						],
					},
				},
			});
		};
		expect(f).to.throw('Bind mounts are not allowed');
	});

	it('should throw with an invalid volume definition', () => {
		const f = () => {
			compose.normalize({
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						volumes: ['thisIsNotAValidVolume'],
					},
				},
			});
		};
		expect(f).to.throw("Invalid volume: 'thisIsNotAValidVolume'");
	});

	it('should throw if a volume definition is missing', () => {
		const f = () => {
			compose.normalize({
				version: '2.4',
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
			});
		};
		expect(f).to.throw("Missing volume definition for 'someVolume'");
	});

	it('should not throw if a port matches the ports regex', () => {
		const f = () => {
			compose.normalize({
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						ports: ['1002:1003/tcp'],
					},
				},
			});
		};
		expect(f).to.not.throw();
	});

	it('should throw if a port does not match the ports regex', () => {
		const f = () => {
			compose.normalize({
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						ports: ['1002:1003/tc'],
					},
				},
			});
		};
		expect(f).to.throw(
			'data/services/main/ports/0 should match format "ports"',
		);
	});

	it('should not throw if a volume definition is present', () => {
		const data = {
			version: '2.1',
			services: {
				main: {
					image: 'some/image',
					volumes: ['someVolume:/some-place'],
				},
			},
			volumes: {
				someVolume: {},
			},
		};
		const f = () => {
			compose.normalize(data);
		};
		expect(f).to.not.throw();
	});

	it('should not throw when build config specifies valid network', async () => {
		const f = () => {
			compose.normalize({
				version: '2.4',
				networks: {
					mynet: {},
				},
				services: {
					main: {
						build: { context: '.', network: 'mynet' },
					},
				},
			});
		};
		expect(f).to.not.throw();
	});

	it('should throw when build config specifies invalid network', async () => {
		const f = () => {
			compose.normalize({
				version: '2.4',
				networks: {
					othernet: {},
				},
				services: {
					main: {
						build: { context: '.', network: 'mynet' },
					},
				},
			});
		};
		expect(f).to.throw("Missing network definition for 'mynet'");
	});

	it('should support extension fields', async () => {
		const f = () => {
			compose.normalize({
				version: '2.4',
				services: {
					main: {
						build: '.',
						'x-my-custom-attribute': true,
					},
				},
			});
		};
		expect(f).to.not.throw();
	});

	it('should throw when long syntax depends_on does not specify service_started condition', async () => {
		const f = () => {
			compose.normalize({
				version: '2.4',
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
			});
		};
		expect(f).to.throw(
			ValidationError,
			'Only "service_started" type of service dependency is supported',
		);
	});

	it('should throw when long syntax tmpfs mounts specify options', async () => {
		const f = () => {
			compose.normalize({
				version: '2.4',
				services: {
					main: {
						build: '.',
						volumes: [
							{ type: 'tmpfs', target: '/tmp2', tmpfs: { size: 5000 } },
						],
					},
				},
			});
		};
		expect(f).to.throw(ValidationError, 'Tmpfs options are not allowed');
	});

	it(`should throw when long syntax volume mounts specify options`, async () => {
		const f = () => {
			compose.normalize({
				version: '2.4',
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
			});
		};
		expect(f).to.throw(ValidationError, 'Volume options are not allowed');
	});
});

describe('env_file support', () => {
	const createEnvVarFileContent = (
		envVars: Array<{ var: string; val: string }>,
	) =>
		envVars.reduce((accu, entry, idx) => {
			return idx === 0
				? `${entry.var}=${entry.val}\n`
				: accu + `${entry.var}=${entry.val}\n`;
		}, '');

	const createStreamCallback = (
		envVars: Array<{ var: string; val: string }>,
	) => {
		return (filePath) => {
			const envString = envVars.reduce((accu, entry, idx) => {
				return idx === 0
					? `${entry.var}=${entry.val}`
					: accu + '\n' + `${entry.var}=${entry.val}`;
			}, '');
			if (filePath) {
				return Readable.from(envString);
			} else {
				return undefined;
			}
		};
	};

	const testCallback = async (filePath: string): Promise<fs.ReadStream> => {
		return new Promise((resolve, reject) => {
			fs.realpath(filePath, (err, resolvedPath) => {
				if (err) {
					reject(err);
				}
				resolve(resolvedPath);
			});
		})
			.then((canonicalPath) => {
				if (!(canonicalPath as string).startsWith(path.resolve(__dirname))) {
					throw new ValidationError(
						`Canonical path outsite project folder (${__dirname}) not allowed: ${canonicalPath}`,
					);
				}
				return fs.createReadStream(canonicalPath as string);
			})
			.catch((err) => {
				throw new Error(`testCallback error : ${err}`);
			});
	};

	it('should read environment variables from file-backed callback', async () => {
		const composition = loadFixture('test-env-files/service-env_files.json');
		const c = await compose.normalize(composition, testCallback);
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

	it('should read environment variables from stream-backed callback', async () => {
		const data = {
			version: '2.1',
			services: {
				main: {
					image: 'some/image',
					env_file: './dummy/env_file', // doesn't matter as the callback ignores fielPath
				},
			},
		};

		const envVar = [{ var: 'FOOBAR', val: 'BARFOO' }];

		const newComposition = await compose.normalize(
			data,
			createStreamCallback(envVar),
		);

		expect(newComposition.services.main.environment[envVar[0].var]).to.be.equal(
			envVar[0].val,
		);
	});

	it('should not invoke callback if no env_file specified', async () => {
		const env = { ONLY: 'ONE' };
		const data = {
			version: '2.1',
			services: {
				main: {
					image: 'some/image',
					environment: env,
				},
			},
		};

		const newComposition = await compose.normalize(
			data,
			(filePath: string) => {
				expect(filePath).to.be.empty;
				expect(true).to.be.false;
				return undefined;
			}, // should not be called
		);

		expect(newComposition.services.main.environment).to.deep.equal(env);
	});

	describe('should throw', () => {
		it('if env_file path is an absolute path', async () => {
			const data = {
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						env_file: '/absolute/path',
					},
				},
			};
			const f = () => {
				compose.normalize(data);
			};
			expect(f).to.throw('Absolute filepath not allowed: /absolute/path');
		});

		it('if env_file path points outside the project dir', async () => {
			const data = {
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						env_file: '../directory/traversing/path',
					},
				},
			};
			const f = () => {
				compose.normalize(data);
			};
			expect(f).to.throw(
				'Directory traversing not allowed : ../directory/traversing/path',
			);
		});

		it('if env_file path is not readable or does not exist', async () => {
			const data = {
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						env_file: './this/path/not/exists',
					},
				},
			};

			await compose.normalize(data, testCallback).catch((error) => {
				expect(error).exist;
			});
		});

		it('if env_file path is a symbolic link pointing outside the project dir', async () => {
			const symlinkFileTarget = '/tmp/dummy_env';
			const symlinkPath = './dummy_env_file';

			try {
				fs.unlinkSync(symlinkFileTarget);
				fs.unlinkSync(symlinkPath);
			} catch {
				// ignore
			}

			fs.writeFileSync(
				symlinkFileTarget,
				createEnvVarFileContent([{ var: 'symbolic', val: 'dummy' }]),
			);
			fs.symlinkSync(symlinkFileTarget, symlinkPath);

			const data = {
				version: '2.1',
				services: {
					main: {
						image: 'some/image',
						env_file: symlinkPath,
					},
				},
			};

			await compose
				.normalize(data, testCallback)
				.finally()
				.catch((error) => {
					expect(error).exist;
				});

			fs.unlinkSync(symlinkFileTarget);
			fs.unlinkSync(symlinkPath);
		});
	});
});
