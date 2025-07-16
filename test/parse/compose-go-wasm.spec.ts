import { expect } from 'chai';
import { parse } from '../../lib/parse/compose-go-wasm';
import * as path from 'path';

describe('compose-go-wasm', () => {
	it('should correctly parse a compose file', async () => {
		console.log('STARTING TEST');
		const composeFile = path.join(
			__dirname,
			'fixtures',
			'docker-compose.yml',
		);

		const project = await parse(composeFile, 'my-project');

		console.log({ project });

		expect(project).to.deep.equal({
			services: {
				web: {
					image: 'nginx:latest',
					command: ['nginx', '-g', 'daemon off;'],
					ports: ['8080:80'],
					volumes: ['nginx:/etc/nginx/nginx.conf'],
					networks: ['web-network'],
				},
			},
			networks: {
				webNetwork: {
					name: 'web-network',
				},
			},
			volumes: {
				nginx: {
					name: 'nginx',
				},
			},
		});
	});
});
