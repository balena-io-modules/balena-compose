import { expect } from 'chai';
// import { spawn } from 'node:child_process';
import * as path from 'node:path';
// import { promises as fs } from 'node:fs';

import * as composeGo from '../../lib/parse/compose-go-bin';

describe('compose-go-bin', () => {
	it.skip('should take docker-compose.yml filepath as first input', async () => {
		const parsed = await composeGo.parse({
			composeFilePath: path.resolve(__dirname, 'fixtures', 'docker-compose.test.yml'),
		});

		expect(parsed).to.deep.equal({
			services: {
				base: {
					image: 'alpine:latest',
                    command: ['sh', '-c', 'sleep infinity'],
                    labels: {
                        'io.balena.features.supervisor-api': '1',
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
