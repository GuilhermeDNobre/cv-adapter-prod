import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { deniedRequirements, evaluations, requirements } from 'schema';
import { DATABASE, type Database } from '../database/database.provider';

@Injectable()
export class DeniedRequirementService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async deny(
    careerProfileId: string,
    requirementId: string,
  ): Promise<void> {
    const [requirement] = await this.database
      .select({ normalizedConcept: requirements.normalizedConcept })
      .from(requirements)
      .where(eq(requirements.id, requirementId));

    if (requirement === undefined) {
      return;
    }

    await this.database
      .insert(deniedRequirements)
      .values({
        careerProfileId,
        normalizedConcept: requirement.normalizedConcept,
      })
      .onConflictDoNothing();
  }

  async undenyGap(params: { evaluationId: string; requirementId: string }): Promise<void> {
    const [requirement] = await this.database
      .select({ normalizedConcept: requirements.normalizedConcept })
      .from(requirements)
      .where(eq(requirements.id, params.requirementId));
    if (requirement === undefined) {
      throw new NotFoundException('Requirement not found.');
    }
    const [evaluation] = await this.database
      .select({ careerProfileId: evaluations.careerProfileId })
      .from(evaluations)
      .where(eq(evaluations.id, params.evaluationId));
    if (evaluation === undefined) {
      throw new NotFoundException('Evaluation not found.');
    }
    await this.database
      .delete(deniedRequirements)
      .where(
        and(
          eq(deniedRequirements.careerProfileId, evaluation.careerProfileId),
          eq(deniedRequirements.normalizedConcept, requirement.normalizedConcept),
        ),
      );
  }

  async findDeniedConcepts(
    careerProfileId: string,
  ): Promise<ReadonlySet<string>> {
    const rows = await this.database
      .select({ normalizedConcept: deniedRequirements.normalizedConcept })
      .from(deniedRequirements)
      .where(eq(deniedRequirements.careerProfileId, careerProfileId));

    return new Set(rows.map((r) => r.normalizedConcept));
  }

  async isOwner(
    careerProfileId: string,
    userId: string,
  ): Promise<boolean> {
    const { careerProfiles } = await import('schema');
    const [row] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(
        and(
          eq(careerProfiles.id, careerProfileId),
          eq(careerProfiles.userId, userId),
        ),
      );

    return row !== undefined;
  }
}
