/**
 * Re-export of the primitive interface to create releases.
 */
export { create, Request, Response, updateImage, updateRelease } from './api';

/**
 * Re-export of all errors thrown by this module.
 */
export {
	BadRequestError,
	HttpResponseError,
	ObjectDoesNotExistError,
	ServerError,
	UnauthorisedError,
} from './errors';
