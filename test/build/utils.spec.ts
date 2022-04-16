import { expect } from 'chai';
import { extractFromTag } from '../../lib/build/utils';

describe('utils', () => {
	it('can extract FROM statements', () => {
		expect(extractFromTag('FROM ubuntu:18.04')).to.deep.equal({
			repo: 'ubuntu',
			tag: '18.04',
		});
		expect(extractFromTag('Step 1/28 : FROM ubuntu')).to.deep.equal({
			repo: 'ubuntu',
			tag: 'latest',
		});
		expect(extractFromTag('something different')).to.be.equal(undefined);
		expect(extractFromTag('Step 1/28 : FROM ubuntu as base')).to.deep.equal({
			repo: 'ubuntu',
			tag: 'latest',
			alias: 'base',
		});
		expect(
			extractFromTag('Step 1/28 : FROM some/image-name:1.2.3-tag as my-name'),
		).to.deep.equal({
			repo: 'some/image-name',
			tag: '1.2.3-tag',
			alias: 'my-name',
		});
	});
});
