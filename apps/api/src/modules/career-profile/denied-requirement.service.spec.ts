import { describe, expect, it, vi } from 'vitest';
import { DeniedRequirementService } from './denied-requirement.service';
import type { Database } from '../database/database.provider';

const CAREER_PROFILE_ID = 'cp-123';
const REQUIREMENT_ID = 'req-456';
const NORMALIZED_CONCEPT = 'kubernetes';

function makeDatabaseForDeny(requirement: { normalizedConcept: string } | null): Database {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(requirement ? [requirement] : []),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

function makeDatabaseForFindDenied(deniedRows: Array<{ normalizedConcept: string }>): Database {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(deniedRows),
      }),
    }),
  } as unknown as Database;
}

function makeDatabaseForIsOwner(careerProfile: { id: string } | null): Database {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(careerProfile ? [careerProfile] : []),
      }),
    }),
  } as unknown as Database;
}

function makeDatabaseForUndenyGap(options: {
  requirement?: { normalizedConcept: string } | null;
  evaluation?: { careerProfileId: string } | null;
}): Database {
  let selectCallCount = 0;
  const where = vi.fn().mockImplementation(() => {
    const callIndex = selectCallCount++;
    if (callIndex === 0) {
      return Promise.resolve(options.requirement ? [options.requirement] : []);
    }
    return Promise.resolve(options.evaluation ? [options.evaluation] : []);
  });
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Database;
}

describe('DeniedRequirementService', () => {
  describe('deny', () => {
    it('should insert denied requirement with normalized concept', async () => {
      const database = makeDatabaseForDeny({ normalizedConcept: NORMALIZED_CONCEPT });
      const service = new DeniedRequirementService(database);

      await service.deny(CAREER_PROFILE_ID, REQUIREMENT_ID);

      expect(database.insert).toHaveBeenCalled();
    });

    it('should be idempotent when denying the same concept twice', async () => {
      const database = makeDatabaseForDeny({ normalizedConcept: NORMALIZED_CONCEPT });
      const service = new DeniedRequirementService(database);

      await service.deny(CAREER_PROFILE_ID, REQUIREMENT_ID);
      await service.deny(CAREER_PROFILE_ID, REQUIREMENT_ID);

      expect(database.insert).toHaveBeenCalledTimes(2);
    });

    it('should return silently when requirement does not exist', async () => {
      const database = makeDatabaseForDeny(null);
      const service = new DeniedRequirementService(database);

      await expect(
        service.deny(CAREER_PROFILE_ID, 'nonexistent-req'),
      ).resolves.toBeUndefined();

      expect(database.insert).not.toHaveBeenCalled();
    });
  });

  describe('undenyGap', () => {
    it('should delete the denied row for the concept of the requirement', async () => {
      const database = makeDatabaseForUndenyGap({
        requirement: { normalizedConcept: NORMALIZED_CONCEPT },
        evaluation: { careerProfileId: CAREER_PROFILE_ID },
      });
      const service = new DeniedRequirementService(database);

      await service.undenyGap({ evaluationId: 'eval-1', requirementId: REQUIREMENT_ID });

      expect(database.delete).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent when nothing was denied', async () => {
      const database = makeDatabaseForUndenyGap({
        requirement: { normalizedConcept: NORMALIZED_CONCEPT },
        evaluation: { careerProfileId: CAREER_PROFILE_ID },
      });
      const service = new DeniedRequirementService(database);

      await service.undenyGap({ evaluationId: 'eval-1', requirementId: REQUIREMENT_ID });
      const secondDatabase = makeDatabaseForUndenyGap({
        requirement: { normalizedConcept: NORMALIZED_CONCEPT },
        evaluation: { careerProfileId: CAREER_PROFILE_ID },
      });
      const secondService = new DeniedRequirementService(secondDatabase);

      await expect(
        secondService.undenyGap({ evaluationId: 'eval-1', requirementId: REQUIREMENT_ID }),
      ).resolves.toBeUndefined();
      expect(secondDatabase.delete).toHaveBeenCalledTimes(1);
    });

    it('should throw not found when the requirement does not exist', async () => {
      const database = makeDatabaseForUndenyGap({
        requirement: null,
        evaluation: { careerProfileId: CAREER_PROFILE_ID },
      });
      const service = new DeniedRequirementService(database);

      await expect(
        service.undenyGap({ evaluationId: 'eval-1', requirementId: 'missing-req' }),
      ).rejects.toThrow(/Requirement not found/);
      expect(database.delete).not.toHaveBeenCalled();
    });

    it('should throw not found when the evaluation does not exist', async () => {
      const database = makeDatabaseForUndenyGap({
        requirement: { normalizedConcept: NORMALIZED_CONCEPT },
        evaluation: null,
      });
      const service = new DeniedRequirementService(database);

      await expect(
        service.undenyGap({ evaluationId: 'missing-eval', requirementId: REQUIREMENT_ID }),
      ).rejects.toThrow(/Evaluation not found/);
      expect(database.delete).not.toHaveBeenCalled();
    });
  });

  describe('findDeniedConcepts', () => {
    it('should return set of denied normalized concepts', async () => {
      const database = makeDatabaseForFindDenied([
        { normalizedConcept: 'kubernetes' },
        { normalizedConcept: 'typescript' },
      ]);
      const service = new DeniedRequirementService(database);

      const result = await service.findDeniedConcepts(CAREER_PROFILE_ID);

      expect(result).toBeInstanceOf(Set);
      expect(result.has('kubernetes')).toBe(true);
      expect(result.has('typescript')).toBe(true);
      expect(result.has('python')).toBe(false);
    });

    it('should return empty set when no concepts denied', async () => {
      const database = makeDatabaseForFindDenied([]);
      const service = new DeniedRequirementService(database);

      const result = await service.findDeniedConcepts(CAREER_PROFILE_ID);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });
  });

  describe('isOwner', () => {
    it('should return true when career profile belongs to user', async () => {
      const database = makeDatabaseForIsOwner({ id: CAREER_PROFILE_ID });
      const service = new DeniedRequirementService(database);

      const result = await service.isOwner(CAREER_PROFILE_ID, 'user-123');

      expect(result).toBe(true);
    });

    it('should return false when career profile does not belong to user', async () => {
      const database = makeDatabaseForIsOwner(null);
      const service = new DeniedRequirementService(database);

      const result = await service.isOwner(CAREER_PROFILE_ID, 'other-user');

      expect(result).toBe(false);
    });
  });
});
