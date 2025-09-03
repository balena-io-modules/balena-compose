import { TypedError } from 'typed-error';

export class ComposeError extends TypedError {
	constructor(
		public message: string,
		// The error level, e.g. "error", "fatal", "panic"
		public level = 'error',
		public name = 'ComposeError',
	) {
		super(message);
	}
}

export class ValidationError extends ComposeError {
	constructor(public message: string) {
		super(message, 'error', 'ValidationError');
	}
}

export class ServiceError extends ComposeError {
	constructor(
		public message: string,
		public serviceName: string,
	) {
		super(message, 'error', 'ServiceError');
	}
}

export class ArgumentError extends ComposeError {
	constructor(public message: string) {
		super(message, 'error', 'ArgumentError');
	}
}
