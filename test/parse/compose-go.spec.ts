import { expect } from 'chai';
import { parse } from '../../lib/parse/compose-go';
import * as path from 'path';

describe('compose-go-wasm', () => {
	it('should correctly parse a compose file', async () => {
		const composeFile = path.join(
			__dirname,
			'fixtures',
			'docker-compose.yml',
		);

		const projectJson = await parse(composeFile, 'my-project');
		console.log({ projectJson });
		const project = JSON.parse(projectJson);

		expect(project).to.deep.equal({
			name: 'my-project',
			services: {
				web: {
					image: 'nginx:latest',
					command: ['nginx', '-g', 'daemon off;'],
					entrypoint: null,
					ports: [
						{
							mode: 'ingress',
							target: 80,
							published: '8080',
							protocol: 'tcp',
						},
					],
					volumes: [
						{
							type: 'volume',
							source: 'nginx',
							target: '/etc/nginx/nginx.conf',
							volume: {},
						},
					],
					networks: {
						'web-network': null,
					},
				},
			},
			networks: {
				'web-network': {
					name: 'my-project_web-network',
					ipam: {},
				},
			},
			volumes: {
				nginx: {
					name: 'my-project_nginx',
				},
			},
		});
	});
});
