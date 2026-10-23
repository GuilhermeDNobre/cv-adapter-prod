import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DeepSeekBalance } from 'schema/contracts/settings';
import { AiKeyRejectedError, AiUnavailableError } from '../ai/ai-errors';
import type { DeepSeekAccount } from './deepseek-account.client';
import type { DeepSeekKeyStore } from './deepseek-key.repository';
import { SettingsService } from './settings.service';

const FULL_KEY = 'sk-live-abcdef-12345678';
const LAST_FOUR = '5678';
const AVAILABLE_BALANCE: DeepSeekBalance = {
  isAvailable: true,
  balances: [{ currency: 'CNY', totalBalance: '10.00' }],
};
const EMPTY_BALANCE: DeepSeekBalance = {
  isAvailable: false,
  balances: [{ currency: 'CNY', totalBalance: '0.00' }],
};

function createService(params: {
  stored: string | null;
  fetch: (apiKey: string) => Promise<DeepSeekBalance>;
}) {
  const findApiKey = vi.fn(async () => params.stored);
  const saveApiKey = vi.fn(async () => undefined);
  const fetchBalance = vi.fn(params.fetch);
  const keyStore = { findApiKey, saveApiKey } as unknown as DeepSeekKeyStore;
  const account = { fetchBalance } as unknown as DeepSeekAccount;
  return {
    service: new SettingsService(keyStore, account),
    findApiKey,
    saveApiKey,
    fetchBalance,
  };
}

describe('SettingsService.getKeyStatus', () => {
  it('should report unconfigured when no key is stored', async () => {
    const { service } = createService({
      stored: null,
      fetch: async () => AVAILABLE_BALANCE,
    });

    await expect(service.getKeyStatus()).resolves.toEqual({
      configured: false,
      lastFour: null,
    });
  });

  it('should report only the last four characters of the stored key', async () => {
    const { service } = createService({
      stored: FULL_KEY,
      fetch: async () => AVAILABLE_BALANCE,
    });

    const status = await service.getKeyStatus();

    expect(status).toEqual({ configured: true, lastFour: LAST_FOUR });
    expect(JSON.stringify(status)).not.toContain(FULL_KEY);
  });
});

describe('SettingsService.saveKey', () => {
  it('should verify, save and return status with balance for an accepted key', async () => {
    const { service, saveApiKey } = createService({
      stored: null,
      fetch: async () => AVAILABLE_BALANCE,
    });

    const result = await service.saveKey(FULL_KEY);

    expect(saveApiKey).toHaveBeenCalledWith(FULL_KEY);
    expect(result.status).toEqual({ configured: true, lastFour: LAST_FOUR });
    expect(result.balance).toEqual(AVAILABLE_BALANCE);
    expect(JSON.stringify(result)).not.toContain(FULL_KEY);
  });

  it('should save an accepted key with zero balance and report unavailable', async () => {
    const { service, saveApiKey } = createService({
      stored: null,
      fetch: async () => EMPTY_BALANCE,
    });

    const result = await service.saveKey(FULL_KEY);

    expect(saveApiKey).toHaveBeenCalledWith(FULL_KEY);
    expect(result.balance.isAvailable).toBe(false);
  });

  it('should throw 422 ai_key_rejected and save nothing when DeepSeek rejects the key', async () => {
    const { service, saveApiKey } = createService({
      stored: null,
      fetch: async () => {
        throw new AiKeyRejectedError();
      },
    });

    const failure = await service.saveKey('sk-bad-key').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'ai_key_rejected',
    });
    expect(saveApiKey).not.toHaveBeenCalled();
  });

  it('should throw 503 ai_unavailable and save nothing when DeepSeek is down', async () => {
    const { service, saveApiKey } = createService({
      stored: null,
      fetch: async () => {
        throw new AiUnavailableError(500);
      },
    });

    const failure = await service.saveKey(FULL_KEY).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'ai_unavailable',
    });
    expect(saveApiKey).not.toHaveBeenCalled();
  });

  it('should never log the full key', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service } = createService({
      stored: null,
      fetch: async () => AVAILABLE_BALANCE,
    });

    await service.saveKey(FULL_KEY);

    expect(JSON.stringify([...logSpy.mock.calls, ...errorSpy.mock.calls])).not.toContain(
      FULL_KEY,
    );
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('SettingsService.getBalance', () => {
  it('should throw 422 ai_key_missing when no key is stored', async () => {
    const { service, fetchBalance } = createService({
      stored: null,
      fetch: async () => AVAILABLE_BALANCE,
    });

    const failure = await service.getBalance().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'ai_key_missing',
    });
    expect(fetchBalance).not.toHaveBeenCalled();
  });

  it('should return the balance for the stored key', async () => {
    const { service, fetchBalance } = createService({
      stored: FULL_KEY,
      fetch: async () => AVAILABLE_BALANCE,
    });

    await expect(service.getBalance()).resolves.toEqual(AVAILABLE_BALANCE);
    expect(fetchBalance).toHaveBeenCalledWith(FULL_KEY);
  });

  it('should throw 422 ai_key_rejected when the stored key is rejected', async () => {
    const { service } = createService({
      stored: FULL_KEY,
      fetch: async () => {
        throw new AiKeyRejectedError();
      },
    });

    const failure = await service.getBalance().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'ai_key_rejected',
    });
  });

  it('should throw 503 ai_unavailable when the balance cannot be fetched', async () => {
    const { service } = createService({
      stored: FULL_KEY,
      fetch: async () => {
        throw new AiUnavailableError();
      },
    });

    const failure = await service.getBalance().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'ai_unavailable',
    });
  });
});
