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

import {
	MEDIATYPE_MANIFEST_V1,
	MEDIATYPE_MANIFEST_LIST_V2,
	MEDIATYPE_MANIFEST_V2,
	getManifest,
	DockerImageManifest,
	DockerImageManifestPlatform,
} from '../../lib/multibuild/manifests';
import { expect } from 'chai';
import * as Dockermodem from 'docker-modem';

class Tester {
	private repoString: string;
	private modem: Dockermodem;

	public constructor(repoString: string) {
		this.repoString = repoString;
		this.modem = new Dockermodem();
	}

	public testGetManifest(): void {
		it('should return a manifest', async () => {
			const result = await getManifest(this.modem, this.repoString);
			expect(result).to.be.not.null;
			const manifest = result as DockerImageManifest;
			expect(manifest.Descriptor.mediaType).to.be.oneOf([
				MEDIATYPE_MANIFEST_V1,
				MEDIATYPE_MANIFEST_LIST_V2,
				MEDIATYPE_MANIFEST_V2,
			]);
			expect(manifest.Descriptor.digest).to.not.be.undefined;
			expect(manifest.Platforms).to.not.be.undefined;
			expect(Array.isArray(manifest.Platforms)).to.be.true;
			manifest.Platforms!.forEach((p: DockerImageManifestPlatform) => {
				expect(p!.architecture).to.be.not.undefined;
				expect(p!.os).to.be.not.undefined;
			});
		});
	}

	public testGetManifest_BadRepo(): void {
		it('should return a 403 for an unknown repo', async () => {
			try {
				await getManifest(this.modem, 'someunknownrepodude');
			} catch (err) {
				expect(err.statusCode).to.be.equal(403);
			}
		});
	}
}

describe('docker.io', () => {
	const tester = new Tester('busybox');

	describe('getManifest', () => {
		tester.testGetManifest();
	});
});

describe('grc.io', () => {
	const tester = new Tester('gcr.io/google_containers/pause:latest');

	describe('getManifest', () => {
		tester.testGetManifest();
	});
});
