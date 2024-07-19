import pMap = require('p-map');
import type { PinejsClientCore } from 'pinejs-client-core';
import * as models from './models';
import type { Dict } from './types';

import type { Composition } from '../../lib/parse';

const MAX_CONCURRENT_REQUESTS = 5;

export interface Request {
	/**
	 * An instance of PineJS, appropriately authenticated and configured for the
	 * API server to use. The compatible API versions are v5 and v6, so make sure to
	 * configure `apiPrefix` appropriately.
	 *
	 * ```
	 * import Pine from 'pinejs-client-fetch';
	 * const client = new Pine({
	 *   apiPrefix: 'https://api.balena-cloud.com/v6',
	 *   passthrough: {
	 *     headers: {
	 *       Authorization: `Bearer ${authToken}`,
	 *     },
	 *   },
	 * });
	 * ```
	 */
	client: PinejsClientCore<unknown>;

	/**
	 * The ID of the user the release should belong to. The user authenticated via `client`
	 * (see above) must match or be a collaborator of `user` for the given `application`.
	 */
	user: number;

	/**
	 * The application ID this release is for. The client issuing the request
	 * must have read access to this application.
	 */
	application: number;

	/**
	 * The composition to deploy; it should be a normalised structure whose schema
	 * is defined in `@balena/compose-parse`.
	 *
	 * See: https://github.com/balena-io-modules/balena-compose-parse
	 */
	composition: Composition;

	/**
	 * An identifier for the deploy's origin.
	 */
	source: string;

	/**
	 * The external identifier for the release.
	 */
	commit: string;

	/**
	 * Mark the created release as final/draft
	 */
	is_final?: boolean;

	/**
	 * Release version string
	 */
	semver?: string;

	/** 'balena.yml' contract contents (stringified JSON) */
	contract?: string;
}

export interface Response {
	release: models.ReleaseModel;
	serviceImages: Dict<models.ImageModel>;
}

/**
 * This is the entry point for deploying a docker-compose.yml to devices.
 */
export async function create(req: Request): Promise<Response> {
	const api = req.client;

	// Ensure that the user and app exist and the user has access to them.
	const [user, application] = await Promise.all([
		getUser(api, req.user),
		getApplication(api, req.application),
	]);

	const release = await createRelease(api, {
		is_created_by__user: user.id,
		belongs_to__application: application.id,
		composition: req.composition,
		commit: req.commit,
		status: 'running',
		source: req.source,
		start_timestamp: new Date(),
		is_final: !!req.is_final,
		contract: req.contract,
		// Only set semver if provided on the request
		...(!!req.semver && { semver: req.semver }),
	});

	const res = { release, serviceImages: {} } as Response;

	// Create services and associated image, labels and env vars
	await pMap(
		Object.entries(req.composition.services),
		async ([serviceName, serviceDescription]) => {
			const service = await getOrCreateService(api, {
				application: application.id,
				service_name: serviceName,
			});

			// Create images and attach labels and env vars
			const img = await createImage(
				api,
				res.release.id,
				serviceDescription.labels,
				serviceDescription.environment,
				{
					is_a_build_of__service: service.id,
					status: 'running',
					start_timestamp: new Date(),
				},
			);

			// Amend response with image details for the service
			res.serviceImages[serviceName] = img;

			return service;
		},
		{
			concurrency: MAX_CONCURRENT_REQUESTS,
		},
	);

	return res;
}

export async function updateRelease(
	api: PinejsClientCore<unknown>,
	id: number,
	body: Partial<models.ReleaseAttributes>,
): Promise<void> {
	await api
		.patch({
			resource: 'release',
			id,
			body,
		} as const)
		.catch(models.wrapResponseError);
}

export async function updateImage(
	api: PinejsClientCore<unknown>,
	id: number,
	body: Partial<models.ImageAttributes>,
): Promise<void> {
	await api
		.patch({
			resource: 'image',
			id,
			body,
		} as const)
		.catch(models.wrapResponseError);
}

// Helpers

async function getUser(
	api: PinejsClientCore<unknown>,
	id: number,
): Promise<models.UserModel> {
	const user = await api
		.get({
			resource: 'user',
			id,
			options: { $select: 'id' },
		} as const)
		.catch(models.wrapResponseError);
	if (user == null) {
		throw new Error('Could not find user with id: ' + id);
	}
	return user;
}

async function getApplication(
	api: PinejsClientCore<unknown>,
	id: number,
): Promise<models.ApplicationModel> {
	const app = await api
		.get({
			resource: 'application',
			id,
			options: { $select: 'id' },
		} as const)
		.catch(models.wrapResponseError);
	if (app == null) {
		throw new Error('Could not find application with id: ' + id);
	}
	return app;
}

async function getOrCreateService(
	api: PinejsClientCore<unknown>,
	body: models.ServiceAttributes,
): Promise<models.ServiceModel> {
	return (await api
		.getOrCreate({
			resource: 'service',
			id: {
				application: body.application,
				service_name: body.service_name,
			},
			body,
		} as const)
		.catch(models.wrapResponseError)) as models.ServiceModel;
}

async function createRelease(
	api: PinejsClientCore<unknown>,
	body: models.ReleaseAttributes,
): Promise<models.ReleaseModel> {
	return (await api
		.post({
			resource: 'release',
			body,
		})
		.catch(models.wrapResponseError)) as models.ReleaseModel;
}

async function createImage(
	api: PinejsClientCore<unknown>,
	release: number,
	labels: Dict<string> | undefined,
	envvars: Dict<string> | undefined,
	body: models.ImageAttributes,
): Promise<models.ImageModel> {
	const image = (await api
		.post({
			resource: 'image',
			body,
		} as const)
		.catch(models.wrapResponseError)) as models.ImageModel;

	const releaseImage = (await api
		.post({
			resource: 'image__is_part_of__release',
			body: {
				is_part_of__release: release,
				image: image.id,
			},
		} as const)
		.catch(models.wrapResponseError)) as models.ReleaseImageModel;

	if (labels) {
		await pMap(
			Object.entries(labels),
			async ([name, value]) => {
				await api
					.post({
						resource: 'image_label',
						body: {
							release_image: releaseImage.id,
							label_name: name,
							value: (value || '').toString(),
						},
					} as const)
					.catch(models.wrapResponseError);
			},
			{
				concurrency: MAX_CONCURRENT_REQUESTS,
			},
		);
	}

	if (envvars) {
		await pMap(
			Object.entries(envvars),
			async ([name, value]) => {
				await api
					.post({
						resource: 'image_environment_variable',
						body: {
							release_image: releaseImage.id,
							name,
							value: (value || '').toString(),
						},
					} as const)
					.catch(models.wrapResponseError);
			},
			{
				concurrency: MAX_CONCURRENT_REQUESTS,
			},
		);
	}

	return image;
}
