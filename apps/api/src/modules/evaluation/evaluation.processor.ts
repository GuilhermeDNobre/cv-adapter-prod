import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { eq, inArray } from 'drizzle-orm';
import {
  evaluations,
  evidences,
  requirementCoverages,
  requirements,
  resumeBullets,
  resumeEntries,
  resumeSectionSkills,
  resumeSections,
  resumeSkillProposals,
  skills,
} from 'schema';
import { AI_CLIENT, type AiClient } from '../ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from '../ai/ai-errors';
import { evaluateCoverageOutputSchema } from '../ai/prompts/evaluate-coverage';
import { calculateMatchScore } from './match-score';
import { DATABASE, type Database } from '../database/database.provider';
import { EVALUATION_QUEUE } from '../../queue.module';

const STEP_FETCH = 'fetching';
const STEP_AI = 'analyzing';
const STEP_VALIDATE = 'validating';
const STEP_PERSIST = 'persisting';

type EvaluationFailureReason = typeof evaluations.$inferInsert.failureReason;

interface ProcessorJobData {
  readonly evaluationId: string;
  readonly userId: string;
  readonly jobDescriptionId: string;
  readonly careerProfileId: string;
  readonly resumeId?: string | null;
}

@Injectable()
@Processor(EVALUATION_QUEUE)
export class EvaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(EvaluationProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(AI_CLIENT) private readonly aiClient: AiClient,
  ) {
    super();
  }

  async process(job: Job<ProcessorJobData>): Promise<void> {
    const { evaluationId, jobDescriptionId, careerProfileId, resumeId } = job.data;
    this.logger.log('Processing evaluation', { evaluationId });
    const existing = await this.findEvaluationRow(evaluationId);
    if (existing === undefined) {
      this.logger.log('evaluation.skipped_missing', { evaluationId });
      return;
    }
    try {
      await this.executePipeline(job, evaluationId, jobDescriptionId, careerProfileId, resumeId ?? null);
    } catch (error) {
      await this.handlePipelineError(job, evaluationId, error);
    }
  }

  private async executePipeline(
    job: Job<ProcessorJobData>,
    evaluationId: string,
    jobDescriptionId: string,
    careerProfileId: string,
    resumeId: string | null,
  ): Promise<void> {
    await job.updateProgress({ step: STEP_FETCH, percent: 10 });
    const requirementRows = await this.database
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, jobDescriptionId));
    const evidenceRows =
      resumeId === null
        ? await this.database
            .select()
            .from(evidences)
            .where(eq(evidences.careerProfileId, careerProfileId))
        : await this.loadResumeEvidenceTexts(resumeId, careerProfileId);
    const evidenceIdSet = new Set(evidenceRows.map((e) => e.id));

    await job.updateProgress({ step: STEP_AI, percent: 30 });
    const aiOutput = await this.aiClient.complete({
      promptName: 'evaluate-coverage',
      payload: {
        requirements: requirementRows.map((r) => ({
          id: r.id,
          literalTerm: r.literalTerm,
          concept: r.concept,
          kind: r.kind,
        })),
        evidences: evidenceRows.map((e) => ({
          id: e.id,
          statement: e.statement,
        })),
      },
      outputSchema: evaluateCoverageOutputSchema,
    });

    await job.updateProgress({ step: STEP_VALIDATE, percent: 60 });
    const coverageMap = new Map(
      aiOutput.coverages.map((c) => [c.requirementId, c]),
    );

    // Validate completeness: every requirement must have a classification
    for (const req of requirementRows) {
      if (!coverageMap.has(req.id)) {
        throw new Error(
          `AI response missing classification for requirement ${req.id}`,
        );
      }
    }

    // Validate evidence references: if coverage is not gap, evidenceId must exist
    const validCoverages = requirementRows.map((req) => {
      const aiCoverage = coverageMap.get(req.id)!;
      let coverage: 'covered' | 'partial' | 'gap' = aiCoverage.coverage as 'covered' | 'partial' | 'gap';
      let evidenceId: string | null = aiCoverage.evidenceId;
      if (resumeId === null) {
        if (coverage !== 'gap' && evidenceId !== null && !evidenceIdSet.has(evidenceId)) {
          this.logger.log('Discarding broken evidence reference', {
            requirementId: req.id,
            invalidEvidenceId: evidenceId,
          });
          evidenceId = null;
          coverage = 'gap';
        } else if (coverage !== 'gap' && evidenceId === null) {
          coverage = 'gap';
        }
      } else if (coverage !== 'gap' && evidenceId !== null && !evidenceIdSet.has(evidenceId)) {
        this.logger.log('Discarding broken evidence reference', {
          requirementId: req.id,
          invalidEvidenceId: evidenceId,
        });
        evidenceId = null;
        coverage = 'gap';
      } else {
        evidenceId = null;
      }
      return {
        requirementId: req.id,
        kind: req.kind,
        coverage,
        evidenceId,
        rationale: aiCoverage.rationale,
      };
    });

    await job.updateProgress({ step: STEP_PERSIST, percent: 80 });
    // Calculate match score deterministically
    const matchScore = calculateMatchScore(
      validCoverages.map((c) => ({
        kind: c.kind as 'mandatory' | 'desirable',
        coverage: c.coverage,
      })),
    );

    // Persist requirement coverages
    if (validCoverages.length > 0) {
      await this.database.insert(requirementCoverages).values(
        validCoverages.map((c) => ({
          evaluationId,
          requirementId: c.requirementId,
          coverage: c.coverage,
          evidenceId: c.evidenceId,
          rationale: c.rationale,
        })),
      );
    }

    const claimed = await this.markReady(evaluationId, matchScore);
    if (!claimed) {
      this.logger.log('evaluation.skipped_missing', { evaluationId });
      return;
    }

    console.log('evaluation.completed', {
      evaluationId,
      matchScore,
      totalRequirements: requirementRows.length,
      coveredCount: validCoverages.filter((c) => c.coverage === 'covered').length,
      partialCount: validCoverages.filter((c) => c.coverage === 'partial').length,
      gapCount: validCoverages.filter((c) => c.coverage === 'gap').length,
    });

    this.logger.log('Evaluation completed', { evaluationId, matchScore });
  }

  private async handlePipelineError(
    job: Job<ProcessorJobData>,
    evaluationId: string,
    error: unknown,
  ): Promise<void> {
    const existing = await this.findEvaluationRow(evaluationId);
    if (existing === undefined) {
      this.logger.log('evaluation.skipped_missing', { evaluationId });
      return;
    }
    if (error instanceof AiKeyMissingError || error instanceof AiKeyRejectedError) {
      const claimed = await this.markFailed(evaluationId, 'ai_key_rejected');
      if (!claimed) {
        return;
      }
      this.logger.log('Evaluation failed', { evaluationId, failureReason: 'ai_key_rejected' });
      throw new UnrecoverableError('DeepSeek key rejected');
    }
    if (error instanceof AiBalanceExhaustedError) {
      const claimed = await this.markFailed(evaluationId, 'ai_balance_exhausted');
      if (!claimed) {
        return;
      }
      this.logger.log('Evaluation failed', { evaluationId, failureReason: 'ai_balance_exhausted' });
      throw new UnrecoverableError('DeepSeek balance exhausted');
    }
    if (this.isTransientError(error)) {
      if (this.isLastAttempt(job)) {
        const claimed = await this.markFailed(evaluationId, 'ai_unavailable');
        if (!claimed) {
          return;
        }
        this.logger.log('Evaluation failed', { evaluationId, failureReason: 'ai_unavailable' });
      } else {
        this.logger.error('Evaluation failed (transient, will retry)', { evaluationId });
      }
      throw error;
    }
    if (this.isLastAttempt(job)) {
      const claimed = await this.markFailed(evaluationId, null);
      if (!claimed) {
        return;
      }
      this.logger.log('Evaluation failed', { evaluationId, failureReason: null });
    } else {
      this.logger.error('Evaluation failed (infra, will retry)', { evaluationId });
    }
    throw error;
  }

  private async loadResumeEvidenceTexts(
    resumeId: string,
    careerProfileId: string,
  ): Promise<Array<{ id: string; statement: string }>> {
    const sectionIds = await this.loadResumeSectionIds(resumeId);
    if (sectionIds.length === 0) {
      return [];
    }
    const assumedTexts = await this.loadResumeAssumedTexts(sectionIds);
    const skillNames = await this.loadResumeSkillNames(sectionIds, careerProfileId);
    const statements = [...assumedTexts, ...skillNames].filter((text) => text.trim() !== '');
    return statements.map((statement) => ({ id: randomUUID(), statement }));
  }
  private async loadResumeSectionIds(resumeId: string): Promise<string[]> {
    const sections = await this.database
      .select({ id: resumeSections.id })
      .from(resumeSections)
      .where(eq(resumeSections.resumeId, resumeId));
    return sections.map((section) => section.id);
  }
  private async loadResumeAssumedTexts(sectionIds: readonly string[]): Promise<string[]> {
    const entries = await this.database
      .select({ id: resumeEntries.id })
      .from(resumeEntries)
      .where(inArray(resumeEntries.sectionId, [...sectionIds]));
    const entryIds = entries.map((entry) => entry.id);
    if (entryIds.length === 0) {
      return [];
    }
    const bullets = await this.database
      .select({ text: resumeBullets.text, status: resumeBullets.status })
      .from(resumeBullets)
      .where(inArray(resumeBullets.entryId, [...entryIds]));
    return bullets
      .filter((bullet) => bullet.status === 'assumed' && bullet.text.trim() !== '')
      .map((bullet) => bullet.text.trim());
  }
  private async loadResumeSkillNames(
    sectionIds: readonly string[],
    careerProfileId: string,
  ): Promise<string[]> {
    const sectionSkills = await this.database
      .select({ skillId: resumeSectionSkills.skillId })
      .from(resumeSectionSkills)
      .where(inArray(resumeSectionSkills.sectionId, [...sectionIds]));
    const skillIds = [...new Set(sectionSkills.map((row) => row.skillId))];
    const skillRows =
      skillIds.length === 0
        ? []
        : await this.database
            .select({ id: skills.id, name: skills.name })
            .from(skills)
            .where(inArray(skills.id, [...skillIds]));
    const proposals = await this.database
      .select()
      .from(resumeSkillProposals)
      .where(inArray(resumeSkillProposals.sectionId, [...sectionIds]));
    const names = this.resolveResumeSkillNames(skillRows, proposals);
    if (names.length !== 0) {
      return names;
    }
    return this.loadProfileSkillNames(careerProfileId);
  }
  private resolveResumeSkillNames(
    base: ReadonlyArray<{ id: string; name: string }>,
    proposals: ReadonlyArray<{
      kind: 'addition' | 'swap';
      name: string;
      replacesSkillId: string | null;
      status: 'pending' | 'accepted' | 'rejected';
    }>,
  ): string[] {
    const swaps = this.collectAcceptedSwaps(proposals);
    const names = base.map((skill) => swaps.get(skill.id) ?? skill.name);
    const additions = proposals
      .filter((proposal) => proposal.kind === 'addition' && proposal.status === 'accepted')
      .map((proposal) => proposal.name);
    const baseIds = new Set(base.map((skill) => skill.id));
    const orphans = [...swaps.entries()]
      .filter(([replacesId]) => !baseIds.has(replacesId))
      .map(([, name]) => name);
    return [...names, ...additions, ...orphans];
  }
  private collectAcceptedSwaps(
    proposals: ReadonlyArray<{
      kind: 'addition' | 'swap';
      name: string;
      replacesSkillId: string | null;
      status: 'pending' | 'accepted' | 'rejected';
    }>,
  ): Map<string, string> {
    const swaps = new Map<string, string>();
    for (const proposal of proposals) {
      if (proposal.kind !== 'swap' || proposal.status !== 'accepted') {
        continue;
      }
      if (proposal.replacesSkillId === null || swaps.has(proposal.replacesSkillId)) {
        continue;
      }
      swaps.set(proposal.replacesSkillId, proposal.name);
    }
    return swaps;
  }
  private async loadProfileSkillNames(careerProfileId: string): Promise<string[]> {
    const rows = await this.database
      .select({ name: skills.name })
      .from(skills)
      .where(eq(skills.careerProfileId, careerProfileId));
    return rows.map((row) => row.name);
  }

  private async findEvaluationRow(evaluationId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.database
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(eq(evaluations.id, evaluationId));
    return row;
  }

  private isTransientError(error: unknown): boolean {
    return error instanceof AiUnavailableError
      || error instanceof AiTimeoutError
      || error instanceof AiResponseInvalidError;
  }

  private isLastAttempt(job: Job<ProcessorJobData>): boolean {
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  }

  private async markFailed(
    evaluationId: string,
    failureReason: EvaluationFailureReason,
  ): Promise<boolean> {
    const updated = await this.database
      .update(evaluations)
      .set({
        status: 'failed',
        failureReason,
        updatedAt: new Date(),
      })
      .where(eq(evaluations.id, evaluationId))
      .returning({ id: evaluations.id });
    if (updated.length === 0) {
      this.logger.log('evaluation.skipped_missing', { evaluationId });
      return false;
    }
    return true;
  }

  private async markReady(evaluationId: string, matchScore: number): Promise<boolean> {
    const updated = await this.database
      .update(evaluations)
      .set({
        status: 'ready',
        matchScore,
        updatedAt: new Date(),
      })
      .where(eq(evaluations.id, evaluationId))
      .returning({ id: evaluations.id });
    return updated.length > 0;
  }
}
