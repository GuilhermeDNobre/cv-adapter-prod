import { aiErrorCodeSchema, type AiErrorCode } from 'schema/contracts/ai-error';
import { aiErrorCodeOf } from './api-client';

export const NOTHING_TO_REWRITE_MESSAGE = 'Não há texto nesta seção para a IA reescrever.';

export const REWRITE_CLAIMS_REJECTED_MESSAGE = 'A IA trouxe dados sem lastro e nada foi alterado. Tente uma instrução diferente.';

export const AI_ERROR_MESSAGES: Readonly<Record<AiErrorCode, string>> = {
  ai_key_missing: 'Não há chave da DeepSeek salva. Informe sua chave para continuar.',
  ai_key_rejected:
    'A DeepSeek recusou a chave salva. Vá em Configurações, informe uma chave válida e tente de novo.',
  ai_balance_exhausted:
    'O saldo da sua conta na DeepSeek acabou. Recarregue na DeepSeek e tente de novo.',
  ai_unavailable: 'A IA não respondeu agora. Tente de novo em alguns minutos.',
  nothing_to_rewrite: NOTHING_TO_REWRITE_MESSAGE,
  rewrite_claims_rejected: REWRITE_CLAIMS_REJECTED_MESSAGE,
};

export function aiErrorMessageForCode(code: AiErrorCode): string {
  return AI_ERROR_MESSAGES[code];
}

export function aiErrorMessageFor(error: unknown, fallbackMessage: string): string {
  const code = aiErrorCodeOf(error);
  if (code === null) return fallbackMessage;
  return AI_ERROR_MESSAGES[code];
}

export function failureReasonMessage(
  failureReason: string | null,
  fallbackMessage: string,
): string {
  if (failureReason === null) return fallbackMessage;
  const parsed = aiErrorCodeSchema.safeParse(failureReason);
  if (!parsed.success) return fallbackMessage;
  return AI_ERROR_MESSAGES[parsed.data];
}
