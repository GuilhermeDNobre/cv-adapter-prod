import { InternalServerErrorException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evidences, resumeBullets, resumeEntries, resumeSections, resumes } from 'schema';
import { AdaptationReviewService, parseReviewRecord } from './adaptation-review.service';

const RESUME_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ADDED = '22222222-2222-4222-8222-222222222222';
const EVIDENCE_REMOVED = '33333333-3333-4333-8333-333333333333';
const EVIDENCE_UNKNOWN = '44444444-4444-4444-8444-444444444444';
const EXPERIENCE_ID = '55555555-5555-4555-8555-555555555555';
const SECTION_ID = '66666666-6666-4666-8666-666666666666';
const ENTRY_ID = '77777777-7777-4777-8777-777777777777';
const BULLET_ID = '88888888-8888-4888-8888-888888888888';

function planWithAddedRemoved() {
  return {
    baseEvidenceIds: [EVIDENCE_REMOVED],
    allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_ADDED] }],
    coverages: [],
  };
}

function tailoredResumeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RESUME_ID,
    userId: 'user-1',
    kind: 'tailored',
    name: 'Tailored',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 1,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: 'base-id',
    jobDescriptionId: 'job-id',
    generationStatus: 'ready',
    generationStep: null,
    failureReason: null,
    adaptationPlan: planWithAddedRemoved(),
    adaptationReview: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function evidenceRow(id: string, experienceId: string | null = null) {
  return {
    id,
    careerProfileId: 'profile-id',
    experienceId,
    statement: `Statement for ${id.slice(0, 8)}`,
    createdAt: new Date(),
  };
}

function whereResult(rows: unknown[]) {
  const promise = Promise.resolve(rows) as Promise<unknown[]> & { orderBy: () => Promise<unknown[]> };
  promise.orderBy = () => Promise.resolve(rows);
  return promise;
}

function makeSelect(fromHandler: (table: unknown) => unknown[]) {
  return vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => ({
      where: vi.fn().mockImplementation(() => whereResult(fromHandler(table))),
    })),
  }));
}

function makeSimpleDatabase(resumeRow: unknown, evidence: unknown) {
  return {
    select: makeSelect((table: unknown) => {
      if (table === resumes) {
        return resumeRow === undefined ? [] : [resumeRow];
      }
      if (table === evidences) {
        return evidence === undefined ? [] : [evidence];
      }
      return [];
    }),
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

describe('parseReviewRecord', () => {
  it('should return an empty record for null', () => {
    expect(parseReviewRecord(null)).toEqual({ ok: true, record: {} });
  });

  it('should return not ok for invalid stored data', () => {
    expect(parseReviewRecord({ nope: true })).toEqual({ ok: false });
  });

  it('should keep a valid stored decision', () => {
    const stored = {
      [EVIDENCE_ADDED]: { decision: 'rejected', decidedAt: '2026-09-22T00:00:00.000Z', snapshot: [] },
    };
    expect(parseReviewRecord(stored)).toEqual({ ok: true, record: stored });
  });

  it('should default missing snapshot flags to false', () => {
    const stored = {
      [EVIDENCE_ADDED]: {
        decision: 'rejected',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [{ entryId: ENTRY_ID, ordinal: 0, text: 'Led', bulletId: BULLET_ID }],
      },
    };
    const result = parseReviewRecord(stored);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record[EVIDENCE_ADDED]?.snapshot[0]).toMatchObject({
        editedByPerson: false,
        needsReview: false,
      });
    }
  });
});

