import type { Composition } from '@balena/compose-parser';

export function defaultComposition(
	image?: string,
	dockerfile?: string,
): Composition {
	const composition: Composition = {
		networks: {},
		volumes: {
			'resin-data': {},
		},
		services: {
			main: {
				privileged: true,
				tty: true,
				restart: 'always',
				network_mode: 'host',
				volumes: ['resin-data:/data'],
				labels: {
					'io.balena.features.kernel-modules': '1',
					'io.balena.features.firmware': '1',
					'io.balena.features.dbus': '1',
					'io.balena.features.supervisor-api': '1',
					'io.balena.features.resin-api': '1',
				},
			},
		},
	};

	if (image) {
		composition.services.main.image = image;
	} else {
		if (dockerfile) {
			composition.services.main.build = {
				context: '.',
				dockerfile,
			};
		} else {
			composition.services.main.build = {
				context: '.',
			};
		}
	}

	return composition;
}
