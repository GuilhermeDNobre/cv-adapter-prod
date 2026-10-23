import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import {
  careerProfiles,
  evidences,
  jobDescriptions,
  resumeBullets,
  resumeEntries,
  resumeSections,
  resumes,
  sectionComments,
} from 'schema';
import type { CreateTailoredResumeRequest } from 'schema/contracts/resume';
import { DATABASE, type Database } from '../database/database.provider';
import { DEFAULT_JOB_OPTIONS, RESUME_WRITING_QUEUE } from '../../queue.module';
import { DeniedRequirementService } from '../career-profile/denied-requirement.service';
import { buildTailoredCoverage, type TailoredCoverage } from './tailored-coverage';
import { buildTailoredName, deriveJobTitle } from './job-title';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class TailoredResumeService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @InjectQueue(RESUME_WRITING_QUEUE) private readonly writingQueue: Queue,
    @Inject(DeniedRequirementService) private readonly deniedService: DeniedRequirementService,
  ) {}

  async createTailoredResume(userId: string, input: CreateTailoredResumeRequest): Promise<{ id: string }> {
    const base = await this.loadBaseResume(userId, input.baseResumeId);
    if (base === undefined) {
      throw new NotFoundException('Base resume not found.');
    }
    const job = await this.loadJobDescription(input.jobDescriptionId);
    if (job === undefined) {
      throw new NotFoundException('Job description not found.');
    }
    const profileId = await this.loadCareerProfileId(userId);
    if (profileId === undefined) {
      throw new UnprocessableEntityException('You must have a Career Profile before creating a Tailored Resume.');
    }
    const language = input.language ?? resolveBaseLanguage(base.resume) ?? resolveJobLanguage(job.language);
    const resumeId = await this.insertTailoredDocument({
      userId,
      base,
      jobId: job.id,
      language,
      jobRawText: job.rawText,
    });
    await this.writingQueue.add('tailor', { resumeId, userId }, DEFAULT_JOB_OPTIONS);
    console.log('resume.enqueued', { resumeId, userId, kind: 'tailored' });
    return { id: resumeId };
  }

  async approveSuggestion(userId: string, bulletId: string): Promise<string> {
    const owned = await this.findOwnedBullet(userId, bulletId);
    if (owned === undefined) {
      throw new NotFoundException('Bullet not found.');
    }
    if (owned.bullet.status === 'assumed') {
      return owned.resumeId;
    }
    const profileId = await this.loadCareerProfileId(userId);
    if (profileId === undefined) {
      throw new UnprocessableEntityException('You must have a Career Profile.');
    }
    const [created] = await this.database
      .insert(evidences)
      .values({ careerProfileId: profileId, experienceId: null, statement: owned.bullet.text })
      .returning({ id: evidences.id });
    if (created === undefined) {
      throw new Error('Failed to create evidence');
    }
    await this.database
      .update(resumeBullets)
      .set({ evidenceId: created.id, status: 'assumed', suggestionQuestion: null, gapKind: null })
      .where(eq(resumeBullets.id, bulletId));
    console.log('resume.suggestion_approved', { resumeId: owned.resumeId, bulletId });
    return owned.resumeId;
  }

  async denySuggestion(userId: string, bulletId: string): Promise<string> {
    const owned = await this.findOwnedBullet(userId, bulletId);
    if (owned === undefined) {
      throw new NotFoundException('Bullet not found.');
    }
    if (owned.bullet.requirementId !== null) {
      const profileId = await this.loadCareerProfileId(userId);
      if (profileId !== undefined) {
        await this.deniedService.deny(profileId, owned.bullet.requirementId);
      }
    }
    await this.database.delete(resumeBullets).where(eq(resumeBullets.id, bulletId));
    console.log('resume.suggestion_denied', { resumeId: owned.resumeId, bulletId });
    return owned.resumeId;
  }

  async buildTailoredExtras(
    document: { readonly resume: typeof resumes.$inferSelect; readonly bullets: ReadonlyArray<typeof resumeBullets.$inferSelect> },
  ): Promise<TailoredCoverage> {
    return buildTailoredCoverage({ database: this.database, document });
  }

  private async loadBaseResume(userId: string, baseResumeId: string) {
    const [resume] = await this.database
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, baseResumeId), eq(resumes.userId, userId)));
    if (resume === undefined || resume.kind !== 'base') {
      return undefined;
    }
    const sections = await this.database.select().from(resumeSections).where(eq(resumeSections.resumeId, resume.id));
    const sectionIds = sections.map((section) => section.id);
    const entries = sectionIds.length === 0 ? [] : await this.database.select().from(resumeEntries).where(inArray(resumeEntries.sectionId, sectionIds));
    const comments = sectionIds.length === 0 ? [] : await this.database.select().from(sectionComments).where(inArray(sectionComments.sectionId, sectionIds));
    return { resume, sections, entries, comments };
  }

  private async loadJobDescription(jobDescriptionId: string) {
    const [row] = await this.database
      .select({ id: jobDescriptions.id, language: jobDescriptions.language, rawText: jobDescriptions.rawText })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, jobDescriptionId));
    return row;
  }

  private async loadCareerProfileId(userId: string): Promise<string | undefined> {
    const [row] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    return row?.id;
  }

  private async insertTailoredDocument(input: {
    readonly userId: string;
    readonly base: NonNullable<Awaited<ReturnType<TailoredResumeService['loadBaseResume']>>>;
    readonly jobId: string;
    readonly language: 'pt' | 'en';
    readonly jobRawText: string;
  }): Promise<string> {
    const jobTitle = deriveJobTitle(input.jobRawText);
    const tailoredName = buildTailoredName({ baseName: input.base.resume.name, jobTitle });
    return this.database.transaction(async (tx) => {
      const [resume] = await tx
        .insert(resumes)
        .values({
          userId: input.userId,
          kind: 'tailored',
          name: tailoredName,
          language: input.language,
          template: input.base.resume.template,
          lengthTarget: input.base.resume.lengthTarget,
          writingMethod: input.base.resume.writingMethod,
          tone: input.base.resume.tone,
          baseResumeId: input.base.resume.id,
          jobDescriptionId: input.jobId,
          generationStatus: 'generating',
          failureReason: null,
          adaptationPlan: null,
        })
        .returning({ id: resumes.id });
      if (resume === undefined) {
        throw new Error('Failed to create tailored resume');
      }
      const ordered = [...input.base.sections].sort((a, b) => a.ordinal - b.ordinal);
      for (let index = 0; index < ordered.length; index += 1) {
        const section = ordered[index]!;
        const [created] = await tx
          .insert(resumeSections)
          .values({ resumeId: resume.id, kind: section.kind, title: section.title, ordinal: index })
          .returning({ id: resumeSections.id });
        if (created === undefined) {
          throw new Error('Failed to create tailored section');
        }
        await this.copyStaticEntries({
          tx,
          baseEntries: input.base.entries,
          baseSectionId: section.id,
          newSectionId: created.id,
          kind: section.kind,
        });
        await this.copyOpenComments(tx, input.base.comments, section.id, created.id);
      }
      return resume.id;
    });
  }

  private async copyStaticEntries(input: {
    readonly tx: Transaction;
    readonly baseEntries: ReadonlyArray<typeof resumeEntries.$inferSelect>;
    readonly baseSectionId: string;
    readonly newSectionId: string;
    readonly kind: string;
  }): Promise<void> {
    if (input.kind !== 'custom' && input.kind !== 'education') {
      return;
    }
    const filtered = input.baseEntries.filter((entry) => entry.sectionId === input.baseSectionId);
    for (let index = 0; index < filtered.length; index += 1) {
      const source = filtered[index]!;
      await input.tx.insert(resumeEntries).values({
        sectionId: input.newSectionId,
        ordinal: index,
        experienceId: null,
        educationEntryId: input.kind === 'education' ? source.educationEntryId : null,
        heading: input.kind === 'custom' ? source.heading : null,
      });
    }
  }

  private async copyOpenComments(
    tx: Transaction,
    baseComments: ReadonlyArray<typeof sectionComments.$inferSelect>,
    baseSectionId: string,
    newSectionId: string,
  ): Promise<void> {
    const filtered = baseComments.filter((comment) => comment.sectionId === baseSectionId && comment.resolvedAt === null);
    for (const comment of filtered) {
      await tx.insert(sectionComments).values({ sectionId: newSectionId, text: comment.text });
    }
  }

  private async findOwnedBullet(userId: string, bulletId: string) {
    const [bullet] = await this.database.select().from(resumeBullets).where(eq(resumeBullets.id, bulletId));
    if (bullet === undefined) {
      return undefined;
    }
    const [entry] = await this.database.select().from(resumeEntries).where(eq(resumeEntries.id, bullet.entryId));
    if (entry === undefined) {
      return undefined;
    }
    const [section] = await this.database.select().from(resumeSections).where(eq(resumeSections.id, entry.sectionId));
    if (section === undefined) {
      return undefined;
    }
    const [resume] = await this.database
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, section.resumeId), eq(resumes.userId, userId)));
    if (resume === undefined) {
      return undefined;
    }
    return { bullet, resumeId: resume.id };
  }
}

function resolveBaseLanguage(base: { readonly language?: string }): 'pt' | 'en' | undefined {
  if (base.language === 'pt' || base.language === 'en') {
    return base.language;
  }
  return undefined;
}

function resolveJobLanguage(jobLanguage: string): 'pt' | 'en' {
  return jobLanguage.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}
