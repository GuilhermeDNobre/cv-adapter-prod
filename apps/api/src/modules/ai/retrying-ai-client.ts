import type { AiClient, AiRequest } from './ai-client';
import {
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from './ai-errors';

export const MAX_AI_RETRIES = 2;
export const AI_RETRY_DELAY_MS = 1000;

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly delayMs: number;
}

type RetryableErrorKind = 'invalid_response' | 'timeout' | 'unavailable';

export class RetryingAiClient implements AiClient {
  constructor(
    private readonly inner: AiClient,
    private readonly policy: RetryPolicy,
  ) {}

  async complete<TOutput>(request: AiRequest<TOutput>): Promise<TOutput> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.policy.maxRetries + 1; attempt += 1) {
      try {
        return await this.inner.complete({ ...request, attempt });
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt > this.policy.maxRetries) {
          throw error;
        }
        console.log('ai.request.retrying', {
          promptName: request.promptName,
          attempt,
          errorKind: toRetryErrorKind(error),
        });
        await delay(this.policy.delayMs);
      }
    }
    throw lastError;
  }
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof AiResponseInvalidError ||
    error instanceof AiTimeoutError ||
    error instanceof AiUnavailableError
  );
}

function toRetryErrorKind(error: unknown): RetryableErrorKind {
  if (error instanceof AiResponseInvalidError) {
    return 'invalid_response';
  }
  if (error instanceof AiTimeoutError) {
    return 'timeout';
  }
  return 'unavailable';
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
