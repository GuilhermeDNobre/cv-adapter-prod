import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  careerProfiles,
  evaluations,
  evidences,
  jobDescriptions,
  requirementCoverages,
  requirements,
  resumes,
} from 'schema';
import type {
  DenyGapResponse,
  EvaluationResponse,
  ReevaluationComparison,
  RequirementCoverageResponse,
  ResumeReevaluationLatestResponse,
} from 'schema/contracts/evaluation';
import {
  evaluationIdSchema,
  evaluationResponseSchema,
  resumeReevaluationLatestResponseSchema,
} from 'schema/contracts/evaluation';
import { jobDescriptionIdSchema } from 'schema/contracts/job-description';
import { resumeIdSchema } from 'schema/contracts/resume';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DATABASE, type Database } from '../database/database.provider';
import { DEFAULT_JOB_OPTIONS, EVALUATION_QUEUE } from '../../queue.module';
import { DeniedRequirementService } from '../career-profile/denied-requirement.service';

@Injectable()
export class EvaluationService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @InjectQueue(EVALUATION_QUEUE) private readonly evaluationQueue: Queue,
    @Inject(DeniedRequirementService) private readonly deniedRequirementService: DeniedRequirementService,
  ) {}

  async createEvaluation(
    userId: string,
    jobDescriptionId: string,
  ): Promise<EvaluationResponse> {
    const [careerProfile] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));

    if (careerProfile === undefined) {
      throw new UnprocessableEntityException(
        'You must have a Career Profile before requesting an evaluation.',
      );
    }

    const [jobDescription] = await this.database
      .select({ id: jobDescriptions.id })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, jobDescriptionId));

    if (jobDescription === undefined) {
      throw new NotFoundException('Job description not found.');
    }

    const [row] = await this.database
      .insert(evaluations)
      .values({
        userId,
        jobDescriptionId,
        careerProfileId: careerProfile.id,
        status: 'queued',
      })
      .returning();

    if (row === undefined) {
      throw new Error('Failed to create evaluation row');
    }

    await this.evaluationQueue.add(
      'evaluate',
      {
        evaluationId: row.id,
        userId,
        jobDescriptionId,
        careerProfileId: careerProfile.id,
      },
      DEFAULT_JOB_OPTIONS,
    );

    console.log('evaluation.enqueued', {
      evaluationId: row.id,
      userId,
      jobDescriptionId,
    });

    return toResponse(row, []);
  }

  async getEvaluation(
    evaluationId: string,
    userId: string,
  ): Promise<EvaluationResponse> {
    const parsedId = evaluationIdSchema.safeParse(evaluationId);
    if (!parsedId.success) {
      throw new NotFoundException('Evaluation not found.');
    }

    const [row] = await this.database
      .select()
      .from(evaluations)
      .where(eq(evaluations.id, parsedId.data));

    if (row === undefined || row.userId !== userId) {
      throw new NotFoundException('Evaluation not found.');
    }

    const coverageResponses = await this.buildCoverageResponses(row);

    return toResponse(row, coverageResponses);
  }

  async getEvaluationByJobDescription(
    jobDescriptionId: string,
    userId: string,
  ): Promise<EvaluationResponse> {
    const parsedId = jobDescriptionIdSchema.safeParse(jobDescriptionId);
    if (!parsedId.success) {
      throw new NotFoundException('Evaluation not found.');
    }
    const [row] = await this.database
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.jobDescriptionId, parsedId.data),
          eq(evaluations.userId, userId),
          isNull(evaluations.resumeId),
        ),
      )
      .orderBy(desc(evaluations.createdAt))
      .limit(1);
    if (row === undefined) {
      throw new NotFoundException('Evaluation not found.');
    }
    const coverageResponses = await this.buildCoverageResponses(row);
    return toResponse(row, coverageResponses);
  }

  async createResumeEvaluation(userId: string, resumeId: string): Promise<EvaluationResponse> {
    const resume = await this.loadOwnedResume(userId, resumeId);
    assertTailoredForReevaluation(resume);
    if (resume.jobDescriptionId === null) {
      throw new UnprocessableEntityException('Only a tailored resume can be reevaluated.');
    }
    const careerProfileId = await this.loadCareerProfileIdOrThrow(userId);
    const row = await this.insertResumeEvaluation({
      userId,
      jobDescriptionId: resume.jobDescriptionId,
      careerProfileId,
      resumeId: resume.id,
    });
    await this.evaluationQueue.add(
      'evaluate',
      {
        evaluationId: row.id,
        userId,
        jobDescriptionId: resume.jobDescriptionId,
        careerProfileId,
        resumeId: resume.id,
      },
      DEFAULT_JOB_OPTIONS,
    );
    console.log('evaluation.enqueued', {
      evaluationId: row.id,
      userId,
      jobDescriptionId: resume.jobDescriptionId,
      resumeId: resume.id,
    });
    return toResponse(row, []);
  }
  private async loadOwnedResume(userId: string, resumeId: string) {
    const parsedId = resumeIdSchema.safeParse(resumeId);
    if (!parsedId.success) {
      throw new NotFoundException('Resume not found.');
    }
    const [resume] = await this.database
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, parsedId.data), eq(resumes.userId, userId)));
    if (resume === undefined) {
      throw new NotFoundException('Resume not found.');
    }
    return resume;
  }
  private async loadCareerProfileIdOrThrow(userId: string): Promise<string> {
    const [careerProfile] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    if (careerProfile === undefined) {
      throw new UnprocessableEntityException(
        'You must have a Career Profile before requesting an evaluation.',
      );
    }
    return careerProfile.id;
  }
  private async insertResumeEvaluation(input: {
    readonly userId: string;
    readonly jobDescriptionId: string;
    readonly careerProfileId: string;
    readonly resumeId: string;
  }) {
    const [row] = await this.database
      .insert(evaluations)
      .values({
        userId: input.userId,
        jobDescriptionId: input.jobDescriptionId,
        careerProfileId: input.careerProfileId,
        resumeId: input.resumeId,
        status: 'queued',
      })
      .returning();
    if (row === undefined) {
      throw new Error('Failed to create evaluation row');
    }
    return row;
  }

  async getLatestResumeEvaluation(
    userId: string,
    resumeId: string,
  ): Promise<ResumeReevaluationLatestResponse> {
    const resume = await this.loadOwnedResume(userId, resumeId);
    assertTailoredForReevaluation(resume);
    if (resume.jobDescriptionId === null) {
      throw new NotFoundException('Resume not found.');
    }
    const row = await this.findLatestReevaluation(userId, resume.id);
    if (row === undefined) {
      throw new NotFoundException('Evaluation not found.');
    }
    const coverageResponses = await this.buildCoverageResponses(row);
    const baselineRow = await this.findBaselineEvaluation(userId, resume.jobDescriptionId);
    const baselineCoverages =
      baselineRow === undefined ? [] : await this.buildCoverageResponses(baselineRow);
    const requirementRows = await this.database
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, resume.jobDescriptionId));
    const comparisons = buildComparisons({
      requirements: requirementRows,
      before: baselineCoverages,
      after: coverageResponses,
    });
    return resumeReevaluationLatestResponseSchema.parse({
      id: row.id,
      status: row.status,
      matchScore: row.matchScore,
      failureReason: row.failureReason,
      resumeId: row.resumeId ?? null,
      requirementCoverages: coverageResponses,
      baseline:
        baselineRow === undefined
          ? null
          : {
              id: baselineRow.id,
              matchScore: baselineRow.matchScore,
              requirementCoverages: baselineCoverages,
            },
      comparisons,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  private async findLatestReevaluation(userId: string, resumeId: string) {
    const [row] = await this.database
      .select()
      .from(evaluations)
      .where(and(eq(evaluations.resumeId, resumeId), eq(evaluations.userId, userId)))
      .orderBy(desc(evaluations.createdAt))
      .limit(1);
    return row;
  }
  private async findBaselineEvaluation(userId: string, jobDescriptionId: string) {
    const [row] = await this.database
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.jobDescriptionId, jobDescriptionId),
          eq(evaluations.userId, userId),
          isNull(evaluations.resumeId),
        ),
      )
      .orderBy(desc(evaluations.createdAt))
      .limit(1);
    return row;
  }

  private async buildCoverageResponses(
    row: typeof evaluations.$inferSelect,
  ): Promise<RequirementCoverageResponse[]> {
    const coverages = await this.database
      .select()
      .from(requirementCoverages)
      .where(eq(requirementCoverages.evaluationId, row.id));

    const requirementRows = await this.database
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, row.jobDescriptionId));

    const requirementMap = new Map(requirementRows.map((r) => [r.id, r]));

    const deniedConcepts =
      await this.deniedRequirementService.findDeniedConcepts(row.careerProfileId);

    const statementMap = await this.findEvidenceStatements(coverages);

    return coverages.map((c) => {
      const req = requirementMap.get(c.requirementId);
      const normalizedConcept = req?.normalizedConcept ?? '';
      return {
        requirementId: c.requirementId,
        literalTerm: req?.literalTerm ?? '',
        concept: req?.concept ?? '',
        kind: (req?.kind ?? 'mandatory') as 'mandatory' | 'desirable',
        coverage: c.coverage,
        evidenceId: c.evidenceId,
        evidenceStatement:
          c.evidenceId === null ? null : (statementMap.get(c.evidenceId) ?? null),
        rationale: c.rationale,
        denied: deniedConcepts.has(normalizedConcept),
      };
    });
  }

  private async findEvidenceStatements(
    coverages: ReadonlyArray<{ evidenceId: string | null }>,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        coverages
          .map((c) => c.evidenceId)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (ids.length === 0) return new Map();
    const rows = await this.database
      .select({ id: evidences.id, statement: evidences.statement })
      .from(evidences)
      .where(inArray(evidences.id, ids));
    return new Map(rows.map((r) => [r.id, r.statement]));
  }

  async denyGap(
    evaluationId: string,
    requirementId: string,
    userId: string,
  ): Promise<DenyGapResponse> {
    const parsedId = evaluationIdSchema.safeParse(evaluationId);
    if (!parsedId.success) {
      throw new NotFoundException('Evaluation not found.');
    }

    const [evaluation] = await this.database
      .select()
      .from(evaluations)
      .where(eq(evaluations.id, parsedId.data));

    if (evaluation === undefined || evaluation.userId !== userId) {
      throw new NotFoundException('Evaluation not found.');
    }

    const [requirement] = await this.database
      .select({ normalizedConcept: requirements.normalizedConcept })
      .from(requirements)
      .where(eq(requirements.id, requirementId));

    if (requirement === undefined) {
      throw new NotFoundException('Requirement not found.');
    }

    await this.deniedRequirementService.deny(
      evaluation.careerProfileId,
      requirementId,
    );

    return {
      denied: true,
      normalizedConcept: requirement.normalizedConcept,
    };
  }
}

