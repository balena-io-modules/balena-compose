import { expect } from 'chai';
import { parse } from '../../lib/parse/compose-go';

describe('compose-go', () => {
	it('should parse a simple compose file', async () => {
		const composition = await parse('test/parse/fixtures/compose.simple.yml');
		expect(composition.services).to.be.an('object');
		expect(composition.networks).to.be.an('object');
		expect(composition.volumes).to.be.an('object');
	});

	it('should remove project name and version from composition', async () => {
		const composition = await parse('test/parse/fixtures/compose.name.yml');
		// `name` is not used by balena
		expect(composition.name).to.be.undefined;
		// `version` is deprecated
		expect(composition.version).to.be.undefined;
	});
});
