import { describe, expect, it } from 'vitest';
import {
  BASE_RESUME_PROPOSAL_QUEUE,
  DEFAULT_JOB_OPTIONS,
  EVALUATION_QUEUE,
  JOB_BACKOFF_DELAY_MS,
  JOB_MAX_ATTEMPTS,
  RESUME_IMPORT_QUEUE,
  RESUME_WRITING_QUEUE,
} from './queue.module';

describe('queue names', () => {
  it('should stay distinct, or the two processors would consume each other jobs', () => {
    expect(RESUME_IMPORT_QUEUE).not.toBe(EVALUATION_QUEUE);
  });

  it('should keep the proposal queue distinct from the other queues', () => {
    expect(BASE_RESUME_PROPOSAL_QUEUE).not.toBe(RESUME_IMPORT_QUEUE);
    expect(BASE_RESUME_PROPOSAL_QUEUE).not.toBe(EVALUATION_QUEUE);
    expect(BASE_RESUME_PROPOSAL_QUEUE).not.toBe(RESUME_WRITING_QUEUE);
  });
});

describe('default job options', () => {
  it('should retry three times', () => {
    expect(JOB_MAX_ATTEMPTS).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
  });

  it('should back off exponentially with a two second delay', () => {
    expect(JOB_BACKOFF_DELAY_MS).toBe(2000);
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });
});
