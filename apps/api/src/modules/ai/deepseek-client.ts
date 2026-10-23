import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { z, type ZodType } from 'zod';
import type { AiClient, AiRequest, PromptName } from './ai-client';
import {
  AiBalanceExhaustedError,
  AiError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from './ai-errors';
import { getPrompt } from './prompts/prompt';
import { DEEPSEEK_KEY_STORE, type DeepSeekKeyStore } from '../settings/deepseek-key.repository';

const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const CHAT_COMPLETIONS_PATH = 'chat/completions';
const DEEPSEEK_TIMEOUT_MS = 60_000;
const TIMEOUT_ERROR_CODES = ['ECONNABORTED', 'ETIMEDOUT'];

type AiErrorKind =
  | 'invalid_response'
  | 'timeout'
  | 'unavailable'
  | 'key_missing'
  | 'key_rejected'
  | 'balance_exhausted';

const responseEnvelopeSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});

interface ChatMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

interface ChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly response_format: { readonly type: 'json_object' };
}

@Injectable()
export class DeepSeekClient implements AiClient {
  private readonly http: AxiosInstance;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DEEPSEEK_KEY_STORE) private readonly keyStore: DeepSeekKeyStore,
  ) {
    const baseUrl = configService.getOrThrow<string>('DEEPSEEK_BASE_URL');
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: DEEPSEEK_TIMEOUT_MS,
    });
  }

  async complete<TOutput>(request: AiRequest<TOutput>): Promise<TOutput> {
    const prompt = getPrompt(request.promptName);
    const startedAtMs = Date.now();
    const attempt = request.attempt ?? 1;
    const apiKey = await this.keyStore.findApiKey();
    if (apiKey === null) {
      const missing = new AiKeyMissingError();
      this.logFailure(request.promptName, undefined, startedAtMs, toErrorKind(missing), attempt);
      throw missing;
    }
    let httpStatus: number | undefined;
    try {
      const response = await this.http.post<unknown>(
        CHAT_COMPLETIONS_PATH,
        buildRequest(prompt.systemMessage, request.payload),
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      httpStatus = response.status;
      const output = parseValidatedOutput(response.data, request.outputSchema);
      this.logCompleted(request.promptName, startedAtMs, attempt);
      return output;
    } catch (error) {
      const typed = toTypedAiError(error);
      this.logFailure(
        request.promptName,
        httpStatus ?? transportStatus(error),
        startedAtMs,
        toErrorKind(typed),
        attempt,
      );
      throw typed;
    }
  }

  private logCompleted(promptName: PromptName, startedAtMs: number, attempt: number): void {
    console.log('ai.request.completed', {
      promptName,
      durationMs: Date.now() - startedAtMs,
      attempt,
    });
  }

  private logFailure(
    promptName: PromptName,
    httpStatus: number | undefined,
    startedAtMs: number,
    errorKind: AiErrorKind,
    attempt: number,
  ): void {
    console.error('ai.request.failed', {
      promptName,
      httpStatus: httpStatus ?? null,
      durationMs: Date.now() - startedAtMs,
      errorKind,
      attempt,
    });
  }
}

function buildRequest(
  systemMessage: string,
  payload: Record<string, unknown>,
): ChatCompletionRequest {
  return {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    response_format: { type: 'json_object' },
  };
}

function parseValidatedOutput<TOutput>(data: unknown, outputSchema: ZodType<TOutput>): TOutput {
  const envelope = responseEnvelopeSchema.safeParse(data);
  const firstChoice = envelope.success ? envelope.data.choices[0] : undefined;
  if (firstChoice === undefined) {
    throw new AiResponseInvalidError('invalid_envelope');
  }
  return parseModelContent(firstChoice.message.content, outputSchema);
}

function parseModelContent<TOutput>(content: string, outputSchema: ZodType<TOutput>): TOutput {
  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    throw new AiResponseInvalidError('malformed_json');
  }
  const output = outputSchema.safeParse(parsedContent);
  if (!output.success) {
    throw new AiResponseInvalidError('schema_mismatch');
  }
  return output.data;
}

function transportStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

function toErrorKind(error: AiError): AiErrorKind {
  if (error instanceof AiKeyMissingError) {
    return 'key_missing';
  }
  if (error instanceof AiKeyRejectedError) {
    return 'key_rejected';
  }
  if (error instanceof AiBalanceExhaustedError) {
    return 'balance_exhausted';
  }
  if (error instanceof AiResponseInvalidError) {
    return 'invalid_response';
  }
  if (error instanceof AiTimeoutError) {
    return 'timeout';
  }
  return 'unavailable';
}

function toTypedAiError(error: unknown): AiError {
  if (error instanceof AiError) {
    return error;
  }
  if (isAxiosError(error) && error.code !== undefined && TIMEOUT_ERROR_CODES.includes(error.code)) {
    return new AiTimeoutError(DEEPSEEK_TIMEOUT_MS);
  }
  const status = transportStatus(error);
  if (status === 401) {
    return new AiKeyRejectedError();
  }
  if (status === 402) {
    return new AiBalanceExhaustedError();
  }
  return new AiUnavailableError(status);
}
