import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  careerProfiles,
  certifications,
  educationEntries,
  evidences,
  experiences,
  languages,
  resumeImports,
  skills,
} from 'schema';
import {
  baseResumeProposalRecordSchema,
  baseResumeProposalSchema,
  resumeImportIdSchema,
  type BaseResumeProposal,
  type BaseResumeProposalResponse,
  type WritingStyle,
} from 'schema/contracts/resume-import';
import { AI_CLIENT, type AiClient } from '../../ai/ai-client';
import { rewriteBulletsInStyleOutputSchema } from '../../ai/prompts/rewrite-bullets-in-style';
import { writeProfileSummaryOutputSchema } from '../../ai/prompts/write-profile-summary';
import { DATABASE, type Database } from '../../database/database.provider';
import {
  buildCertificationsSection,
  buildEducationSection,
  buildLanguagesSection,
  buildSkillsSection,
  buildSummarySection,
  buildUnlinkedCustomSection,
  collectRewriteTargets,
  collectUnlinkedEvidences,
  parseSectionOrder,
  parseSummaryText,
  parseWritingStyle,
  resolveProposalLanguage,
  resolveProposalName,
  type CareerBundle,
  type RewriteTarget,
} from './base-resume-proposal.builder';
import { resolveResumeStructure } from '../resume-structure';

type ImportRow = typeof resumeImports.$inferSelect;

