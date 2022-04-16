# balena-compose

Complete toolkit to build docker-compose.yml files and optionally deploy them to balenaCloud.

Important: balena-compose is stable and perfectly usable but also, fundamentally, just a merge of several pre-existing different modules, that are merely re-exported from this one. You should expect a complete rewrite of the exported API in the medium term. What follows are pretty much the concatenated READMEs of these modules.


## multibuild

This module is designed to make it easy to build a composition given a
representation of this composition, and a tar stream. The output will be several
images present on the given docker daemon.

### Reference

```
function splitBuildStream(composition: Composition, buildStream: ReadableStream): Promise<BuildTask[]>
```

Given a Composition which conforms to the type from
[@balena/compose-parse](https://github.com/balena-io-modules/balena-compose-parse)
and a stream which will produce a tar archive, split this tar archive into a set
of build tasks which can then be further processed.

```
function performResolution(
	tasks: BuildTask[],
	architecture: string,
	deviceType: string
): Promise<BuildTask[]>
```

Given a list of build tasks, resolve the projects to a form which the docker
daemon can build. Currently this function supports all project types which
[resin-bundle-resolve](https://github.com/resin-io-modules/resin-bundle-resolve)
supports.

Note that this function will also populate the `dockerfile` and `projectType`
values in the build tasks.

```
function performBuilds(
	tasks: BuildTask[],
	docker: Dockerode
): Promise<LocalImage[]>
```

Given a list of build tasks, perform the task necessary for the LocalImage to be
produced. A local image represents an image present on the docker daemon given.

Note that one should assign a stream handling function for build output OR a
progress handling function for image pull output **before** calling this
function. The fields for these functions are `streamHook` and `progressHook`.

### Example (pseudocode)

```typescript
import * as Promise from 'bluebird';

import { Composition, normalize } from '@balena/compose-parse';
import { multibuild } from '@balena/compose';

const { splitBuildStream, performBuilds } = multibuild;

// Get a tar stream and composition from somewhere
const stream = getBuildStream();
const composeFile = getComposeFile();
const docker = getDockerodeHandle();

// Parse the compose file
const comp = normalize(composeFile);

splitBuildStream(comp, stream)
.then((tasks) => {
	return performResolution(tasks, 'armv7hf', 'raspberrypi3');
})
.map((task) => {
	if (task.external) {
		task.progressHook = (progress) => {
			console.log(task.serviceName + ': ' + progress);
		};
	} else {
		task.streamHook = (stream) => {
			stream.on('data', (data) => {
				console.log(task.serviceName + ': ', data.toString());
			});
		};
	}
	return task;
})
.then((tasks) => {
	return performBuilds(builds, docker);
})
.then((images) => {
	// Do something with your images
});

```
