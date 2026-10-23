import { describe, expect, it, vi } from 'vitest';
import { runRewriteSectionPipeline } from './rewrite-section.pipeline';
import type { AiClient } from '../../ai/ai-client';

const RESUME_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const SECTION_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const BULLET_ID = '44444444-4444-4444-8444-444444444444';
const EVIDENCE_ID = '55555555-5555-4555-8555-555555555555';
const EXPERIENCE_ID = '66666666-6666-4666-8666-666666666666';
const PROFILE_ID = '77777777-7777-4777-8777-777777777777';
const STATEMENT = 'Increased sales by 85% in one year';

function documentFixture() {
  return {
    resume: {
      id: RESUME_ID,
      userId: USER_ID,
      kind: 'base',
      name: 'Base',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: null,
      generationStatus: 'generating',
      failureReason: null,
      adaptationPlan: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    sections: [{ id: SECTION_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() }],
    entries: [{ id: ENTRY_ID, sectionId: SECTION_ID, ordinal: 0, experienceId: EXPERIENCE_ID, educationEntryId: null, heading: null, createdAt: new Date() }],
    bullets: [{ id: BULLET_ID, entryId: ENTRY_ID, ordinal: 0, text: STATEMENT, evidenceId: EVIDENCE_ID, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() }],
    comments: [{ id: '88888888-8888-4888-8888-888888888888', sectionId: SECTION_ID, text: 'Old comment.', resolvedAt: null, createdAt: new Date() }],
    exports: [],
  };
}

function databaseFixture() {
  const calls: string[] = [];
  const select = vi.fn().mockImplementation(() => {
    const index = calls.length;
    calls.push(`select-${String(index)}`);
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          if (index === 0) return [{ id: PROFILE_ID }];
          if (index === 1) return [{ id: EVIDENCE_ID, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT, createdAt: new Date() }];
          if (index === 2) return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
          return [];
        }),
      }),
    };
  });
  return { select };
}

