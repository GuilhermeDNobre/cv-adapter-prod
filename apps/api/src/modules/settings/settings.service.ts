import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DeepSeekBalance, DeepSeekKeyStatus } from 'schema/contracts/settings';
import { AiKeyRejectedError } from '../ai/ai-errors';
import { DEEPSEEK_ACCOUNT, type DeepSeekAccount } from './deepseek-account.client';
import { DEEPSEEK_KEY_STORE, type DeepSeekKeyStore } from './deepseek-key.repository';

const KEY_REJECTED_MESSAGE = 'The DeepSeek key was rejected. Check the key and try again.';
const KEY_MISSING_MESSAGE = 'No DeepSeek key is configured.';
const SAVED_KEY_REJECTED_MESSAGE = 'The saved DeepSeek key was rejected. Replace it in settings.';
const UNAVAILABLE_MESSAGE = 'Could not reach DeepSeek right now. Try again in a moment.';
const BALANCE_UNAVAILABLE_MESSAGE = 'Could not fetch the DeepSeek balance right now.';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DEEPSEEK_KEY_STORE) private readonly keyStore: DeepSeekKeyStore,
    @Inject(DEEPSEEK_ACCOUNT) private readonly account: DeepSeekAccount,
  ) {}

  async getKeyStatus(): Promise<DeepSeekKeyStatus> {
    const apiKey = await this.keyStore.findApiKey();
    if (apiKey === null) {
      return { configured: false, lastFour: null };
    }
    return { configured: true, lastFour: apiKey.slice(-4) };
  }

  async saveKey(apiKey: string): Promise<{ status: DeepSeekKeyStatus; balance: DeepSeekBalance }> {
    const balance = await this.verifyKey(apiKey);
    await this.keyStore.saveApiKey(apiKey);
    console.log('settings.deepseek_key.saved', {});
    const status: DeepSeekKeyStatus = { configured: true, lastFour: apiKey.slice(-4) };
    return { status, balance };
  }

  async getBalance(): Promise<DeepSeekBalance> {
    const apiKey = await this.keyStore.findApiKey();
    if (apiKey === null) {
      throw new UnprocessableEntityException({
        code: 'ai_key_missing',
        message: KEY_MISSING_MESSAGE,
      });
    }
    try {
      return await this.account.fetchBalance(apiKey);
    } catch (error) {
      if (error instanceof AiKeyRejectedError) {
        throw new UnprocessableEntityException({
          code: 'ai_key_rejected',
          message: SAVED_KEY_REJECTED_MESSAGE,
        });
      }
      throw new ServiceUnavailableException({
        code: 'ai_unavailable',
        message: BALANCE_UNAVAILABLE_MESSAGE,
      });
    }
  }

  private async verifyKey(apiKey: string): Promise<DeepSeekBalance> {
    try {
      return await this.account.fetchBalance(apiKey);
    } catch (error) {
      if (error instanceof AiKeyRejectedError) {
        console.log('settings.deepseek_key.rejected', {});
        throw new UnprocessableEntityException({
          code: 'ai_key_rejected',
          message: KEY_REJECTED_MESSAGE,
        });
      }
      console.error('settings.deepseek_key.failed', {});
      throw new ServiceUnavailableException({
        code: 'ai_unavailable',
        message: UNAVAILABLE_MESSAGE,
      });
    }
  }
}