describe('AdaptationReviewService validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw NotFound when the resume does not belong to the user', async () => {
    const database = makeSimpleDatabase(undefined, evidenceRow(EVIDENCE_ADDED));
    const service = new AdaptationReviewService(database as never);
    await expect(
      service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED, decision: 'accepted' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw NotFound when the evidence does not exist', async () => {
    const database = makeSimpleDatabase(tailoredResumeRow(), undefined);
    const service = new AdaptationReviewService(database as never);
    await expect(
      service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_UNKNOWN, decision: 'accepted' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject any action on a base resume with 422', async () => {
    const database = makeSimpleDatabase(tailoredResumeRow({ kind: 'base' }), evidenceRow(EVIDENCE_ADDED));
    const service = new AdaptationReviewService(database as never);
    await expect(
      service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED, decision: 'accepted' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should reject when generationStatus is not ready with 422', async () => {
    const database = makeSimpleDatabase(
      tailoredResumeRow({ generationStatus: 'generating' }),
      evidenceRow(EVIDENCE_ADDED),
    );
    const service = new AdaptationReviewService(database as never);
    await expect(
      service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED, decision: 'accepted' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should reject accepting an evidence that is not added with 422', async () => {
    const database = makeSimpleDatabase(tailoredResumeRow(), evidenceRow(EVIDENCE_REMOVED));
    const service = new AdaptationReviewService(database as never);
    await expect(
      service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_REMOVED, decision: 'accepted' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should reject rejecting an evidence that is not added with 422', async () => {
    const database = makeSimpleDatabase(tailoredResumeRow(), evidenceRow(EVIDENCE_REMOVED));
    const service = new AdaptationReviewService(database as never);
    await expect(
      service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_REMOVED, decision: 'rejected' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should reject restoring an evidence that is not removed with 422', async () => {
    const database = makeSimpleDatabase(tailoredResumeRow(), evidenceRow(EVIDENCE_ADDED));
    const service = new AdaptationReviewService(database as never);
    await expect(
      service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED, decision: 'restored' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should reject undo without a decision with 422', async () => {
    const database = makeSimpleDatabase(tailoredResumeRow(), evidenceRow(EVIDENCE_ADDED));
    const service = new AdaptationReviewService(database as never);
    await expect(service.undo({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('should fail decide with 500 and log without writing when the record is invalid', async () => {
    const resume = tailoredResumeRow({ adaptationReview: { x: 1 } });
    const database = makeSimpleDatabase(resume, evidenceRow(EVIDENCE_ADDED));
    const service = new AdaptationReviewService(database as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED, decision: 'accepted' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(errorSpy).toHaveBeenCalledWith('resume.adaptation_review.invalid_record', { resumeId: RESUME_ID });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('should fail undo with 500 and log without writing when the record is invalid', async () => {
    const resume = tailoredResumeRow({ adaptationReview: { x: 1 } });
    const database = makeSimpleDatabase(resume, evidenceRow(EVIDENCE_ADDED));
    const service = new AdaptationReviewService(database as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(service.undo({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(errorSpy).toHaveBeenCalledWith('resume.adaptation_review.invalid_record', { resumeId: RESUME_ID });
    expect(database.transaction).not.toHaveBeenCalled();
  });
});

describe('AdaptationReviewService restore destination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function makeRestoreDatabase(options: { evidenceExperienceId: string | null; tailoredHasExperienceEntry: boolean }) {
    const resume = tailoredResumeRow();
    const evidence = evidenceRow(EVIDENCE_REMOVED, options.evidenceExperienceId);
    const tailoredSections = [{ id: SECTION_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0 }];
    const tailoredEntries = [
      {
        id: ENTRY_ID,
        sectionId: SECTION_ID,
        ordinal: 0,
        experienceId: options.tailoredHasExperienceEntry ? options.evidenceExperienceId : null,
        educationEntryId: null,
        heading: null,
      },
    ];
    const insertedId = '99999999-9999-4999-8999-999999999999';
    let insertedValues: unknown;
    const txSelect = makeSelect((table: unknown) => {
      if (table === resumes) {
        return [resume];
      }
      if (table === resumeSections) {
        return tailoredSections;
      }
      if (table === resumeEntries) {
        return tailoredEntries;
      }
      if (table === resumeBullets) {
        return [];
      }
      return [];
    });
    const tx = {
      select: txSelect,
      insert: vi.fn().mockImplementation((table: unknown) => {
        if (table === resumeEntries) {
          return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: ENTRY_ID }]) }) };
        }
        return {
          values: vi.fn().mockImplementation((values: unknown) => {
            insertedValues = values;
            return { returning: vi.fn().mockResolvedValue([{ id: insertedId }]) };
          }),
        };
      }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    };
    const database = {
      select: makeSelect((table: unknown) => {
        if (table === resumes) {
          return [resume];
        }
        if (table === evidences) {
          return [evidence];
        }
        if (table === resumeSections) {
          return tailoredSections;
        }
        if (table === resumeEntries) {
          return tailoredEntries;
        }
        if (table === resumeBullets) {
          return [];
        }
        return [];
      }),
      transaction: vi.fn().mockImplementation(async (run: (tx: unknown) => Promise<void>) => run(tx)),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    return { database, tx, getInserted: () => insertedValues, insertedId };
  }

  it('should restore into the entry with the same experience_id', async () => {
    const { database, getInserted } = makeRestoreDatabase({ evidenceExperienceId: EXPERIENCE_ID, tailoredHasExperienceEntry: true });
    const service = new AdaptationReviewService(database as never);
    const resumeId = await service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_REMOVED, decision: 'restored' });
    expect(resumeId).toBe(RESUME_ID);
    const inserted = getInserted() as { entryId: string; evidenceId: string; status: string; text: string };
    expect(inserted.entryId).toBe(ENTRY_ID);
    expect(inserted.evidenceId).toBe(EVIDENCE_REMOVED);
    expect(inserted.status).toBe('assumed');
  });

  it('should restore into the first entry of the base kind when no experience entry matches', async () => {
    const { database, getInserted } = makeRestoreDatabase({ evidenceExperienceId: null, tailoredHasExperienceEntry: false });
    const service = new AdaptationReviewService(database as never);
    await service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_REMOVED, decision: 'restored' });
    const inserted = getInserted() as { entryId: string };
    expect(inserted.entryId).toBe(ENTRY_ID);
  });

  it('should never write to evidences when deciding', async () => {
    const { database, tx } = makeRestoreDatabase({ evidenceExperienceId: EXPERIENCE_ID, tailoredHasExperienceEntry: true });
    const service = new AdaptationReviewService(database as never);
    await service.decide({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_REMOVED, decision: 'restored' });
    expect(database.insert).not.toHaveBeenCalled();
    for (const call of (tx.insert as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).not.toBe(evidences);
    }
  });
});

describe('AdaptationReviewService undo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function makeUndoDatabase(review: Record<string, unknown>, bullets: Array<Record<string, unknown>>) {
    const resume = tailoredResumeRow({ adaptationReview: review });
    const txSelect = makeSelect((table: unknown) => {
      if (table === resumes) {
        return [resume];
      }
      if (table === resumeBullets) {
        return bullets;
      }
      return [];
    });
    const inserted: unknown[] = [];
    const deleted: unknown[][] = [];
    const tx = {
      select: txSelect,
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((values: unknown) => {
          inserted.push(values);
          return { returning: vi.fn().mockResolvedValue([]) };
        }),
      })),
      delete: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          deleted.push([]);
          return Promise.resolve(undefined);
        }),
      })),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    };
    const database = {
      select: makeSelect((table: unknown) => {
        if (table === resumes) {
          return [resume];
        }
        if (table === evidences) {
          return [evidenceRow(EVIDENCE_ADDED)];
        }
        return [];
      }),
      transaction: vi.fn().mockImplementation(async (run: (tx: unknown) => Promise<void>) => run(tx)),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    return { database, tx, inserted, deleted };
  }

  it('should undo a rejection by reinserting the bullet with the same text and ordinal', async () => {
    const review = {
      [EVIDENCE_ADDED]: {
        decision: 'rejected',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [{ entryId: ENTRY_ID, ordinal: 1, text: 'Led a team', bulletId: BULLET_ID }],
      },
    };
    const { database, inserted } = makeUndoDatabase(review, []);
    const service = new AdaptationReviewService(database as never);
    await service.undo({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED });
    expect(inserted).toHaveLength(1);
    const restored = inserted[0] as { text: string; ordinal: number; id: string; evidenceId: string };
    expect(restored.text).toBe('Led a team');
    expect(restored.ordinal).toBe(1);
    expect(restored.id).toBe(BULLET_ID);
    expect(restored.evidenceId).toBe(EVIDENCE_ADDED);
  });

  it('should undo a restore by deleting the inserted bullet', async () => {
    const review = {
      [EVIDENCE_REMOVED]: {
        decision: 'restored',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [{ entryId: ENTRY_ID, ordinal: 2, text: 'Shipped flow', bulletId: BULLET_ID }],
      },
    };
    const { database, tx } = makeUndoDatabase(review, []);
    const service = new AdaptationReviewService(database as never);
    await service.undo({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_REMOVED });
    expect(tx.delete).toHaveBeenCalled();
  });

  it('should undo an accept by removing the key without touching bullets', async () => {
    const review = {
      [EVIDENCE_ADDED]: { decision: 'accepted', decidedAt: '2026-09-22T00:00:00.000Z', snapshot: [] },
    };
    const { database, tx } = makeUndoDatabase(review, []);
    const service = new AdaptationReviewService(database as never);
    await service.undo({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
  });

  it('should undo a rejection keeping editedByPerson and needsReview', async () => {
    const review = {
      [EVIDENCE_ADDED]: {
        decision: 'rejected',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [
          { entryId: ENTRY_ID, ordinal: 0, text: 'Edited text', bulletId: BULLET_ID, editedByPerson: true, needsReview: true },
        ],
      },
    };
    const { database, inserted } = makeUndoDatabase(review, []);
    const service = new AdaptationReviewService(database as never);
    await service.undo({ resumeId: RESUME_ID, userId: 'user-1', evidenceId: EVIDENCE_ADDED });
    expect(inserted).toHaveLength(1);
    const restored = inserted[0] as { editedByPerson: boolean; needsReview: boolean };
    expect(restored.editedByPerson).toBe(true);
    expect(restored.needsReview).toBe(true);
  });
});
