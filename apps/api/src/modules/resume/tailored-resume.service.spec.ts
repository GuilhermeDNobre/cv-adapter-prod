import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TailoredResumeService } from './tailored-resume.service';

const BASE_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const BULLET_ID = '33333333-3333-4333-8333-333333333333';

function selectMock(rowsByCall: unknown[][]) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rowsByCall[callIndex++] ?? []),
    }),
  }));
}

function makeQueue() {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

function makeDenied() {
  return { deny: vi.fn().mockResolvedValue(undefined) };
}

describe('TailoredResumeService language rule', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should create in pt when the job language starts with pt', async () => {
    const baseResume = { id: BASE_ID, kind: 'base', name: 'Backend', template: 'comfortable', lengthTarget: 1, writingMethod: 'xyz', tone: 'direct' };
    const database = {
      select: selectMock([
        [baseResume],
        [],
        [{ id: JOB_ID, language: 'pt-BR', rawText: 'Desenvolvedor Backend\nWe are hiring.' }],
        [{ id: 'profile-id' }],
      ]),
      transaction: vi.fn(async (run: (tx: unknown) => Promise<string>) => {
        let captured: unknown;
        const tx = {
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((values: unknown) => {
              captured = values;
              return { returning: vi.fn().mockResolvedValue([{ id: 'tailored-id' }]) };
            }),
          })),
          select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
        };
        const id = await run(tx);
        expect(captured).toMatchObject({ language: 'pt' });
        return id;
      }),
    };
    const service = new TailoredResumeService(database as never, makeQueue() as never, makeDenied() as never);
    const result = await service.createTailoredResume('user-1', { baseResumeId: BASE_ID, jobDescriptionId: JOB_ID });
    expect(result.id).toBe('tailored-id');
  });

  it('should create in en for a spanish job', async () => {
    const baseResume = { id: BASE_ID, kind: 'base', name: 'Backend', template: 'dense', lengthTarget: 2, writingMethod: 'star', tone: 'formal' };
    const database = {
      select: selectMock([
        [baseResume],
        [{ id: 'sec-1', resumeId: BASE_ID, kind: 'experience', title: null, ordinal: 0 }],
        [],
        [],
        [{ id: JOB_ID, language: 'es', rawText: 'Desarrollador Backend\nWe are hiring.' }],
        [{ id: 'profile-id' }],
      ]),
      transaction: vi.fn(async (run: (tx: unknown) => Promise<string>) => {
        let captured: unknown;
        const tx = {
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((values: unknown) => {
              if (typeof values === 'object' && values !== null && 'language' in (values as Record<string, unknown>)) {
                captured = values;
              }
              return { returning: vi.fn().mockResolvedValue([{ id: 'tailored-es' }]) };
            }),
          })),
          select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
        };
        const id = await run(tx);
        expect(captured).toMatchObject({ language: 'en', template: 'dense' });
        return id;
      }),
    };
    const service = new TailoredResumeService(database as never, makeQueue() as never, makeDenied() as never);
    const result = await service.createTailoredResume('user-1', { baseResumeId: BASE_ID, jobDescriptionId: JOB_ID });
    expect(result.id).toBe('tailored-es');
  });

  it('should inherit template, method, tone and freeze the section snapshot', async () => {
    const baseResume = { id: BASE_ID, kind: 'base', name: 'Backend', template: 'comfortable', lengthTarget: 1, writingMethod: 'xyz', tone: 'direct' };
    const baseSections = [
      { id: 'sec-1', resumeId: BASE_ID, kind: 'experience', title: null, ordinal: 0 },
      { id: 'sec-2', resumeId: BASE_ID, kind: 'skills', title: null, ordinal: 1 },
    ];
    const insertedSections: unknown[] = [];
    const database = {
      select: selectMock([[baseResume], baseSections, [], [], [{ id: JOB_ID, language: 'en', rawText: 'Backend Developer\nHiring.' }], [{ id: 'profile-id' }]]),
      transaction: vi.fn(async (run: (tx: unknown) => Promise<string>) => {
        const tx = {
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((values: unknown) => {
              if (typeof values === 'object' && values !== null && 'resumeId' in (values as Record<string, unknown>)) {
                insertedSections.push(values);
              }
              return { returning: vi.fn().mockResolvedValue([{ id: `new-${insertedSections.length}` }]) };
            }),
          })),
          select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
        };
        await run(tx);
        return 'tailored-id';
      }),
    };
    const queue = makeQueue();
    const service = new TailoredResumeService(database as never, queue as never, makeDenied() as never);
    await service.createTailoredResume('user-1', { baseResumeId: BASE_ID, jobDescriptionId: JOB_ID });
    expect(insertedSections).toHaveLength(2);
    expect(queue.add).toHaveBeenCalledWith('tailor', expect.objectContaining({ resumeId: 'tailored-id' }), expect.objectContaining({ attempts: 3 }));
  });

  it('should use the requested language instead of the base and the job languages', async () => {
    const baseResume = { id: BASE_ID, kind: 'base', name: 'Backend', language: 'pt', template: 'comfortable', lengthTarget: 1, writingMethod: 'xyz', tone: 'direct' };
    const database = {
      select: selectMock([
        [baseResume],
        [],
        [{ id: JOB_ID, language: 'pt-BR', rawText: 'Desenvolvedor Backend\nContratando.' }],
        [{ id: 'profile-id' }],
      ]),
      transaction: vi.fn(async (run: (tx: unknown) => Promise<string>) => {
        let captured: unknown;
        const tx = {
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((values: unknown) => {
              captured = values;
              return { returning: vi.fn().mockResolvedValue([{ id: 'tailored-id' }]) };
            }),
          })),
          select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
        };
        const id = await run(tx);
        expect(captured).toMatchObject({ language: 'en' });
        return id;
      }),
    };
    const service = new TailoredResumeService(database as never, makeQueue() as never, makeDenied() as never);
    const result = await service.createTailoredResume('user-1', { baseResumeId: BASE_ID, jobDescriptionId: JOB_ID, language: 'en' });
    expect(result.id).toBe('tailored-id');
  });

  it('should fall back to the base resume language when no language is requested', async () => {
    const baseResume = { id: BASE_ID, kind: 'base', name: 'Backend', language: 'pt', template: 'comfortable', lengthTarget: 1, writingMethod: 'xyz', tone: 'direct' };
    const database = {
      select: selectMock([
        [baseResume],
        [],
        [{ id: JOB_ID, language: 'en', rawText: 'Backend Developer\nHiring.' }],
        [{ id: 'profile-id' }],
      ]),
      transaction: vi.fn(async (run: (tx: unknown) => Promise<string>) => {
        let captured: unknown;
        const tx = {
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((values: unknown) => {
              captured = values;
              return { returning: vi.fn().mockResolvedValue([{ id: 'tailored-id' }]) };
            }),
          })),
          select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
        };
        const id = await run(tx);
        expect(captured).toMatchObject({ language: 'pt' });
        return id;
      }),
    };
    const service = new TailoredResumeService(database as never, makeQueue() as never, makeDenied() as never);
    const result = await service.createTailoredResume('user-1', { baseResumeId: BASE_ID, jobDescriptionId: JOB_ID });
    expect(result.id).toBe('tailored-id');
  });
});

