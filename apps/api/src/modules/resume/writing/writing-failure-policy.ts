import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from '../../ai/ai-errors';

export type WritingFailureReason = 'ai_key_rejected' | 'ai_balance_exhausted' | 'ai_unavailable' | null;

export type FailureKind =
  | 'key'
  | 'balance'
  | 'transient-last'
  | 'transient-retry'
  | 'infra-last'
  | 'infra-retry';

export interface FailureDecision {
  readonly kind: FailureKind;
  readonly failureReason: WritingFailureReason;
  readonly unrecoverable: boolean;
  readonly shouldMark: boolean;
}

export interface ClassifyFailureInput {
  readonly error: unknown;
  readonly isLastAttempt: boolean;
}

export interface LastAttemptInput {
  readonly attemptsMade: number;
  readonly attempts?: number;
}

export interface PipelineErrorInput {
  readonly job: { readonly name?: string; readonly attemptsMade: number; readonly opts: { readonly attempts?: number } };
  readonly resumeId: string;
  readonly startedAt: number;
  readonly error: unknown;
}

export interface ReportFailureInput {
  readonly resumeId: string;
  readonly startedAt: number;
  readonly failureReason: WritingFailureReason;
  readonly kind: 'base' | 'tailored';
}

export class WritingFailurePolicy {
  decide(input: ClassifyFailureInput): FailureDecision {
    if (input.error instanceof AiKeyMissingError || input.error instanceof AiKeyRejectedError) {
      return { kind: 'key', failureReason: 'ai_key_rejected', unrecoverable: true, shouldMark: true };
    }
    if (input.error instanceof AiBalanceExhaustedError) {
      return { kind: 'balance', failureReason: 'ai_balance_exhausted', unrecoverable: true, shouldMark: true };
    }
    if (this.isTransientError(input.error)) {
      if (input.isLastAttempt) {
        return { kind: 'transient-last', failureReason: 'ai_unavailable', unrecoverable: false, shouldMark: true };
      }
      return { kind: 'transient-retry', failureReason: 'ai_unavailable', unrecoverable: false, shouldMark: false };
    }
    if (input.isLastAttempt) {
      return { kind: 'infra-last', failureReason: null, unrecoverable: false, shouldMark: true };
    }
    return { kind: 'infra-retry', failureReason: null, unrecoverable: false, shouldMark: false };
  }

  isTransientError(error: unknown): boolean {
    return (
      error instanceof AiUnavailableError ||
      error instanceof AiTimeoutError ||
      error instanceof AiResponseInvalidError
    );
  }

  isLastAttempt(input: LastAttemptInput): boolean {
    return input.attemptsMade + 1 >= (input.attempts ?? 1);
  }
}
