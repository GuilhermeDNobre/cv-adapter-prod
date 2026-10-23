import { NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AiClient } from '../ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from '../ai/ai-errors';
import { ItemRefinementService } from './item-refinement.service';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const SECTION_ID = '22222222-2222-4222-8222-222222222222';
const RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';

function createService(options?: { bullets?: string[] }) {
  const complete: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ refined: 'Refined text.' });
  const aiClient = { complete } as unknown as AiClient;
  const bullets = (options?.bullets ?? []).map((text, index) => ({ id: `bullet-${String(index)}`, text }));
  const structures = {
    findOwnedSection: vi.fn().mockResolvedValue({
      section: { id: SECTION_ID, kind: 'experience' },
      resume: { id: RESUME_ID, language: 'en', writingMethod: 'star', tone: 'direct' },
    }),
    listSectionEntries: vi.fn().mockResolvedValue([{ id: 'entry-1' }]),
    listEntryBullets: vi.fn().mockResolvedValue(bullets),
  };
  const service = new ItemRefinementService(aiClient, structures as never);
  return { service, complete, structures };
}

describe('ItemRefinementService', () => {
  it('should pass the section style and language to the prompt and return the refined text', async () => {
    const { service, complete } = createService({ bullets: ['Led team of five engineers.'] });

    const result = await service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'led team' });

    expect(result).toEqual({ refined: 'Refined text.' });
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0]?.[0] as { promptName: string; payload: Record<string, unknown> };
    expect(request.promptName).toBe('refine-item');
    expect(request.payload).toMatchObject({
      text: 'led team',
      sectionKind: 'experience',
      language: 'en',
      writingMethod: 'star',
      tone: 'direct',
    });
    expect(request.payload['averageBulletWords']).toBe(5);
  });

  it('should omit averageBulletWords when the section has no bullets', async () => {
    const { service, complete } = createService({ bullets: [] });

    await service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'led team' });

    const request = complete.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect('averageBulletWords' in request.payload).toBe(false);
  });

  it('should answer 404 for a malformed or foreign section id', async () => {
    const { service } = createService();
    await expect(service.refine({ userId: USER_ID, sectionId: 'not-a-uuid', text: 'led team' })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const foreign = createService();
    foreign.structures.findOwnedSection.mockResolvedValue(undefined);
    await expect(
      foreign.service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'led team' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should answer 422 ai_key_rejected when the key is rejected', async () => {
    const { service, complete } = createService();
    complete.mockRejectedValue(new AiKeyRejectedError());

    const failure = await service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'led team' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'ai_key_rejected' });
  });

  it('should answer 422 ai_balance_exhausted when the balance is gone', async () => {
    const { service, complete } = createService();
    complete.mockRejectedValue(new AiBalanceExhaustedError());

    const failure = await service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'led team' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'ai_balance_exhausted' });
  });

  it('should answer 503 ai_unavailable for transient failures', async () => {
    const transientErrors = [new AiUnavailableError(503), new AiTimeoutError(60000), new AiResponseInvalidError('schema_mismatch')];
    for (const transient of transientErrors) {
      const { service, complete } = createService();
      complete.mockRejectedValue(transient);

      const failure = await service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'led team' }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'ai_unavailable' });
    }
  });

  it('should answer 422 ai_key_missing when no key is configured', async () => {
    const { service, complete } = createService();
    complete.mockRejectedValue(new AiKeyMissingError());

    const failure = await service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'led team' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'ai_key_missing' });
  });

  it('should not swallow programming errors', async () => {
    const { service, complete } = createService();
    complete.mockRejectedValue(new Error('programming bug'));

    await expect(service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'led team' })).rejects.toThrow('programming bug');
  });

  it('should never log the item text', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { service } = createService({ bullets: ['Existing bullet.'] });

    await service.refine({ userId: USER_ID, sectionId: SECTION_ID, text: 'TEXTO-SECRETO-DO-ITEM' });

    const logged = JSON.stringify([...logSpy.mock.calls.map((call) => call.map(String)), ...errorSpy.mock.calls.map((call) => call.map(String))]);
    expect(logged).not.toContain('TEXTO-SECRETO-DO-ITEM');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