function assertTailoredForReevaluation(resume: { kind: string }): void {
  if (resume.kind !== 'tailored') {
    throw new UnprocessableEntityException('Only a tailored resume can be reevaluated.');
  }
}

function toResponse(
  row: typeof evaluations.$inferSelect,
  coverages: RequirementCoverageResponse[],
): EvaluationResponse {
  return evaluationResponseSchema.parse({
    id: row.id,
    status: row.status,
    matchScore: row.matchScore,
    failureReason: row.failureReason,
    resumeId: row.resumeId ?? null,
    requirementCoverages: coverages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function isImproved(
  before: 'covered' | 'partial' | 'gap' | null,
  after: 'covered' | 'partial' | 'gap',
): boolean {
  if (before === null) {
    return false;
  }
  if (before === 'gap' && (after === 'partial' || after === 'covered')) {
    return true;
  }
  return before === 'partial' && after === 'covered';
}

function buildComparisons(input: {
  readonly requirements: ReadonlyArray<{
    readonly id: string;
    readonly literalTerm: string;
    readonly kind: 'mandatory' | 'desirable';
  }>;
  readonly before: ReadonlyArray<{
    readonly requirementId: string;
    readonly coverage: 'covered' | 'partial' | 'gap';
  }>;
  readonly after: ReadonlyArray<{
    readonly requirementId: string;
    readonly coverage: 'covered' | 'partial' | 'gap';
  }>;
}): ReevaluationComparison[] {
  const beforeById = new Map(input.before.map((item) => [item.requirementId, item.coverage]));
  const afterById = new Map(input.after.map((item) => [item.requirementId, item.coverage]));
  return input.requirements.map((requirement) => {
    const coverageBefore = beforeById.get(requirement.id) ?? null;
    const coverageAfter = afterById.get(requirement.id) ?? 'gap';
    return {
      requirementId: requirement.id,
      literalTerm: requirement.literalTerm,
      kind: requirement.kind,
      coverageBefore,
      coverageAfter,
      improved: isImproved(coverageBefore, coverageAfter),
    };
  });
}
