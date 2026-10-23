import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AiRequest } from './ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from './ai-errors';
import { DeepSeekClient } from './deepseek-client';
import { registerPrompt } from './prompts/prompt';
import type { DeepSeekKeyStore } from '../settings/deepseek-key.repository';

const httpMocks = vi.hoisted(() => ({ create: vi.fn(), post: vi.fn() }));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: { ...actual.default, create: httpMocks.create },
  };
});

const EXPECTED_TIMEOUT_MS = 60_000;
const SAMPLE_SYSTEM_MESSAGE = 'Return a json object describing the job.';
const PAYLOAD_SECRET = 'CANARY-payload-resume-text';
const RESPONSE_SECRET = 'CANARY-response-content';
const API_KEY_SECRET = 'sk-live-key-1234';

const sampleSchema = z.object({ summary: z.string() });
type SampleOutput = z.infer<typeof sampleSchema>;

function makeRequest(): AiRequest<SampleOutput> {
  return {
    promptName: 'parse-job-description',
    payload: { text: PAYLOAD_SECRET },
    outputSchema: sampleSchema,
  };
}

function makeEnvelope(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

function createStore(apiKey: string | null): DeepSeekKeyStore & { current: string | null } {
  const store = {
    current: apiKey,
    findApiKey: vi.fn(async () => store.current),
    saveApiKey: vi.fn(async (next: string) => {
      store.current = next;
    }),
  };
  return store;
}

function createClient(store: DeepSeekKeyStore): DeepSeekClient {
  return new DeepSeekClient(
    new ConfigService({ DEEPSEEK_BASE_URL: 'https://deepseek.test/v1' }),
    store,
  );
}

function axiosErrorWithStatus(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status code ${String(status)}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    { status, data: makeEnvelope(RESPONSE_SECRET) } as unknown as AxiosResponse,
  );
}

