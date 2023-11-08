import { TypedError } from 'typed-error';

export class ValidationError extends TypedError {}
export class InternalInconsistencyError extends TypedError {}

export class ServiceError extends ValidationError {
	constructor(
		public serviceName: string,
		err?: Error | string,
	) {
		super(err);
	}
}
