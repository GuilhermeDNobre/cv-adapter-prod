import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DeepSeekBalance, DeepSeekKeyStatus } from 'schema/contracts/settings';
import { SaveDeepSeekKeyPipe, SettingsController } from './settings.controller';
import type { SettingsService } from './settings.service';

const STATUS: DeepSeekKeyStatus = { configured: true, lastFour: '5678' };
const BALANCE: DeepSeekBalance = {
  isAvailable: true,
  balances: [{ currency: 'CNY', totalBalance: '10.00' }],
};

function createController() {
  const getKeyStatus = vi.fn(async () => STATUS);
  const saveKey = vi.fn(async () => ({ status: STATUS, balance: BALANCE }));
  const getBalance = vi.fn(async () => BALANCE);
  const service = { getKeyStatus, saveKey, getBalance } as unknown as SettingsService;
  return {
    controller: new SettingsController(service),
    getKeyStatus,
    saveKey,
    getBalance,
  };
}

describe('SettingsController.readKeyStatus', () => {
  it('should delegate to the service', async () => {
    const { controller, getKeyStatus } = createController();

    await expect(controller.readKeyStatus()).resolves.toEqual(STATUS);
    expect(getKeyStatus).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsController.saveKey', () => {
  it('should delegate the apiKey to the service', async () => {
    const { controller, saveKey } = createController();

    await expect(controller.saveKey({ apiKey: 'sk-live-key' })).resolves.toEqual({
      status: STATUS,
      balance: BALANCE,
    });
    expect(saveKey).toHaveBeenCalledWith('sk-live-key');
  });
});

describe('SettingsController.readBalance', () => {
  it('should delegate to the service', async () => {
    const { controller, getBalance } = createController();

    await expect(controller.readBalance()).resolves.toEqual(BALANCE);
    expect(getBalance).toHaveBeenCalledTimes(1);
  });
});

describe('SaveDeepSeekKeyPipe', () => {
  it('should accept a non-empty key', () => {
    const pipe = new SaveDeepSeekKeyPipe();

    expect(pipe.transform({ apiKey: 'sk-live' })).toEqual({ apiKey: 'sk-live' });
  });

  it('should reject an empty body with 400', () => {
    const pipe = new SaveDeepSeekKeyPipe();

    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it('should reject a blank key with 400', () => {
    const pipe = new SaveDeepSeekKeyPipe();

    expect(() => pipe.transform({ apiKey: '   ' })).toThrow(BadRequestException);
  });
});
