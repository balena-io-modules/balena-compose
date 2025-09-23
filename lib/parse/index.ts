export function defaultComposition(
	image?: string,
	dockerfile?: string,
): string {
	let context: string;
	if (image) {
		context = `image: ${image}`;
	} else {
		if (dockerfile) {
			context = `build: {context: ".", dockerfile: "${dockerfile}"}`;
		} else {
			context = 'build: "."';
		}
	}
	return `# This file has been auto-generated.
networks: {}
volumes:
  resin-data: {}
services:
  main:
    ${context}
    privileged: true
    tty: true
    restart: always
    network_mode: host
    volumes:
      - type: volume
        source: resin-data
        target: /data
    labels:
      io.resin.features.kernel-modules: 1
      io.resin.features.firmware: 1
      io.resin.features.dbus: 1
      io.resin.features.supervisor-api: 1
      io.resin.features.resin-api: 1
`;
}
