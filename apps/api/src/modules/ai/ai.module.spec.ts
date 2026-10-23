import 'reflect-metadata';
import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AI_CLIENT, type AiClient, type AiRequest } from './ai-client';
import { AiModule } from './ai.module';
import { registerPrompt } from './prompts/prompt';
import { DEEPSEEK_KEY_STORE } from '../settings/deepseek-key.repository';

const httpMocks = vi.hoisted(() => ({ create: vi.fn(), post: vi.fn() }));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: { ...actual.default, create: httpMocks.create },
  };
});

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AiModule],
})
class TestHostModule {}

const sampleSchema = z.object({ covered: z.boolean() });
type SampleOutput = z.infer<typeof sampleSchema>;

function makeRequest(): AiRequest<SampleOutput> {
  return {
    promptName: 'evaluate-coverage',
    payload: { requirement: 'Kubernetes' },
    outputSchema: sampleSchema,
  };
}

describe('AiModule', () => {
  let app: INestApplicationContext;

  beforeEach(async () => {
    process.env['DEEPSEEK_BASE_URL'] = 'https://deepseek.test/v1';
    process.env['DATABASE_URL'] = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
    httpMocks.create.mockReset();
    httpMocks.post.mockReset();
    httpMocks.create.mockReturnValue({ post: httpMocks.post });
    registerPrompt({
      name: 'evaluate-coverage',
      systemMessage: 'Return a json object with the coverage verdict.',
      outputSchema: sampleSchema,
    });
    const testRef = await Test.createTestingModule({ imports: [TestHostModule] })
      .overrideProvider(DEEPSEEK_KEY_STORE)
      .useValue({ findApiKey: async () => 'test-key', saveApiKey: async () => undefined })
      .compile();
    app = testRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env['DEEPSEEK_BASE_URL'];
    delete process.env['DATABASE_URL'];
  });

  it('should resolve the AI_CLIENT provider from the Nest container', () => {
    const client = app.get<AiClient>(AI_CLIENT);

    expect(client.constructor.name).toBe('RetryingAiClient');
    expect(typeof client.complete).toBe('function');
    const inner = (client as unknown as { inner: { constructor: { name: string } } }).inner;
    expect(inner.constructor.name).toBe('DeepSeekClient');
  });

  it('should run a registered prompt through port, adapter and zod validation', async () => {
    httpMocks.post.mockResolvedValue({
      status: 200,
      data: { choices: [{ message: { content: '{"covered":true}' } }] },
    });
    const client = app.get<AiClient>(AI_CLIENT);

    await expect(client.complete(makeRequest())).resolves.toEqual({ covered: true });

    expect(httpMocks.post).toHaveBeenCalledWith(
      'chat/completions',
      expect.objectContaining({ response_format: { type: 'json_object' } }),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-key' } }),
    );
  });

  it('should boot from the store without any legacy key in the environment', () => {
    expect(app.get<AiClient>(AI_CLIENT)).toBeDefined();
  });
});
