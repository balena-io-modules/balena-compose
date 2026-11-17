import { expect } from 'chai';
import * as fs from 'fs';
import type * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as Compose from '@balena/compose-parser';

import {
	fromImageDescriptors,
	generateTasks,
	generateTasksFromImageDescriptors,
} from '../../lib/multibuild';

import { TEST_FILES_PATH } from './build-utils';

function tarOf(files: Record<string, string>): Stream.Readable {
	const pack = tar.pack();
	for (const [name, content] of Object.entries(files)) {
		pack.entry({ name }, content);
	}
	pack.finalize();
	return pack;
}

// Read a tar stream to the end, returning its entry names
async function entryNames(tarStream: Stream.Readable): Promise<string[]> {
	const names: string[] = [];
	const extract = tar.extract();
	extract.on('entry', (header, entry, next) => {
		names.push(header.name);
		entry.on('end', next);
		entry.resume();
	});
	await new Promise((resolve, reject) => {
		extract.on('finish', resolve);
		extract.on('error', reject);
		tarStream.pipe(extract);
	});
	return names;
}

describe('generateTasks', () => {
	const composePath = `${TEST_FILES_PATH}/stream/docker-compose.yml`;
	const projectTar = () =>
		fs.createReadStream(`${TEST_FILES_PATH}/stream/project.tar`);

	it('generates a build task per service from a composition', async () => {
		const { tasks, strippedStream } = generateTasks(
			await Compose.parse(composePath),
			projectTar(),
		);

		// The metadata is checked in a later test
		expect(tasks.map(({ buildMetadata, ...task }) => task)).to.deep.equal(
			['test1', 'test2'].map((name) => ({
				serviceName: name,
				context: name,
				dockerfile: 'Dockerfile',
				dockerfilePath: 'Dockerfile',
				dockerOpts: {},
				external: false,
				resolved: false,
			})),
		);
		expect(await entryNames(strippedStream)).to.deep.equal([
			'./',
			'./test1/',
			'./test1/Dockerfile',
			'./test2/',
			'./test2/Dockerfile',
		]);
	});

	it('fills the task metadata from the returned stream', async () => {
		const images = Compose.toImageDescriptors(await Compose.parse(composePath));
		const { tasks, strippedStream } = generateTasksFromImageDescriptors(
			images,
			tarOf({
				'test1/Dockerfile': 'FROM alpine\n',
				'test2/Dockerfile': 'FROM alpine\n',
				'.balena/balena.yml':
					'build-variables:\n  services:\n    test1:\n      - FOO=bar\n',
			}),
		);

		// the metadata is taken out of the stream the tasks are built from
		expect(await entryNames(strippedStream)).to.not.include(
			'.balena/balena.yml',
		);

		const [metadata] = tasks.map((task) => task.buildMetadata);
		for (const task of tasks) {
			expect(task.buildMetadata).to.equal(metadata);
		}
		metadata.parseMetadata();
		expect(metadata.getBuildVarsForService('test1')).to.deep.equal({
			FOO: 'bar',
		});
	});

	it('throws for an invalid descriptor before reading the stream', async () => {
		// A Dockerfile without a context
		const images = [
			{ serviceName: 'main', image: { dockerfile: 'Dockerfile' } },
		] as unknown as Compose.ImageDescriptor[];

		const syncStream = projectTar();
		expect(() =>
			generateTasksFromImageDescriptors(images, syncStream),
		).to.throw('Must have a context specified with a Dockerfile');
		expect(syncStream.readableFlowing).to.equal(null);
		syncStream.destroy();

		const asyncStream = projectTar();
		try {
			await fromImageDescriptors(images, asyncStream);
			expect.fail('fromImageDescriptors did not throw');
		} catch (err) {
			expect(err.message).to.equal(
				'Must have a context specified with a Dockerfile',
			);
		}
		expect(asyncStream.readableFlowing).to.equal(null);
		asyncStream.destroy();
	});

	it('carries a descriptor contract onto the task', async () => {
		const contract = { type: 'sw.container', slug: 'test' };
		const { tasks, strippedStream } = generateTasksFromImageDescriptors(
			[{ serviceName: 'main', image: 'alpine:latest', contract }],
			projectTar(),
		);
		await entryNames(strippedStream);

		expect(tasks).to.have.length(1);
		expect(tasks[0]).to.include({ external: true, imageName: 'alpine:latest' });
		expect(tasks[0].contract).to.deep.equal(contract);
	});
});
