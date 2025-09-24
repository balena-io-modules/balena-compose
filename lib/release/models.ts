import * as errors from './errors';

export function wrapResponseError(e: Error): never {
	const error: { statusCode?: number; message?: unknown } = e;
	if (!error.statusCode) {
		throw e;
	}
	switch (error.statusCode) {
		case 400:
			throw new errors.BadRequestError(e);
		case 401:
			throw new errors.UnauthorisedError(e);
		case 404:
			throw new errors.ObjectDoesNotExistError(e);
		case 409:
			if (typeof error.message === 'string' && /unique/i.test(error.message)) {
				throw new errors.UniqueConstraintError(e);
			}
			throw new errors.ConflictError(e, error.statusCode);
		case 500:
			throw new errors.ServerError(e);
		default:
			throw new errors.HttpResponseError(e, error.statusCode);
	}
}
