import { TypedError } from 'typed-error';

export class ObjectDoesNotExistError extends TypedError {}
export class UniqueConstraintError extends TypedError {}
export class UnauthorisedError extends TypedError {}
export class BadRequestError extends TypedError {}
export class ServerError extends TypedError {}

export class HttpResponseError extends TypedError {
	constructor(message: string | Error, public statusCode: number) {
		super(message);
	}
}

export class ConflictError extends HttpResponseError {}
