import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { careerProfiles, evidences, experiences } from 'schema';
import { DATABASE, type Database } from '../database/database.provider';
import { normalizePartialDate } from './partial-date';

export interface CorrectEvidenceInput {
  readonly userId: string;
  readonly evidenceId: string;
  readonly statement: string;
}

export interface CorrectExperienceInput {
  readonly userId: string;
  readonly experienceId: string;
  readonly company?: string;
  readonly role?: string;
  readonly startedOn?: string;
  readonly endedOn?: string | null;
}

@Injectable()
export class EvidenceCorrectionService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async correctEvidence(input: CorrectEvidenceInput): Promise<{ careerProfileId: string }> {
    const owner = await this.findEvidenceOwner(input.evidenceId);
    if (owner === undefined || owner.userId !== input.userId) {
      throw new NotFoundException('Evidence not found.');
    }
    await this.database
      .update(evidences)
      .set({ statement: input.statement })
      .where(eq(evidences.id, input.evidenceId));
    return { careerProfileId: owner.careerProfileId };
  }

  async correctExperience(input: CorrectExperienceInput): Promise<{ careerProfileId: string }> {
    const owner = await this.findExperienceOwner(input.experienceId);
    if (owner === undefined || owner.userId !== input.userId) {
      throw new NotFoundException('Experience not found.');
    }
    const patch = this.buildExperiencePatch(input);
    await this.database
      .update(experiences)
      .set(patch)
      .where(eq(experiences.id, input.experienceId));
    return { careerProfileId: owner.careerProfileId };
  }

  private async findEvidenceOwner(evidenceId: string) {
    const [row] = await this.database
      .select({ userId: careerProfiles.userId, careerProfileId: evidences.careerProfileId })
      .from(evidences)
      .innerJoin(careerProfiles, eq(careerProfiles.id, evidences.careerProfileId))
      .where(eq(evidences.id, evidenceId));
    return row;
  }

  private async findExperienceOwner(experienceId: string) {
    const [row] = await this.database
      .select({ userId: careerProfiles.userId, careerProfileId: experiences.careerProfileId })
      .from(experiences)
      .innerJoin(careerProfiles, eq(careerProfiles.id, experiences.careerProfileId))
      .where(eq(experiences.id, experienceId));
    return row;
  }

  private buildExperiencePatch(input: CorrectExperienceInput): Partial<typeof experiences.$inferInsert> {
    const patch: Partial<typeof experiences.$inferInsert> = {};
    if (input.company !== undefined) {
      patch.company = input.company;
    }
    if (input.role !== undefined) {
      patch.role = input.role;
    }
    if (input.startedOn !== undefined) {
      patch.startedOn = this.requirePartialDate(input.startedOn);
    }
    if (input.endedOn !== undefined) {
      patch.endedOn = this.requireNullablePartialDate(input.endedOn);
    }
    return patch;
  }

  private requirePartialDate(value: string): string {
    const normalized = normalizePartialDate(value);
    if (normalized === null) {
      throw new UnprocessableEntityException('A date is not in a supported format.');
    }
    return normalized;
  }

  private requireNullablePartialDate(value: string | null): string | null {
    if (value === null) {
      return null;
    }
    return this.requirePartialDate(value);
  }
}
