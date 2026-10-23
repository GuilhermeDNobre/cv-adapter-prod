import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import { careerProfiles, educationEntries, evidences, experiences, resumes, skills } from 'schema';
import { AI_CLIENT, type AiClient } from '../../ai/ai-client';
import { writeSectionOutputSchema, type SectionWritingInput } from '../../ai/prompts/write-section';
import { DATABASE, type Database } from '../../database/database.provider';
import { RESUME_WRITING_QUEUE } from '../../../queue.module';
import { ResumeRepository, type BulletUpdate } from '../resume.repository';
import {
  BulletClaimReview,
  type CareerContext,
  type SectionSelection,
} from './bullet-claim-review';
import {
  WritingFailurePolicy,
  type PipelineErrorInput,
  type ReportFailureInput,
  type WritingFailureReason,
} from './writing-failure-policy';
import { runTailorPipeline } from './tailored-pipeline';
import { runRewriteSectionPipeline } from './rewrite-section.pipeline';
import { runRestylePipeline } from './restyle.pipeline';
import { orderProfileSkills, synthesizeSections } from './section-synthesizer';

interface WritingJobData {
  readonly resumeId: string;
  readonly sectionId?: string;
  readonly userId: string;
  readonly instruction?: string;
}

interface WriteSectionsInput {
  readonly resumeId: string;
  readonly document: NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>;
  readonly writable: readonly SectionSelection[];
  readonly career: CareerContext;
  readonly allStatements: readonly string[];
}

interface WriteSingleSectionInput {
  readonly resumeId: string;
  readonly resume: { writingMethod: string; tone: string; language: string };
  readonly section: SectionSelection;
  readonly document: NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>;
  readonly career: CareerContext;
  readonly allStatements: readonly string[];
}

interface NamedJobDeps {
  readonly database: Database;
  readonly aiClient: AiClient;
  readonly repository: ResumeRepository;
  readonly logger: Logger;
}

interface NamedJobInput {
  readonly deps: NamedJobDeps;
  readonly job: Job<WritingJobData>;
  readonly resumeId: string;
  readonly userId: string;
  readonly startedAt: number;
}

async function runNamedWritingJob(input: NamedJobInput): Promise<boolean> {
  const { deps, job, resumeId, userId, startedAt } = input;
  if (job.name === 'tailor') {
    await runTailorPipeline(
      { database: deps.database, aiClient: deps.aiClient, repository: deps.repository },
      { resumeId, userId, startedAt },
    );
    return true;
  }
  if (job.name === 'rewrite-section') {
    const sectionId = job.data.sectionId;
    if (sectionId === undefined) {
      deps.logger.log('resume.skipped_missing', { resumeId });
    } else {
      await runRewriteSectionPipeline(
        { database: deps.database, aiClient: deps.aiClient, repository: deps.repository },
        { resumeId, userId, sectionId, instruction: job.data.instruction ?? '', startedAt },
      );
    }
    return true;
  }
  if (job.name === 'restyle') {
    await runRestylePipeline(
      { database: deps.database, aiClient: deps.aiClient, repository: deps.repository },
      { resumeId, userId, startedAt },
    );
    return true;
  }
  return false;
}

function collectDocumentSections(
  document: NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>,
): SectionSelection[] {
  type BulletRow = (typeof document.bullets)[number];
  type EntryRow = (typeof document.entries)[number];
  const bulletsByEntry = new Map<string, BulletRow[]>();
  for (const bullet of document.bullets) {
    const existing = bulletsByEntry.get(bullet.entryId) ?? [];
    existing.push(bullet);
    bulletsByEntry.set(bullet.entryId, existing);
  }
  const entriesBySection = new Map<string, EntryRow[]>();
  for (const entry of document.entries) {
    const existing = entriesBySection.get(entry.sectionId) ?? [];
    existing.push(entry);
    entriesBySection.set(entry.sectionId, existing);
  }
  return document.sections.map((section: (typeof document.sections)[number]) => {
    const sectionEntries = entriesBySection.get(section.id) ?? [];
    const bullets: Array<{ bulletId: string; evidenceId: string; currentText: string }> = [];
    for (const entry of sectionEntries) {
      for (const bullet of bulletsByEntry.get(entry.id) ?? []) {
        if (bullet.evidenceId !== null) {
          bullets.push({ bulletId: bullet.id, evidenceId: bullet.evidenceId, currentText: bullet.text });
        }
      }
    }
    return { sectionId: section.id, kind: section.kind, ordinal: section.ordinal, bullets };
  });
}

function isWritableDocumentSection(section: SectionSelection): boolean {
  if (section.kind !== 'experience' && section.kind !== 'education') {
    return false;
  }
  return section.bullets.length > 0;
}

function collectDocumentStatements(
  document: NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>,
  evidenceById: Map<string, typeof evidences.$inferSelect>,
): string[] {
  const statements: string[] = [];
  for (const bullet of document.bullets) {
    if (bullet.evidenceId === null) {
      continue;
    }
    const evidence = evidenceById.get(bullet.evidenceId);
    if (evidence !== undefined) {
      statements.push(evidence.statement);
    }
  }
  return statements;
}

