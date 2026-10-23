import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AiClient, AiRequest } from './ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from './ai-errors';
import { RetryingAiClient } from './retrying-ai-client';

const sampleSchema = z.object({ summary: z.string() });
type SampleOutput = z.infer<typeof sampleSchema>;

function makeRequest(): AiRequest<SampleOutput> {
  return {
    promptName: 'parse-job-description',
    payload: { text: 'resume text' },
    outputSchema: sampleSchema,
  };
}

function createInner(): AiClient & { complete: ReturnType<typeof vi.fn> } {
  const complete = vi.fn();
  return { complete } as unknown as AiClient & { complete: ReturnType<typeof vi.fn> };
}

describe('RetryingAiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should retry an invalid response once and return the successful value', async () => {
    const inner = createInner();
    inner.complete
      .mockRejectedValueOnce(new AiResponseInvalidError('malformed_json'))
      .mockResolvedValueOnce({ summary: 'recovered' });
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    const result = await client.complete(makeRequest());

    expect(result).toEqual({ summary: 'recovered' });
    expect(inner.complete).toHaveBeenCalledTimes(2);
  });

  it('should retry a timeout error', async () => {
    const inner = createInner();
    inner.complete
      .mockRejectedValueOnce(new AiTimeoutError(60_000))
      .mockResolvedValueOnce({ summary: 'recovered' });
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    const result = await client.complete(makeRequest());

    expect(result).toEqual({ summary: 'recovered' });
    expect(inner.complete).toHaveBeenCalledTimes(2);
  });

  it('should retry an unavailable error', async () => {
    const inner = createInner();
    inner.complete
      .mockRejectedValueOnce(new AiUnavailableError(500))
      .mockResolvedValueOnce({ summary: 'recovered' });
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    const result = await client.complete(makeRequest());

    expect(result).toEqual({ summary: 'recovered' });
    expect(inner.complete).toHaveBeenCalledTimes(2);
  });

  it('should stop at maxRetries and rethrow the last error without wrapping', async () => {
    const inner = createInner();
    const first = new AiUnavailableError(500);
    const second = new AiUnavailableError(503);
    const third = new AiUnavailableError(429);
    inner.complete
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(second)
      .mockRejectedValueOnce(third);
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    const error = await client.complete(makeRequest()).catch((thrown: unknown) => thrown);

    expect(error).toBe(third);
    expect(inner.complete).toHaveBeenCalledTimes(3);
  });

  it('should never retry a missing key', async () => {
    const inner = createInner();
    inner.complete.mockRejectedValue(new AiKeyMissingError());
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiKeyMissingError);

    expect(inner.complete).toHaveBeenCalledTimes(1);
  });

  it('should never retry a rejected key', async () => {
    const inner = createInner();
    inner.complete.mockRejectedValue(new AiKeyRejectedError());
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiKeyRejectedError);

    expect(inner.complete).toHaveBeenCalledTimes(1);
  });

  it('should never retry an exhausted balance', async () => {
    const inner = createInner();
    inner.complete.mockRejectedValue(new AiBalanceExhaustedError());
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiBalanceExhaustedError);

    expect(inner.complete).toHaveBeenCalledTimes(1);
  });

  it('should wait delayMs between attempts', async () => {
    vi.useFakeTimers();
    const inner = createInner();
    inner.complete
      .mockRejectedValueOnce(new AiUnavailableError(500))
      .mockResolvedValueOnce({ summary: 'recovered' });
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1000 });

    const pending = client.complete(makeRequest());
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.complete).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ summary: 'recovered' });
    expect(inner.complete).toHaveBeenCalledTimes(2);
  });

  it('should forward the attempt number to the inner client', async () => {
    const inner = createInner();
    inner.complete
      .mockRejectedValueOnce(new AiUnavailableError(500))
      .mockRejectedValueOnce(new AiUnavailableError(500))
      .mockResolvedValueOnce({ summary: 'recovered' });
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    await client.complete(makeRequest());

    expect(inner.complete).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt: 1 }));
    expect(inner.complete).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 2 }));
    expect(inner.complete).toHaveBeenNthCalledWith(3, expect.objectContaining({ attempt: 3 }));
  });

  it('should log a retrying event before each new attempt without the payload', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const inner = createInner();
    inner.complete
      .mockRejectedValueOnce(new AiTimeoutError(60_000))
      .mockResolvedValueOnce({ summary: 'recovered' });
    const client = new RetryingAiClient(inner, { maxRetries: 2, delayMs: 1 });

    await client.complete(makeRequest());

    expect(logSpy).toHaveBeenCalledWith('ai.request.retrying', {
      promptName: 'parse-job-description',
      attempt: 1,
      errorKind: 'timeout',
    });
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('resume text');
  });
});