describe('runRewriteSectionPipeline', () => {
  it('should send the instruction to the rewrite prompt and ignore open comments', async () => {
    const seen: Array<{ instruction?: unknown; openComments?: unknown }> = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (input: { payload: { instruction: string; openComments: string[]; evidences: Array<{ id: string }> } }) => {
        seen.push({ instruction: input.payload.instruction, openComments: input.payload.openComments });
        return { bullets: input.payload.evidences.map((item) => ({ evidenceId: item.id, text: STATEMENT })) };
      }),
    } as unknown as AiClient;
    const repository = {
      findDocument: vi.fn().mockResolvedValue(documentFixture()),
      updateBulletsAndMarkReady: vi.fn().mockResolvedValue(true),
    };
    await runRewriteSectionPipeline(
      { database: databaseFixture() as never, aiClient, repository: repository as never },
      { resumeId: RESUME_ID, userId: USER_ID, sectionId: SECTION_ID, instruction: 'Highlight Git and Docker.', startedAt: Date.now() },
    );
    expect(seen.length).toBe(1);
    expect(seen[0]?.instruction).toBe('Highlight Git and Docker.');
    expect(seen[0]?.openComments).toEqual([]);
    expect(repository.updateBulletsAndMarkReady).toHaveBeenCalled();
  });
  it('should rewrite a summary without evidence through synthesis with instruction and current text', async () => {
    const seen: Array<{ instruction?: unknown; currentText?: unknown; promptName?: unknown }> = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (input: { promptName: string; payload: { instruction: string; currentText: string } }) => {
        seen.push({ instruction: input.payload.instruction, currentText: input.payload.currentText, promptName: input.promptName });
        return { bullets: [{ text: 'Single running paragraph.' }] };
      }),
    } as unknown as AiClient;
    const repository = {
      findDocument: vi.fn().mockResolvedValue(summaryFixture()),
      replaceSynthesisAndMarkReady: vi.fn().mockResolvedValue(true),
      updateBulletsAndMarkReady: vi.fn().mockResolvedValue(true),
      markFailed: vi.fn().mockResolvedValue(true),
    };
    await runRewriteSectionPipeline(
      { database: databaseFixture() as never, aiClient, repository: repository as never },
      { resumeId: RESUME_ID, userId: USER_ID, sectionId: SECTION_ID, instruction: 'Make it a single paragraph.', startedAt: Date.now() },
    );
    expect(seen.length).toBe(1);
    expect(seen[0]?.promptName).toBe('synthesize-section');
    expect(seen[0]?.instruction).toBe('Make it a single paragraph.');
    expect(String(seen[0]?.currentText)).toContain('First sentence.');
    expect(String(seen[0]?.currentText)).toContain('Second sentence.');
    expect(String(seen[0]?.currentText)).toContain('Third sentence.');
    expect(repository.replaceSynthesisAndMarkReady).toHaveBeenCalledTimes(1);
    const call = (repository.replaceSynthesisAndMarkReady as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { synthesis: Array<{ sectionId: string; bullets: Array<{ text: string }> }> };
    expect(call.synthesis).toHaveLength(1);
    expect(call.synthesis[0]?.sectionId).toBe(SECTION_ID);
    expect(call.synthesis[0]?.bullets).toHaveLength(1);
    expect(call.synthesis[0]?.bullets[0]?.text).toBe('Single running paragraph.');
    expect(repository.updateBulletsAndMarkReady).not.toHaveBeenCalled();
  });
  it('should mark nothing to rewrite when the section has no text', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const aiClient = { complete: vi.fn() } as unknown as AiClient;
    const repository = {
      findDocument: vi.fn().mockResolvedValue(emptySectionFixture()),
      replaceSynthesisAndMarkReady: vi.fn().mockResolvedValue(true),
      updateBulletsAndMarkReady: vi.fn().mockResolvedValue(true),
      markReadyWithNotice: vi.fn().mockResolvedValue(true),
    };
    await runRewriteSectionPipeline(
      { database: databaseFixture() as never, aiClient, repository: repository as never },
      { resumeId: RESUME_ID, userId: USER_ID, sectionId: SECTION_ID, instruction: 'Make it shorter.', startedAt: Date.now() },
    );
    expect(repository.markReadyWithNotice).toHaveBeenCalledWith(RESUME_ID, 'nothing_to_rewrite');
    expect(aiClient.complete).not.toHaveBeenCalled();
    const completed = logSpy.mock.calls.filter(([message]) => message === 'resume.generation.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.[1]).toMatchObject({ failureReason: 'nothing_to_rewrite' });
    logSpy.mockRestore();
  });
  it('should discard a synthesized bullet with a number absent from sources and current text', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const aiClient = {
      complete: vi.fn().mockResolvedValue({ bullets: [{ text: 'Single running paragraph.' }, { text: 'Boosted output by 99% with Kafka.' }] }),
    } as unknown as AiClient;
    const repository = {
      findDocument: vi.fn().mockResolvedValue(summaryFixture()),
      replaceSynthesisAndMarkReady: vi.fn().mockResolvedValue(true),
      updateBulletsAndMarkReady: vi.fn().mockResolvedValue(true),
      markReadyWithNotice: vi.fn().mockResolvedValue(true),
    };
    await runRewriteSectionPipeline(
      { database: databaseFixture() as never, aiClient, repository: repository as never },
      { resumeId: RESUME_ID, userId: USER_ID, sectionId: SECTION_ID, instruction: 'Make it a single paragraph.', startedAt: Date.now() },
    );
    const call = (repository.replaceSynthesisAndMarkReady as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { synthesis: Array<{ sectionId: string; bullets: Array<{ text: string }> }> };
    expect(call.synthesis[0]?.bullets).toHaveLength(1);
    expect(call.synthesis[0]?.bullets[0]?.text).toBe('Single running paragraph.');
    expect(repository.markReadyWithNotice).not.toHaveBeenCalled();
    const rejected = logSpy.mock.calls.filter(([message]) => message === 'resume.rewrite.claim_rejected');
    expect(rejected.length).toBeGreaterThan(0);
    logSpy.mockRestore();
  });
  it('should keep the section intact and mark ready with notice when every synthesized bullet is rejected', async () => {
    const aiClient = {
      complete: vi.fn().mockResolvedValue({ bullets: [{ text: 'Boosted output by 99% with Kafka.' }] }),
    } as unknown as AiClient;
    const repository = {
      findDocument: vi.fn().mockResolvedValue(summaryFixture()),
      replaceSynthesisAndMarkReady: vi.fn().mockResolvedValue(true),
      updateBulletsAndMarkReady: vi.fn().mockResolvedValue(true),
      markReadyWithNotice: vi.fn().mockResolvedValue(true),
    };
    await runRewriteSectionPipeline(
      { database: databaseFixture() as never, aiClient, repository: repository as never },
      { resumeId: RESUME_ID, userId: USER_ID, sectionId: SECTION_ID, instruction: 'Make it a single paragraph.', startedAt: Date.now() },
    );
    expect(repository.replaceSynthesisAndMarkReady).not.toHaveBeenCalled();
    expect(repository.markReadyWithNotice).toHaveBeenCalledWith(RESUME_ID, 'rewrite_claims_rejected');
  });
});

function summaryFixture() {
  const base = documentFixture();
  return {
    ...base,
    sections: [{ id: SECTION_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() }],
    entries: [{ id: ENTRY_ID, sectionId: SECTION_ID, ordinal: 0, experienceId: null, educationEntryId: null, heading: null, createdAt: new Date() }],
    bullets: [
      { id: BULLET_ID, entryId: ENTRY_ID, ordinal: 0, text: 'First sentence.', evidenceId: null, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
      { id: '44444444-4444-4444-8444-444444444445', entryId: ENTRY_ID, ordinal: 1, text: 'Second sentence.', evidenceId: null, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
      { id: '44444444-4444-4444-8444-444444444446', entryId: ENTRY_ID, ordinal: 2, text: 'Third sentence.', evidenceId: null, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
    ],
  };
}

function emptySectionFixture() {
  const base = documentFixture();
  return {
    ...base,
    sections: [{ id: SECTION_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() }],
    entries: [{ id: ENTRY_ID, sectionId: SECTION_ID, ordinal: 0, experienceId: null, educationEntryId: null, heading: null, createdAt: new Date() }],
    bullets: [],
  };
}
