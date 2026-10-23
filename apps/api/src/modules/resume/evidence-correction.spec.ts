import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { EvidenceCorrectionService } from '../career-profile/evidence-correction.service';
import { ResumeReviewService } from './resume-review.service';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const EVIDENCE_ID = '88888888-8888-4888-8888-888888888888';
const EXPERIENCE_ID = '99999999-9999-4999-8999-999999999999';

function makeOwnerDatabase() {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ userId: USER_ID, careerProfileId: 'profile-id' }]),
      }),
    }),
  }));
  return { select, update, set };
}

describe('EvidenceCorrectionService dates', () => {
  it('should accept year, year-month and month/year formats', async () => {
    for (const startedOn of ['2020', '2020-03', '03/2020']) {
      const database = makeOwnerDatabase();
      const service = new EvidenceCorrectionService(database as never);
      await service.correctExperience({ userId: USER_ID, experienceId: EXPERIENCE_ID, startedOn });
    }
  });

  it('should normalize month/year into year-month', async () => {
    const database = makeOwnerDatabase();
    const service = new EvidenceCorrectionService(database as never);
    await service.correctExperience({ userId: USER_ID, experienceId: EXPERIENCE_ID, startedOn: '03/2020' });
    expect(database.set).toHaveBeenCalledWith(expect.objectContaining({ startedOn: '2020-03' }));
  });

  it('should reject invalid periods with 422', async () => {
    for (const startedOn of ['2020-13', '13/2020', 'not-a-date']) {
      const database = makeOwnerDatabase();
      const service = new EvidenceCorrectionService(database as never);
      await expect(
        service.correctExperience({ userId: USER_ID, experienceId: EXPERIENCE_ID, startedOn }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
  });
});

describe('ResumeReviewService marking', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should mark only the bullets that lost their backing', async () => {
    const failingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const cleanId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const editing = {
      listReviewBulletsForEvidence: vi.fn().mockResolvedValue([
        { bullet: { id: failingId, text: 'Cut latency by 30% with caching.', evidenceId: EVIDENCE_ID }, sectionKind: 'experience', entryId: 'e1', entryExperienceId: null },
        { bullet: { id: cleanId, text: 'Led the team.', evidenceId: EVIDENCE_ID }, sectionKind: 'experience', entryId: 'e1', entryExperienceId: null },
      ]),
      markBulletsNeedingReview: vi.fn().mockResolvedValue(1),
    };
    let selectCalls = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCalls += 1;
        if (selectCalls === 1) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 'profile-id' }]) }) };
        }
        if (selectCalls === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: EVIDENCE_ID, statement: 'Led the team.', experienceId: null }]),
            }),
          };
        }
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
      }),
    };
    const service = new ResumeReviewService(database as never, editing as never);

    const result = await service.markForEvidence({ userId: USER_ID, evidenceId: EVIDENCE_ID });

    expect(result.bulletCount).toBe(1);
    expect(editing.markBulletsNeedingReview).toHaveBeenCalledWith([failingId]);
  });

  it('should log experienceId when the correction started from an experience', async () => {
    const logged: unknown[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args[1]);
    });
    const editing = {
      listReviewBulletsForExperience: vi.fn().mockResolvedValue([]),
      markBulletsNeedingReview: vi.fn().mockResolvedValue(0),
    };
    let selectCalls = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCalls += 1;
        if (selectCalls === 1) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 'profile-id' }]) }) };
        }
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
      }),
    };
    const service = new ResumeReviewService(database as never, editing as never);

    await service.markForExperience({ userId: USER_ID, experienceId: EXPERIENCE_ID });

    expect(logged).toEqual([{ experienceId: EXPERIENCE_ID, bulletCount: 0 }]);
  });
});
