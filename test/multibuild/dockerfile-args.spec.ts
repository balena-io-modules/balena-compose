/**
 * @license
 * Copyright 2017 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { expect } from 'chai';

import { getDockerfileImageReferences } from '../../lib/multibuild/build';

describe('Dockerfile FROM image references', () => {
	it('should resolve variables from global ARG defaults', async () => {
		const references = await getDockerfileImageReferences(
			[
				'ARG NODE_VERSION="22"',
				'ARG DOCKER_NODE_VARIANT="bookworm-slim"',
				'FROM node:${NODE_VERSION}-${DOCKER_NODE_VARIANT}',
			].join('\n'),
		);

		expect(references).to.deep.equal(['node:22-bookworm-slim']);
	});

	it('should prefer supplied build arguments over global ARG defaults', async () => {
		const references = await getDockerfileImageReferences(
			[
				'ARG NODE_VERSION=20',
				'ARG DOCKER_NODE_VARIANT=alpine',
				'FROM node:${NODE_VERSION}-${DOCKER_NODE_VARIANT}',
			].join('\n'),
			{
				NODE_VERSION: '22',
				DOCKER_NODE_VARIANT: 'bookworm-slim',
			},
		);

		expect(references).to.deep.equal(['node:22-bookworm-slim']);
	});

	it('should resolve ARG defaults using previously declared global arguments', async () => {
		const references = await getDockerfileImageReferences(
			[
				'ARG NODE_VERSION=22',
				'ARG NODE_IMAGE=node:${NODE_VERSION}-alpine',
				'FROM ${NODE_IMAGE}',
			].join('\n'),
		);

		expect(references).to.deep.equal(['node:22-alpine']);
	});

	it('should leave unresolved variables intact for the existing manifest fallback', async () => {
		const references = await getDockerfileImageReferences(
			'FROM node:${NODE_VERSION}-alpine',
		);

		expect(references).to.deep.equal(['node:${NODE_VERSION}-alpine']);
	});

	it('should not use stage-local ARG declarations to resolve FROM references', async () => {
		const references = await getDockerfileImageReferences(
			[
				'FROM alpine AS base',
				'ARG NODE_VERSION=22',
				'FROM node:${NODE_VERSION}-alpine',
			].join('\n'),
		);

		expect(references).to.deep.equal([
			'alpine',
			'node:${NODE_VERSION}-alpine',
		]);
	});

	it('should ignore references to previously declared build stages', async () => {
		const references = await getDockerfileImageReferences(
			[
				'FROM alpine AS base',
				'FROM base AS final',
			].join('\n'),
		);

		expect(references).to.deep.equal(['alpine']);
	});

	it('should preserve literal image references', async () => {
		const references = await getDockerfileImageReferences(
			'FROM node:22-bookworm-slim',
		);

		expect(references).to.deep.equal(['node:22-bookworm-slim']);
	});

	it('should support the default-value form of variable expansion', async () => {
		const references = await getDockerfileImageReferences(
			'FROM node:${NODE_VERSION:-22}-alpine',
		);

		expect(references).to.deep.equal(['node:22-alpine']);
	});
});
