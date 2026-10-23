import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTailoredCoverage } from './tailored-coverage';

const ADDED_ID = '22222222-2222-4222-8222-222222222222';
const REMOVED_ID = '33333333-3333-4333-8333-333333333333';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const RESUME_ID = '99999999-9999-4999-8999-999999999999';

function plan() {
  return {
    baseEvidenceIds: [REMOVED_ID],
    allocations: [{ sectionKind: 'experience', evidenceIds: [ADDED_ID] }],
    coverages: [],
  };
}

describe('buildTailoredCoverage with review', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should keep added and removed without a review', async () => {
    let selectCall = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ language: 'en' }]),
            }),
          };
        }
        if (selectCall === 2) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: ADDED_ID, statement: 'Added statement' },
              { id: REMOVED_ID, statement: 'Removed statement' },
            ]),
          }),
        };
      }),
    };
    const document = {
      resume: { jobDescriptionId: JOB_ID, adaptationPlan: plan(), adaptationReview: {} },
      bullets: [],
    };
    const result = await buildTailoredCoverage({ database: database as never, document: document as never });
    expect(result.adaptationChanges?.addedEvidences.map((item) => item.id)).toContain(ADDED_ID);
    expect(result.adaptationChanges?.removedEvidences.map((item) => item.id)).toContain(REMOVED_ID);
  });

  it('should drop a restored evidence from removedEvidences', async () => {
    let selectCall = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ language: 'en' }]),
            }),
          };
        }
        if (selectCall === 2) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: ADDED_ID, statement: 'Added statement' },
              { id: REMOVED_ID, statement: 'Removed statement' },
            ]),
          }),
        };
      }),
    };
    const document = {
      resume: {
        jobDescriptionId: JOB_ID,
        adaptationPlan: plan(),
        adaptationReview: {
          [REMOVED_ID]: { decision: 'restored', decidedAt: '2026-09-22T00:00:00.000Z', snapshot: [] },
        },
      },
      bullets: [],
    };
    const result = await buildTailoredCoverage({ database: database as never, document: document as never });
    expect(result.adaptationChanges?.removedEvidences).toEqual([]);
    expect(result.adaptationChanges?.addedEvidences.map((item) => item.id)).toContain(ADDED_ID);
  });

  it('should keep a rejected evidence in addedEvidences', async () => {
    let selectCall = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ language: 'en' }]),
            }),
          };
        }
        if (selectCall === 2) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: ADDED_ID, statement: 'Added statement' },
              { id: REMOVED_ID, statement: 'Removed statement' },
            ]),
          }),
        };
      }),
    };
    const document = {
      resume: {
        jobDescriptionId: JOB_ID,
        adaptationPlan: plan(),
        adaptationReview: {
          [ADDED_ID]: { decision: 'rejected', decidedAt: '2026-09-22T00:00:00.000Z', snapshot: [] },
        },
      },
      bullets: [],
    };
    const result = await buildTailoredCoverage({ database: database as never, document: document as never });
    expect(result.adaptationChanges?.addedEvidences.map((item) => item.id)).toContain(ADDED_ID);
    expect(result.adaptationChanges?.removedEvidences.map((item) => item.id)).toContain(REMOVED_ID);
  });

  it('should log and ignore an invalid review without throwing', async () => {
    let selectCall = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ language: 'en' }]),
            }),
          };
        }
        if (selectCall === 2) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: ADDED_ID, statement: 'Added statement' },
              { id: REMOVED_ID, statement: 'Removed statement' },
            ]),
          }),
        };
      }),
    };
    const document = {
      resume: {
        id: RESUME_ID,
        jobDescriptionId: JOB_ID,
        adaptationPlan: plan(),
        adaptationReview: { x: 1 },
      },
      bullets: [],
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await buildTailoredCoverage({ database: database as never, document: document as never });
    expect(errorSpy).toHaveBeenCalledWith('resume.adaptation_review.invalid_record', { resumeId: RESUME_ID });
    expect(result.adaptationChanges?.addedEvidences.map((item) => item.id)).toContain(ADDED_ID);
    expect(result.adaptationChanges?.removedEvidences.map((item) => item.id)).toContain(REMOVED_ID);
  });

  it('should not log for a null review', async () => {
    let selectCall = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ language: 'en' }]),
            }),
          };
        }
        if (selectCall === 2) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: ADDED_ID, statement: 'Added statement' },
              { id: REMOVED_ID, statement: 'Removed statement' },
            ]),
          }),
        };
      }),
    };
    const document = {
      resume: {
        id: RESUME_ID,
        jobDescriptionId: JOB_ID,
        adaptationPlan: plan(),
        adaptationReview: null,
      },
      bullets: [],
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await buildTailoredCoverage({ database: database as never, document: document as never });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
