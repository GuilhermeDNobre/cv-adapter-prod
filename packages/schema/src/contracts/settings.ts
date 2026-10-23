import { z } from 'zod';

export const deepSeekKeyStatusSchema = z.object({
  configured: z.boolean(),
  lastFour: z.string().length(4).nullable(),
});

export type DeepSeekKeyStatus = z.infer<typeof deepSeekKeyStatusSchema>;

export const saveDeepSeekKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(1).max(200),
});

export type SaveDeepSeekKeyRequest = z.infer<typeof saveDeepSeekKeyRequestSchema>;

export const deepSeekBalanceSchema = z.object({
  isAvailable: z.boolean(),
  balances: z.array(
    z.object({
      currency: z.string(),
      totalBalance: z.string(),
    }),
  ),
});

export type DeepSeekBalance = z.infer<typeof deepSeekBalanceSchema>;
