import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import {
  AI_ERROR_MESSAGES,
  aiErrorMessageFor,
  aiErrorMessageForCode,
  failureReasonMessage,
} from './ai-error-messages';

function apiErrorWithCode(code: string): ApiError {
  return new ApiError(422, 'rejected', { statusCode: 422, code, message: 'rejected' });
}

describe('aiErrorMessageForCode', () => {
  it('should explain a missing key and point at informing it', () => {
    expect(aiErrorMessageForCode('ai_key_missing')).toContain('Não há chave');
  });
  it('should explain a rejected key and point at settings', () => {
    expect(aiErrorMessageForCode('ai_key_rejected')).toContain('recusou');
  });
  it('should explain an exhausted balance and point at recharging', () => {
    expect(aiErrorMessageForCode('ai_balance_exhausted')).toContain('saldo');
  });
  it('should ask for a retry when the AI is unavailable', () => {
    expect(aiErrorMessageForCode('ai_unavailable')).toContain('Tente de novo');
  });
  it('should explain when there is no text to rewrite', () => {
    expect(aiErrorMessageForCode('nothing_to_rewrite')).toContain('Não há texto');
  });
  it('should explain when rewritten claims lack backing', () => {
    expect(aiErrorMessageForCode('rewrite_claims_rejected')).toContain('sem lastro');
  });
});

describe('aiErrorMessageFor', () => {
  it('should return the mapped message when the error carries a code', () => {
    expect(aiErrorMessageFor(apiErrorWithCode('ai_balance_exhausted'), 'genérica')).toBe(
      AI_ERROR_MESSAGES['ai_balance_exhausted'],
    );
  });

  it('should return the fallback when the error carries no code', () => {
    expect(aiErrorMessageFor(new ApiError(422, 'not a job'), 'genérica')).toBe('genérica');
  });

  it('should return the fallback when the error is not an ApiError', () => {
    expect(aiErrorMessageFor(new Error('network down'), 'genérica')).toBe('genérica');
  });
});

describe('failureReasonMessage', () => {
  it('should map a persisted AI failure reason to its message', () => {
    expect(failureReasonMessage('ai_key_rejected', 'genérica')).toBe(
      AI_ERROR_MESSAGES['ai_key_rejected'],
    );
  });

  it('should return the fallback for a null reason', () => {
    expect(failureReasonMessage(null, 'genérica')).toBe('genérica');
  });

  it('should return the fallback for a non-AI reason', () => {
    expect(failureReasonMessage('no_text_layer', 'genérica')).toBe('genérica');
  });
});
