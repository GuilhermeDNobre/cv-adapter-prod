import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { z } from 'zod';
import type { DeepSeekBalance } from 'schema/contracts/settings';
import { AiKeyRejectedError, AiUnavailableError } from '../ai/ai-errors';

export const DEEPSEEK_ACCOUNT = 'DEEPSEEK_ACCOUNT';

export interface DeepSeekAccount {
  fetchBalance(apiKey: string): Promise<DeepSeekBalance>;
}

const BALANCE_PATH = 'user/balance';
const ACCOUNT_TIMEOUT_MS = 10_000;

const balanceResponseSchema = z.object({
  is_available: z.boolean(),
  balance_infos: z.array(
    z.object({
      currency: z.string(),
      total_balance: z.string(),
    }),
  ),
});

@Injectable()
export class DeepSeekAccountClient implements DeepSeekAccount {
  private readonly http: AxiosInstance;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const baseUrl = configService.getOrThrow<string>('DEEPSEEK_BASE_URL');
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: ACCOUNT_TIMEOUT_MS,
    });
  }

  async fetchBalance(apiKey: string): Promise<DeepSeekBalance> {
    try {
      const response = await this.http.get<unknown>(BALANCE_PATH, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const parsed = balanceResponseSchema.safeParse(response.data);
      if (!parsed.success) {
        throw new AiUnavailableError(response.status);
      }
      return {
        isAvailable: parsed.data.is_available,
        balances: parsed.data.balance_infos.map((info) => ({
          currency: info.currency,
          totalBalance: info.total_balance,
        })),
      };
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        throw error;
      }
      if (isAxiosError(error) && error.response?.status === 401) {
        throw new AiKeyRejectedError();
      }
      throw new AiUnavailableError(
        isAxiosError(error) ? error.response?.status : undefined,
      );
    }
  }
}
