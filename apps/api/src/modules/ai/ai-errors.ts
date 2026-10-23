export type AiResponseInvalidReason =
  | 'invalid_envelope'
  | 'malformed_json'
  | 'schema_mismatch';

export abstract class AiError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AiResponseInvalidError extends AiError {
  readonly reason: AiResponseInvalidReason;

  constructor(reason: AiResponseInvalidReason) {
    super(`DeepSeek response rejected: ${reason}`);
    this.reason = reason;
  }
}

export class AiTimeoutError extends AiError {
  constructor(timeoutMs: number) {
    super(`DeepSeek request timed out after ${timeoutMs}ms`);
  }
}

export class AiUnavailableError extends AiError {
  readonly httpStatus: number | undefined;

  constructor(httpStatus?: number) {
    super(
      httpStatus !== undefined
        ? `DeepSeek API unavailable (HTTP ${httpStatus})`
        : 'DeepSeek API unavailable',
    );
    this.httpStatus = httpStatus;
  }
}

export class AiKeyMissingError extends AiError {
  constructor() {
    super('DeepSeek API key is missing');
  }
}

export class AiKeyRejectedError extends AiError {
  constructor() {
    super('DeepSeek API key was rejected');
  }
}

export class AiBalanceExhaustedError extends AiError {
  constructor() {
    super('DeepSeek balance is exhausted');
  }
}