@Injectable()
export class BaseResumeProposalService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(AI_CLIENT) private readonly aiClient: AiClient,
  ) {}

  async getProposal(resumeImportId: string, userId: string): Promise<BaseResumeProposalResponse> {
    const parsedId = resumeImportIdSchema.safeParse(resumeImportId);
    if (!parsedId.success) {
      throw new NotFoundException('Resume import not found.');
    }
    const [row] = await this.database
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, parsedId.data));
    if (row === undefined || row.userId !== userId) {
      throw new NotFoundException('Resume import not found.');
    }
    if (row.status !== 'confirmed') {
      throw new UnprocessableEntityException('Resume import is not confirmed.');
    }
    const parsed = baseResumeProposalRecordSchema.safeParse(row.baseResumeProposal);
    if (!parsed.success) {
      return { status: 'generating', proposal: null, failureReason: null };
    }
    return parsed.data;
  }

  async markGenerating(resumeImportId: string): Promise<void> {
    await this.database
      .update(resumeImports)
      .set({
        baseResumeProposal: { status: 'generating', proposal: null, failureReason: null },
        updatedAt: new Date(),
      })
      .where(eq(resumeImports.id, resumeImportId));
  }

  async buildAndStoreProposal(resumeImportId: string, userId: string): Promise<void> {
    const startedAt = Date.now();
    const row = await this.loadConfirmedRow(resumeImportId, userId);
    if (row === undefined) {
      return;
    }
    try {
      const proposal = await this.generateProposal(row);
      await this.storeReady(row.id, proposal, startedAt);
    } catch (error: unknown) {
      const failureReason = this.toFailureReason(error);
      await this.storeFailed(row.id, failureReason, startedAt);
    }
  }

  async generateProposal(row: ImportRow): Promise<BaseResumeProposal> {
    const style = parseWritingStyle(row.writingStyle);
    const career = await this.loadCareer(row.userId);
    const language = resolveProposalLanguage(career.evidenceRows);
    const name = resolveProposalName(career.experienceRows, language);
    const summaryText = parseSummaryText(row.draft, row.summary);
    const kinds = resolveResumeStructure({
      sectionOrder: parseSectionOrder(row.draft),
      hasSummary: summaryText !== null,
      hasExperience: career.experienceRows.length > 0,
      hasEducation: career.educationRows.length > 0,
      hasSkills: career.skillRows.length > 0,
      hasLanguages: career.languageRows.length > 0,
      hasCertifications: career.certificationRows.length > 0,
      hasCustom: collectUnlinkedEvidences(career).length > 0,
      experienceRows: career.experienceRows,
      educationRows: career.educationRows,
    });
    const sections = await this.buildSections({ career, style, kinds, language, summaryText });
    return baseResumeProposalSchema.parse({ name, language, style, sections });
  }

  private async loadConfirmedRow(
    resumeImportId: string,
    userId: string,
  ): Promise<ImportRow | undefined> {
    const [row] = await this.database
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, resumeImportId));
    if (row === undefined || row.userId !== userId || row.status !== 'confirmed') {
      return undefined;
    }
    return row;
  }

  private async loadCareer(userId: string): Promise<CareerBundle> {
    const [profile] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    if (profile === undefined) {
      throw new Error(`Career profile missing for user ${userId}`);
    }
    const [experienceRows, educationRows, evidenceRows, skillRows, languageRows, certificationRows] =
      await Promise.all([
        this.database.select().from(experiences).where(eq(experiences.careerProfileId, profile.id)),
        this.database
          .select()
          .from(educationEntries)
          .where(eq(educationEntries.careerProfileId, profile.id)),
        this.database.select().from(evidences).where(eq(evidences.careerProfileId, profile.id)),
        this.database.select().from(skills).where(eq(skills.careerProfileId, profile.id)),
        this.database.select().from(languages).where(eq(languages.careerProfileId, profile.id)),
        this.database
          .select()
          .from(certifications)
          .where(eq(certifications.careerProfileId, profile.id)),
      ]);
    return {
      profileId: profile.id,
      experienceRows,
      educationRows,
      evidenceRows,
      skillRows,
      languageRows,
      certificationRows,
    };
  }

  private async buildSections(input: {
    readonly career: CareerBundle;
    readonly style: WritingStyle;
    readonly kinds: readonly string[];
    readonly language: 'pt' | 'en';
    readonly summaryText: string | null;
  }): Promise<BaseResumeProposal['sections']> {
    const sections: BaseResumeProposal['sections'] = [];
    for (const kind of input.kinds) {
      if (kind === 'summary') {
        const section = await this.buildSummarySection({
          summaryText: input.summaryText,
          career: input.career,
          language: input.language,
          tone: input.style.tone,
        });
        if (section !== undefined) {
          sections.push(section);
        }
      } else if (kind === 'experience') {
        const section = await this.buildExperienceSection(input.career, input.style);
        if (section !== undefined) {
          sections.push(section);
        }
      } else if (kind === 'education') {
        const section = buildEducationSection(input.career);
        if (section !== undefined) {
          sections.push(section);
        }
      } else if (kind === 'skills') {
        const section = buildSkillsSection(input.career);
        if (section !== undefined) {
          sections.push(section);
        }
      } else if (kind === 'languages') {
        const section = buildLanguagesSection(input.career);
        if (section !== undefined) {
          sections.push(section);
        }
      } else if (kind === 'certifications') {
        const section = buildCertificationsSection(input.career);
        if (section !== undefined) {
          sections.push(section);
        }
      } else if (kind === 'custom') {
        const section = await this.buildUnlinkedSection(input.career, input.style, input.language);
        if (section !== undefined) {
          sections.push(section);
        }
      }
    }
    return sections;
  }

  private async buildSummarySection(input: {
    readonly summaryText: string | null;
    readonly career: CareerBundle;
    readonly language: 'pt' | 'en';
    readonly tone: WritingStyle['tone'];
  }): Promise<BaseResumeProposal['sections'][number] | undefined> {
    const summaryText = input.summaryText;
    if (summaryText === null) {
      return undefined;
    }
    const base = buildSummarySection(summaryText);
    const [entry] = base.entries;
    const [bullet] = entry?.bullets ?? [];
    if (bullet === undefined) {
      return undefined;
    }
    try {
      const output = await this.aiClient.complete({
        promptName: 'write-profile-summary',
        payload: {
          originalSummary: summaryText,
          positions: input.career.experienceRows.map((row) => ({
            role: row.role,
            company: row.company,
            startedOn: row.startedOn,
            endedOn: row.endedOn,
          })),
          education: input.career.educationRows.map((row) => ({
            institution: row.institution,
            degree: row.degree,
            startedOn: row.startedOn,
            endedOn: row.endedOn,
          })),
          skills: input.career.skillRows.map((row) => ({ name: row.name, group: row.group })),
          language: input.language,
          tone: input.tone,
          jobTitle: null,
          requirements: [],
          softRequirements: [],
        },
        outputSchema: writeProfileSummaryOutputSchema,
      });
      const [first] = output.bullets;
      const text = first?.text ?? summaryText;
      return {
        kind: 'summary',
        title: null,
        entries: [
          {
            bullets: [{ evidenceId: null, original: summaryText, text }],
          },
        ],
      };
    } catch {
      return base;
    }
  }

  private async buildUnlinkedSection(
    career: CareerBundle,
    style: WritingStyle,
    language: 'pt' | 'en',
  ): Promise<BaseResumeProposal['sections'][number] | undefined> {
    const unlinked = collectUnlinkedEvidences(career);
    if (unlinked.length === 0) {
      return undefined;
    }
    try {
      const output = await this.aiClient.complete({
        promptName: 'rewrite-bullets-in-style',
        payload: {
          evidences: unlinked.map((evidence) => ({
            id: evidence.id,
            statement: evidence.statement,
            company: null,
            role: null,
          })),
          writingMethod: style.writingMethod,
          tone: style.tone,
          averageBulletWords: style.averageBulletWords,
        },
        outputSchema: rewriteBulletsInStyleOutputSchema,
      });
      const rewrittenById = new Map(output.bullets.map((bullet) => [bullet.evidenceId, bullet.text]));
      return buildUnlinkedCustomSection(unlinked, language, rewrittenById);
    } catch {
      return buildUnlinkedCustomSection(unlinked, language);
    }
  }

  private async buildExperienceSection(
    career: CareerBundle,
    style: WritingStyle,
  ): Promise<BaseResumeProposal['sections'][number] | undefined> {
    const targets = collectRewriteTargets(career);
    if (targets.length === 0) {
      return undefined;
    }
    const entries: BaseResumeProposal['sections'][number]['entries'] = [];
    for (const target of targets) {
      entries.push(await this.rewriteTarget(target, style));
    }
    return { kind: 'experience', title: null, entries };
  }

  private async rewriteTarget(
    target: RewriteTarget,
    style: WritingStyle,
  ): Promise<BaseResumeProposal['sections'][number]['entries'][number]> {
    if (target.evidences.length === 0) {
      return { experienceId: target.experienceId, bullets: [] };
    }
    try {
      const output = await this.aiClient.complete({
        promptName: 'rewrite-bullets-in-style',
        payload: {
          evidences: target.evidences.map((evidence) => ({
            id: evidence.id,
            statement: evidence.statement,
            company: target.company,
            role: target.role,
          })),
          writingMethod: style.writingMethod,
          tone: style.tone,
          averageBulletWords: style.averageBulletWords,
        },
        outputSchema: rewriteBulletsInStyleOutputSchema,
      });
      const rewrittenById = new Map(output.bullets.map((bullet) => [bullet.evidenceId, bullet.text]));
      const bullets = target.evidences.map((evidence) => ({
        evidenceId: evidence.id,
        original: evidence.statement,
        text: rewrittenById.get(evidence.id) ?? evidence.statement,
      }));
      return { experienceId: target.experienceId, bullets };
    } catch (error: unknown) {
      console.error('base_resume.proposal.rewrite_failed', {
        experienceId: target.experienceId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      const bullets = target.evidences.map((evidence) => ({
        evidenceId: evidence.id,
        original: evidence.statement,
        text: evidence.statement,
      }));
      return { experienceId: target.experienceId, bullets, rewriteFailed: true };
    }
  }

  private async storeReady(resumeImportId: string, proposal: BaseResumeProposal, startedAt: number): Promise<void> {
    await this.database
      .update(resumeImports)
      .set({
        baseResumeProposal: { status: 'ready', proposal, failureReason: null },
        updatedAt: new Date(),
      })
      .where(eq(resumeImports.id, resumeImportId));
    console.log('base_resume.proposal.completed', {
      resumeImportId,
      sectionCount: proposal.sections.length,
      durationMs: Date.now() - startedAt,
    });
  }

  private async storeFailed(resumeImportId: string, failureReason: string, startedAt: number): Promise<void> {
    await this.database
      .update(resumeImports)
      .set({
        baseResumeProposal: { status: 'failed', proposal: null, failureReason },
        updatedAt: new Date(),
      })
      .where(eq(resumeImports.id, resumeImportId));
    console.error('base_resume.proposal.failed', {
      resumeImportId,
      durationMs: Date.now() - startedAt,
      failureReason,
    });
  }

  private toFailureReason(error: unknown): string {
    if (error instanceof Error && error.message.includes('Career profile missing')) {
      return 'career_profile_missing';
    }
    return 'generation_failed';
  }
}