function buildSectionWritingInput(
  resume: { writingMethod: string; tone: string; language: string },
  section: SectionSelection,
  career: CareerContext,
): SectionWritingInput {
  return {
    evidences: section.bullets.map((bullet) => {
      const evidence = career.evidenceById.get(bullet.evidenceId);
      const experience =
        evidence?.experienceId === null || evidence?.experienceId === undefined
          ? undefined
          : career.experienceById.get(evidence.experienceId);
      return {
        id: bullet.evidenceId,
        statement: evidence?.statement ?? '',
        company: experience?.company ?? null,
        role: experience?.role ?? null,
      };
    }),
    sectionKind: section.kind as SectionWritingInput['sectionKind'],
    writingMethod: resume.writingMethod as SectionWritingInput['writingMethod'],
    tone: resume.tone as SectionWritingInput['tone'],
    language: resume.language as SectionWritingInput['language'],
    openComments: [],
  };
}

@Injectable()
@Processor(RESUME_WRITING_QUEUE)
export class ResumeWritingProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeWritingProcessor.name);
  private readonly claimReview = new BulletClaimReview();
  private readonly failurePolicy = new WritingFailurePolicy();

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(AI_CLIENT) private readonly aiClient: AiClient,
    @Inject(ResumeRepository) private readonly repository: ResumeRepository,
  ) {
    super();
  }

  async process(job: Job<WritingJobData>): Promise<void> {
    const { resumeId } = job.data;
    const startedAt = Date.now();
    const existing = await this.repository.findResumeRow(resumeId);
    if (existing === undefined) {
      this.logger.log('resume.skipped_missing', { resumeId });
      return;
    }
    try {
      const handled = await runNamedWritingJob({
        deps: {
          database: this.database,
          aiClient: this.aiClient,
          repository: this.repository,
          logger: this.logger,
        },
        job,
        resumeId,
        userId: job.data.userId,
        startedAt,
      });
      if (handled) {
        return;
      }
      await this.executePipeline(job, resumeId, startedAt);
    } catch (error) {
      await this.handlePipelineError({ job, resumeId, startedAt, error });
    }
  }

  private async executePipeline(job: Job<WritingJobData>, resumeId: string, startedAt: number): Promise<void> {
    const { userId } = job.data;
    console.log('resume.generation.started', { resumeId, kind: 'base', durationMs: 0, failureReason: null });
    const document = await this.repository.findDocument(resumeId, userId);
    if (document === undefined) {
      this.logger.log('resume.skipped_missing', { resumeId });
      return;
    }
    const career = await this.loadCareerData(userId);
    if (career === undefined) {
      await this.markFailedOrSkip(resumeId, startedAt, null);
      throw new Error(`Career profile missing for resume ${resumeId}`);
    }
    const selections = collectDocumentSections(document);
    const writable = selections.filter((section) => isWritableDocumentSection(section));
    const allStatements = collectDocumentStatements(document, career.evidenceById);
    const synthesisTargets = selections
      .filter((section) => section.kind === 'summary')
      .map((section) => ({ sectionId: section.sectionId, kind: 'summary' as const }));
    const positions = [...career.experienceById.values()].map((row) => ({
      role: row.role,
      company: row.company,
      startedOn: row.startedOn,
      endedOn: row.endedOn,
    }));
    const schooling = [...career.educationById.values()].map((row) => ({
      institution: row.institution,
      degree: row.degree,
      startedOn: row.startedOn,
      endedOn: row.endedOn,
    }));
    const profileSkills = orderProfileSkills(
      (career.skills ?? [])
        .filter((skill) => skill.id !== undefined && skill.createdAt !== undefined)
        .map((skill) => ({
          id: skill.id as string,
          name: skill.name,
          group: skill.group,
          ordinal: (skill as { ordinal?: number }).ordinal ?? 0,
          createdAt: skill.createdAt as Date,
        })),
    );
    const skillReplacements = selections
      .filter((section) => section.kind === 'skills')
      .map((section) => ({ sectionId: section.sectionId, skillIds: profileSkills.map((skill) => skill.id) }));
    const [synthesized, updates] = await Promise.all([
      synthesizeSections(
        { aiClient: this.aiClient },
        {
          sections: synthesisTargets,
          originalSummary: null,
          positions,
          education: schooling,
          skills: profileSkills.map((skill) => ({ name: skill.name, group: skill.group })),
          tone: document.resume.tone,
          language: document.resume.language,
        },
      ),
      this.writeSectionsInParallel({ resumeId, document, writable, career, allStatements }),
    ]);
    const synthesis = synthesized.map((item) => ({
      sectionId: item.sectionId,
      bullets: item.texts.map((text) => ({ text, editedByPerson: false })),
    }));
    const claimed = await this.repository.replaceSynthesisAndMarkReady({
      resumeId,
      synthesis,
      updates,
      skills: skillReplacements,
    });
    if (!claimed) {
      this.logger.log('resume.skipped_missing', { resumeId });
      return;
    }
    console.log('resume.generation.completed', { resumeId, kind: 'base', durationMs: Date.now() - startedAt, failureReason: null });
    this.logger.log('Base resume ready', { resumeId });
  }

  private async loadCareerData(userId: string): Promise<CareerContext | undefined> {
    const [profile] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    if (profile === undefined) {
      return undefined;
    }
    const evidenceRows = await this.database
      .select()
      .from(evidences)
      .where(eq(evidences.careerProfileId, profile.id));
    const experienceRows = await this.database
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, profile.id));
    const educationRows = await this.database
      .select()
      .from(educationEntries)
      .where(eq(educationEntries.careerProfileId, profile.id));
    const skillRows = await this.database
      .select()
      .from(skills)
      .where(eq(skills.careerProfileId, profile.id));
    return {
      evidenceById: new Map(
        evidenceRows.map((row: typeof evidences.$inferSelect) => [row.id, row] as const),
      ),
      experienceById: new Map(
        experienceRows.map((row: typeof experiences.$inferSelect) => [row.id, row] as const),
      ),
      educationById: new Map(
        educationRows.map((row: typeof educationEntries.$inferSelect) => [row.id, row] as const),
      ),
      skills: skillRows.map((row) => ({
        name: row.name,
        group: row.group,
        id: row.id,
        ordinal: row.ordinal,
        createdAt: row.createdAt,
      })),
    };
  }

  private async writeSectionsInParallel(input: WriteSectionsInput): Promise<BulletUpdate[]> {
    const resume = input.document.resume;
    const results = await Promise.all(
      input.writable.map((section) =>
        this.writeSingleSection({
          resumeId: input.resumeId,
          resume,
          section,
          document: input.document,
          career: input.career,
          allStatements: input.allStatements,
        }),
      ),
    );
    return results.flat();
  }

  private async writeSingleSection(input: WriteSingleSectionInput): Promise<BulletUpdate[]> {
    const writingInput = buildSectionWritingInput(input.resume, input.section, input.career);
    const output = await this.aiClient.complete({
      promptName: 'write-section',
      payload: { ...writingInput },
      outputSchema: writeSectionOutputSchema,
    });
    return this.claimReview.reviewClaims({
      resumeId: input.resumeId,
      language: input.resume.language,
      section: input.section,
      document: input.document,
      career: input.career,
      allStatements: input.allStatements,
      aiBullets: output.bullets,
    });
  }

  private async handlePipelineError(input: PipelineErrorInput): Promise<void> {
    const existing = await this.repository.findResumeRow(input.resumeId);
    if (existing === undefined) {
      this.logger.log('resume.skipped_missing', { resumeId: input.resumeId });
      return;
    }
    const decision = this.failurePolicy.decide({
      error: input.error,
      isLastAttempt: this.failurePolicy.isLastAttempt({
        attemptsMade: input.job.attemptsMade,
        attempts: input.job.opts.attempts,
      }),
    });
    if (!decision.shouldMark) {
      this.logRetryable(decision.kind, input.resumeId);
      throw input.error;
    }
    const claimed = await this.reportFailure({
      resumeId: input.resumeId,
      startedAt: input.startedAt,
      failureReason: decision.failureReason,
      kind: input.job.name === 'tailor' ? 'tailored' : 'base',
    });
    if (!claimed) {
      return;
    }
    if (decision.unrecoverable) {
      throw new UnrecoverableError(this.unrecoverableMessage(decision.kind));
    }
    throw input.error;
  }

  private logRetryable(kind: string, resumeId: string): void {
    if (kind === 'transient-retry') {
      this.logger.error('Resume generation failed (transient, will retry)', { resumeId });
      return;
    }
    this.logger.error('Resume generation failed (infra, will retry)', { resumeId });
  }

  private unrecoverableMessage(kind: string): string {
    if (kind === 'balance') {
      return 'DeepSeek balance exhausted';
    }
    return 'DeepSeek key rejected';
  }

  private async reportFailure(input: ReportFailureInput): Promise<boolean> {
    const claimed = await this.repository.markFailed(input.resumeId, input.failureReason);
    if (!claimed) {
      return false;
    }
    await this.clearGenerationStep(input.resumeId);
    console.log('resume.generation.failed', {
      resumeId: input.resumeId,
      kind: input.kind,
      durationMs: Date.now() - input.startedAt,
      failureReason: input.failureReason,
    });
    return true;
  }

  private async clearGenerationStep(resumeId: string): Promise<void> {
    await this.database.update(resumes).set({ generationStep: null, updatedAt: new Date() }).where(eq(resumes.id, resumeId));
  }

  private async markFailedOrSkip(resumeId: string, startedAt: number, reason: WritingFailureReason): Promise<void> {
    const claimed = await this.repository.markFailed(resumeId, reason);
    if (!claimed) {
      this.logger.log('resume.skipped_missing', { resumeId });
      return;
    }
    console.log('resume.generation.failed', {
      resumeId,
      kind: 'base',
      durationMs: Date.now() - startedAt,
      failureReason: reason,
    });
  }
}
