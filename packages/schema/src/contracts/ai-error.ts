import { z } from 'zod';

export const aiErrorCodeSchema = z.enum([
  'ai_key_missing',
  'ai_key_rejected',
  'ai_balance_exhausted',
  'ai_unavailable',
  'nothing_to_rewrite',
  'rewrite_claims_rejected',
]);

export type AiErrorCode = z.infer<typeof aiErrorCodeSchema>;
