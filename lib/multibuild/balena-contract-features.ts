import type { BuildTask } from './build-task';
import type * as Compose from '../parse';

export interface ContractFeature {
	type: string;
	version?: string;
}

export interface Contract {
	name: string;
	type: 'sw.container';
	slug: string;
	requires?: ContractFeature[];
}

export function insertBalenaCustomContractFeatures(
	task: BuildTask,
	image: Compose.ImageDescriptor,
): void {
	insertDependsOnServiceHeathyFeature(task, image);
}

function insertDependsOnServiceHeathyFeature(
	task: BuildTask,
	image: Compose.ImageDescriptor,
): void {
	const serviceNames = Object.keys(image.originalComposition?.services ?? {});
	for (const serviceName of serviceNames) {
		const service = image.originalComposition?.services[serviceName];
		if (service?.depends_on != null) {
			for (const dep of service.depends_on) {
				if (dep === 'service_healthy' || dep === 'service-healthy') {
					const feature: ContractFeature = {
						type: 'sw.private.compose.service-healthy-depends-on',
						version: '1.0.0',
					};

					insertContractFeature(task, feature);
					return;
				}
			}
		}
	}
}

function insertContractFeature(
	task: BuildTask,
	feature: ContractFeature,
): void {
	if (task.contract == null) {
		task.contract = defaultContract();
	}

	if (
		task.contract.requires
			?.map((require) => require.type)
			.includes(feature.type)
	) {
		return;
	}

	if (task.contract.requires != null) {
		task.contract.requires.push(feature);
	} else {
		task.contract.requires = [feature];
	}
}

function defaultContract(): Contract {
	return {
		name: 'default',
		type: 'sw.container',
		slug: 'default',
		requires: [],
	};
}