describe('DeepSeekClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    httpMocks.create.mockReset();
    httpMocks.post.mockReset();
    httpMocks.create.mockReturnValue({ post: httpMocks.post });
    registerPrompt({
      name: 'parse-job-description',
      systemMessage: SAMPLE_SYSTEM_MESSAGE,
      outputSchema: sampleSchema,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the object typed by the request schema on success', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({
      status: 200,
      data: makeEnvelope('{"summary":"Senior backend role"}'),
    });

    const result = await client.complete(makeRequest());

    expect(result).toEqual({ summary: 'Senior backend role' });
  });

  it('should create the HTTP client with a 60s timeout and the configured base URL', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"summary":"x"}') });

    await client.complete(makeRequest());

    expect(httpMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://deepseek.test/v1',
        timeout: EXPECTED_TIMEOUT_MS,
      }),
    );
  });

  it('should send the stored key as Bearer on every call without baking it at boot', async () => {
    const store = createStore('sk-first-key-aaaa');
    const client = createClient(store);
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"summary":"x"}') });

    await client.complete(makeRequest());
    store.current = 'sk-second-key-bbbb';
    await client.complete(makeRequest());

    expect(httpMocks.post).toHaveBeenCalledTimes(2);
    expect(httpMocks.post.mock.calls[0]?.[2]).toMatchObject({
      headers: { Authorization: 'Bearer sk-first-key-aaaa' },
    });
    expect(httpMocks.post.mock.calls[1]?.[2]).toMatchObject({
      headers: { Authorization: 'Bearer sk-second-key-bbbb' },
    });
    expect(store.findApiKey).toHaveBeenCalledTimes(2);
  });

  it('should throw AiKeyMissingError without any request when no key is stored', async () => {
    const store = createStore(null);
    const client = createClient(store);

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiKeyMissingError);

    expect(httpMocks.post).not.toHaveBeenCalled();
  });

  it('should send response_format json_object with the json word in the system message', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"summary":"x"}') });

    await client.complete(makeRequest());

    expect(httpMocks.post).toHaveBeenCalledWith(
      'chat/completions',
      expect.objectContaining({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: SAMPLE_SYSTEM_MESSAGE },
          { role: 'user', content: JSON.stringify({ text: PAYLOAD_SECRET }) },
        ],
        response_format: { type: 'json_object' },
      }),
      expect.objectContaining({
        headers: { Authorization: `Bearer ${API_KEY_SECRET}` },
      }),
    );
  });

  it('should raise AiResponseInvalidError when the model returns malformed json', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"summary": ') });

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiResponseInvalidError);
  });

  it('should raise AiResponseInvalidError when valid json is outside the schema', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"wrong":1}') });

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiResponseInvalidError);
  });

  it('should raise AiResponseInvalidError when the envelope has no choices', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: { choices: [] } });

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiResponseInvalidError);
  });

  it('should raise AiTimeoutError when the request times out', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockRejectedValue(
      new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED'),
    );

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it('should raise AiKeyRejectedError when the provider returns 401', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockRejectedValue(axiosErrorWithStatus(401));

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiKeyRejectedError);
  });

  it('should raise AiBalanceExhaustedError when the provider returns 402', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockRejectedValue(axiosErrorWithStatus(402));

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiBalanceExhaustedError);
  });

  it('should raise AiUnavailableError when the provider returns 429', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockRejectedValue(axiosErrorWithStatus(429));

    const error = await client.complete(makeRequest()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as AiUnavailableError).httpStatus).toBe(429);
  });

  it('should raise AiUnavailableError with the status when the provider returns 500', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockRejectedValue(axiosErrorWithStatus(500));

    const error = await client.complete(makeRequest()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as AiUnavailableError).httpStatus).toBe(500);
  });

  it('should raise AiUnavailableError when the network fails without a response', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockRejectedValue(
      new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED'),
    );

    const error = await client.complete(makeRequest()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as AiUnavailableError).httpStatus).toBeUndefined();
  });

  it('should fail when completing an unregistered prompt', async () => {
    const client = createClient(createStore(API_KEY_SECRET));
    const request: AiRequest<SampleOutput> = {
      ...makeRequest(),
      promptName: 'evaluate-coverage',
    };

    await expect(client.complete(request)).rejects.toThrow(/is not registered/);
  });

  it('should log errorKind and never the key when the provider fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockRejectedValue(axiosErrorWithStatus(500));

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiUnavailableError);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('ai.request.failed', {
      promptName: 'parse-job-description',
      httpStatus: 500,
      durationMs: expect.any(Number),
      errorKind: 'unavailable',
      attempt: 1,
    });
    const loggedText = JSON.stringify(errorSpy.mock.calls);
    expect(loggedText).not.toContain(PAYLOAD_SECRET);
    expect(loggedText).not.toContain(RESPONSE_SECRET);
    expect(loggedText).not.toContain(SAMPLE_SYSTEM_MESSAGE);
    expect(loggedText).not.toContain(API_KEY_SECRET);
  });

  it('should log key_missing without any request when the store is empty', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createClient(createStore(null));

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiKeyMissingError);

    expect(httpMocks.post).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('ai.request.failed', {
      promptName: 'parse-job-description',
      httpStatus: null,
      durationMs: expect.any(Number),
      errorKind: 'key_missing',
      attempt: 1,
    });
  });

  it('should not leak response content into logs or errors when validation fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({
      status: 200,
      data: makeEnvelope(`{"wrong":"${RESPONSE_SECRET}"}`),
    });

    const error = await client.complete(makeRequest()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AiResponseInvalidError);
    expect((error as Error).message).not.toContain(RESPONSE_SECRET);
    expect((error as Error).stack ?? '').not.toContain(RESPONSE_SECRET);
    expect(errorSpy).toHaveBeenCalledWith('ai.request.failed', {
      promptName: 'parse-job-description',
      httpStatus: 200,
      durationMs: expect.any(Number),
      errorKind: 'invalid_response',
      attempt: 1,
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(RESPONSE_SECRET);
  });

  it('should not log an error on the success path', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"summary":"ok"}') });

    await client.complete(makeRequest());

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should log ai.request.completed with promptName and durationMs and without the payload', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"summary":"ok"}') });

    await client.complete(makeRequest());

    expect(logSpy).toHaveBeenCalledWith('ai.request.completed', {
      promptName: 'parse-job-description',
      durationMs: expect.any(Number),
      attempt: 1,
    });
    const loggedText = JSON.stringify(logSpy.mock.calls);
    expect(loggedText).not.toContain(PAYLOAD_SECRET);
    expect(loggedText).not.toContain(RESPONSE_SECRET);
    expect(loggedText).not.toContain(SAMPLE_SYSTEM_MESSAGE);
    expect(loggedText).not.toContain(API_KEY_SECRET);
  });

  it('should log invalid_response when the model returns malformed json', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"summary": ') });

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiResponseInvalidError);

    expect(errorSpy).toHaveBeenCalledWith('ai.request.failed', {
      promptName: 'parse-job-description',
      httpStatus: 200,
      durationMs: expect.any(Number),
      errorKind: 'invalid_response',
      attempt: 1,
    });
  });

  it('should log invalid_response when valid json is outside the schema', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"wrong":1}') });

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiResponseInvalidError);

    expect(errorSpy).toHaveBeenCalledWith('ai.request.failed', {
      promptName: 'parse-job-description',
      httpStatus: 200,
      durationMs: expect.any(Number),
      errorKind: 'invalid_response',
      attempt: 1,
    });
  });

  it('should log timeout with the attempt when the request times out', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockRejectedValue(
      new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED'),
    );

    await expect(client.complete(makeRequest())).rejects.toBeInstanceOf(AiTimeoutError);

    expect(errorSpy).toHaveBeenCalledWith('ai.request.failed', {
      promptName: 'parse-job-description',
      httpStatus: null,
      durationMs: expect.any(Number),
      errorKind: 'timeout',
      attempt: 1,
    });
  });

  it('should include the request attempt in success and failure logs', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createClient(createStore(API_KEY_SECRET));
    httpMocks.post.mockResolvedValue({ status: 200, data: makeEnvelope('{"summary":"ok"}') });

    await client.complete({ ...makeRequest(), attempt: 2 });

    expect(logSpy).toHaveBeenCalledWith('ai.request.completed', {
      promptName: 'parse-job-description',
      durationMs: expect.any(Number),
      attempt: 2,
    });
    httpMocks.post.mockRejectedValue(axiosErrorWithStatus(500));

    await expect(
      client.complete({ ...makeRequest(), attempt: 3 }),
    ).rejects.toBeInstanceOf(AiUnavailableError);

    expect(errorSpy).toHaveBeenCalledWith('ai.request.failed', {
      promptName: 'parse-job-description',
      httpStatus: 500,
      durationMs: expect.any(Number),
      errorKind: 'unavailable',
      attempt: 3,
    });
  });
});
