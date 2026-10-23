import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiKeyRejectedError, AiUnavailableError } from '../ai/ai-errors';
import { DeepSeekAccountClient } from './deepseek-account.client';

const httpMocks = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn() }));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: { ...actual.default, create: httpMocks.create },
  };
});

const API_KEY = 'sk-live-key-9999';

function createClient(): DeepSeekAccountClient {
  return new DeepSeekAccountClient(
    new ConfigService({ DEEPSEEK_BASE_URL: 'https://deepseek.test' }),
  );
}

function axiosErrorWithStatus(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status code ${String(status)}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    { status, data: {} } as unknown as AxiosResponse,
  );
}

describe('DeepSeekAccountClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    httpMocks.create.mockReset();
    httpMocks.get.mockReset();
    httpMocks.create.mockReturnValue({ get: httpMocks.get });
  });

  it('should map a valid balance payload to the contract shape', async () => {
    const client = createClient();
    httpMocks.get.mockResolvedValue({
      status: 200,
      data: {
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '12.34' }],
      },
    });

    const balance = await client.fetchBalance(API_KEY);

    expect(balance).toEqual({
      isAvailable: true,
      balances: [{ currency: 'CNY', totalBalance: '12.34' }],
    });
    expect(httpMocks.get).toHaveBeenCalledWith(
      'user/balance',
      expect.objectContaining({ headers: { Authorization: `Bearer ${API_KEY}` } }),
    );
  });

  it('should throw AiKeyRejectedError on 401 without leaking the key', async () => {
    const client = createClient();
    httpMocks.get.mockRejectedValue(axiosErrorWithStatus(401));

    const error = await client.fetchBalance(API_KEY).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AiKeyRejectedError);
    expect((error as Error).message).not.toContain(API_KEY);
  });

  it('should throw AiUnavailableError on 500', async () => {
    const client = createClient();
    httpMocks.get.mockRejectedValue(axiosErrorWithStatus(500));

    const error = await client.fetchBalance(API_KEY).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AiUnavailableError);
  });

  it('should throw AiUnavailableError on timeout', async () => {
    const client = createClient();
    httpMocks.get.mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED'));

    await expect(client.fetchBalance(API_KEY)).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('should throw AiUnavailableError on network failure', async () => {
    const client = createClient();
    httpMocks.get.mockRejectedValue(new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED'));

    await expect(client.fetchBalance(API_KEY)).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('should throw AiUnavailableError on an unexpected body', async () => {
    const client = createClient();
    httpMocks.get.mockResolvedValue({ status: 200, data: { wrong: true } });

    await expect(client.fetchBalance(API_KEY)).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('should create the HTTP client with a 10s timeout and the configured base URL', async () => {
    createClient();

    expect(httpMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://deepseek.test', timeout: 10_000 }),
    );
  });
});