describe('TailoredResumeService approve and deny', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should approve a suggestion by creating an evidence and marking it assumed', async () => {
    const bullet = { id: BULLET_ID, entryId: 'entry-1', text: 'Draft text', status: 'suggestion', requirementId: 'req-1', suggestionQuestion: 'Question?' };
    const database = {
      select: selectMock([
        [bullet],
        [{ id: 'entry-1', sectionId: 'sec-1' }],
        [{ id: 'sec-1', resumeId: 'resume-1' }],
        [{ id: 'resume-1' }],
        [{ id: 'profile-id' }],
      ]),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'evidence-new' }]) }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn(),
      transaction: vi.fn(),
    };
    const service = new TailoredResumeService(database as never, makeQueue() as never, makeDenied() as never);
    await service.approveSuggestion('user-1', BULLET_ID);
    expect(database.insert).toHaveBeenCalledTimes(1);
    expect(database.update).toHaveBeenCalledTimes(1);
  });

  it('should deny a suggestion through the denied service and remove the bullet', async () => {
    const bullet = { id: BULLET_ID, entryId: 'entry-1', text: 'Draft', status: 'suggestion', requirementId: 'req-1' };
    const database = {
      select: selectMock([
        [bullet],
        [{ id: 'entry-1', sectionId: 'sec-1' }],
        [{ id: 'sec-1', resumeId: 'resume-1' }],
        [{ id: 'resume-1' }],
        [{ id: 'profile-id' }],
      ]),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      transaction: vi.fn(),
    };
    const denied = makeDenied();
    const service = new TailoredResumeService(database as never, makeQueue() as never, denied as never);
    await service.denySuggestion('user-1', BULLET_ID);
    expect(denied.deny).toHaveBeenCalledWith('profile-id', 'req-1');
    expect(database.delete).toHaveBeenCalledTimes(1);
  });
});
