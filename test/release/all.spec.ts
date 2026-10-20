import { expect } from 'chai';
import { getLocal } from 'mockttp';
import PineFetch from 'pinejs-client-fetch';

import * as release from '../../lib/release';
import type { Composition, ImageDescriptor } from '@balena/compose-parser';

interface RecordedPost {
	path: string;
	body: any;
}

const mockServer = getLocal();

// Stub the pinejs backend on a local mockttp server: every GET resolves to an
// existing row, and every POST is recorded and returns a freshly-created row
// id. This lets us assert the requests `release.create` issues (including which
// model they hit) against a real pinejs client.
async function runCreate(
	services: Composition['services'],
	createImageProfiles = true,
): Promise<RecordedPost[]> {
	const posts: RecordedPost[] = [];
	let nextId = 100;
	await mockServer.forGet(/.*/).thenJson(200, { d: [{ id: 1 }] });
	await mockServer.forPost(/.*/).thenCallback(async (req) => {
		posts.push({ path: req.path, body: await req.body.getJson() });
		return { statusCode: 201, json: { id: nextId++ } };
	});
	const client = new PineFetch({ apiPrefix: `${mockServer.url}/v7/` });
	const imgDescriptors: ImageDescriptor[] = Object.keys(services).map(
		(serviceName) => ({ serviceName, image: 'image' }),
	);
	await release.create({
		client,
		user: 1,
		application: 1,
		composition: { services },
		source: 'test',
		commit: 'deadbeef',
		imgDescriptors,
		createImageProfiles,
	});
	return posts;
}

describe('release.create', () => {
	beforeEach(() => mockServer.start());
	afterEach(() => mockServer.stop());

	it('should expose a create method', () => {
		expect(release.create).to.be.a('function');
	});

	it('posts an image_profile row per declared profile to the /resin model', async () => {
		const posts = await runCreate({
			main: { image: 'alpine' },
			debug: { image: 'busybox', profiles: ['debug', 'trace'] },
		});

		const profilePosts = posts.filter((p) => p.path === '/resin/image_profile');
		expect(profilePosts.map((p) => p.body.profile_name)).to.have.members([
			'debug',
			'trace',
		]);
		// Each row references a created release image.
		expect(
			profilePosts.every((p) => typeof p.body.release_image === 'number'),
		).to.equal(true);
		// The other writes still target the caller's /v7 prefix.
		expect(posts.some((p) => p.path === '/v7/release')).to.equal(true);
	});

	it('posts no image_profile rows for services without profiles', async () => {
		const posts = await runCreate({ main: { image: 'alpine' } });
		expect(posts.some((p) => p.path.endsWith('/image_profile'))).to.equal(
			false,
		);
	});

	it('posts no image_profile rows when createImageProfiles is not set', async () => {
		const posts = await runCreate(
			{ debug: { image: 'busybox', profiles: ['debug'] } },
			false,
		);
		expect(posts.some((p) => p.path.endsWith('/image_profile'))).to.equal(
			false,
		);
	});
});
