import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  createResumeSectionRequestSchema,
  resumeIdSchema,
  resumeListResponseSchema,
  updateResumeSettingsRequestSchema,
  updateResumeStructureRequestSchema,
  type CreateResumeSectionRequest,
  type ResumeDocumentResponse,
  type ResumeListResponse,
  type UpdateResumeSettingsRequest,
  type UpdateResumeStructureRequest,
} from 'schema/contracts/resume';
import { DEFAULT_JOB_OPTIONS, RESUME_WRITING_QUEUE } from '../../queue.module';
import { ResumeRepository } from './resume.repository';
import { mapResumeDocument } from './resume-document.mapper';
import { TailoredResumeService } from './tailored-resume.service';

@Injectable()
export class ResumeService {
  constructor(
    @Inject(ResumeRepository) private readonly repository: ResumeRepository,
    @Inject(TailoredResumeService) private readonly tailoredService: TailoredResumeService,
    @InjectQueue(RESUME_WRITING_QUEUE) private readonly writingQueue: Queue,
  ) {}

  async listResumes(userId: string): Promise<ResumeListResponse> {
    const rows = await this.repository.listByUser(userId);
    return resumeListResponseSchema.parse({
      resumes: rows.map((row) => ({
        id: row.resume.id,
        kind: row.resume.kind,
        name: row.resume.name,
        language: row.resume.language,
        template: row.resume.template,
        lengthTarget: row.resume.lengthTarget,
        writingMethod: row.resume.writingMethod,
        tone: row.resume.tone,
        baseResumeId: row.resume.baseResumeId,
        jobDescriptionId: row.resume.jobDescriptionId,
        jobTitle: row.jobTitle,
        generationStatus: row.resume.generationStatus,
        failureReason: row.resume.failureReason,
        createdAt: row.resume.createdAt.toISOString(),
        updatedAt: row.resume.updatedAt.toISOString(),
        exports: row.exports.map((item) => ({
          id: item.id,
          pageCount: item.pageCount,
          createdAt: item.createdAt.toISOString(),
        })),
      })),
    });
  }

  async getResume(resumeId: string, userId: string): Promise<ResumeDocumentResponse> {
    const document = await this.findOwnedDocument(resumeId, userId);
    const details = await this.repository.findDisplayDetails(userId);
    const base = mapResumeDocument({ document, details });
    if (document.resume.kind !== 'tailored' || document.resume.jobDescriptionId === null) {
      return base;
    }
    const extras = await this.tailoredService.buildTailoredExtras(document);
    return {
      ...base,
      languageFallback: extras.languageFallback,
      matchScore: extras.matchScore,
      requirementCoverages: [...extras.requirementCoverages],
      adaptationChanges: extras.adaptationChanges,
    };
  }

  async updateSettings(
    resumeId: string,
    userId: string,
    settings: UpdateResumeSettingsRequest,
  ): Promise<ResumeDocumentResponse> {
    const parsed = updateResumeSettingsRequestSchema.safeParse(settings);
    if (!parsed.success) {
      throw new NotFoundException('Resume not found.');
    }
    const current = await this.repository.findDocument(resumeId, userId);
    if (current === undefined) {
      throw new NotFoundException('Resume not found.');
    }
    const shouldRestyle = this.shouldRestyleDocument(current.resume, parsed.data);
    const settingsInput: Parameters<ResumeRepository['updateSettings']>[2] = {};
    if (parsed.data.name !== undefined) {
      settingsInput.name = parsed.data.name;
    }
    if (parsed.data.language !== undefined) {
      settingsInput.language = parsed.data.language;
    }
    if (parsed.data.template !== undefined) {
      settingsInput.template = parsed.data.template;
    }
    if (parsed.data.lengthTarget === 1 || parsed.data.lengthTarget === 2) {
      settingsInput.lengthTarget = parsed.data.lengthTarget;
    }
    if (parsed.data.writingMethod !== undefined) {
      settingsInput.writingMethod = parsed.data.writingMethod;
    }
    if (parsed.data.tone !== undefined) {
      settingsInput.tone = parsed.data.tone;
    }
    const claimed = await this.repository.updateSettings(resumeId, userId, settingsInput);
    if (!claimed) {
      throw new NotFoundException('Resume not found.');
    }
    if (shouldRestyle) {
      await this.repository.markGenerating(resumeId);
      await this.writingQueue.add('restyle', { resumeId, userId }, DEFAULT_JOB_OPTIONS);
      console.log('resume.restyle.enqueued', { resumeId, userId });
    }
    return this.getResume(resumeId, userId);
  }

  private shouldRestyleDocument(
    resume: { writingMethod: string; tone: string },
    settings: UpdateResumeSettingsRequest,
  ): boolean {
    if (settings.writingMethod !== undefined && settings.writingMethod !== resume.writingMethod) {
      return true;
    }
    return settings.tone !== undefined && settings.tone !== resume.tone;
  }

  async updateStructure(
    resumeId: string,
    userId: string,
    structure: UpdateResumeStructureRequest,
  ): Promise<ResumeDocumentResponse> {
    const parsed = updateResumeStructureRequestSchema.safeParse(structure);
    if (!parsed.success) {
      throw new NotFoundException('Resume not found.');
    }
    const claimed = await this.repository.updateStructure(resumeId, userId, parsed.data.sections);
    if (!claimed) {
      throw new NotFoundException('Resume not found.');
    }
    return this.getResume(resumeId, userId);
  }

  async createSection(
    resumeId: string,
    userId: string,
    input: CreateResumeSectionRequest,
  ): Promise<{ id: string }> {
    const parsed = createResumeSectionRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new NotFoundException('Resume not found.');
    }
    const sectionId = await this.repository.createSection(resumeId, userId, {
      kind: parsed.data.kind,
      title: parsed.data.title ?? null,
      ordinal: parsed.data.ordinal,
      items: parsed.data.items ?? [],
    });
    if (sectionId === undefined) {
      throw new NotFoundException('Resume not found.');
    }
    return { id: sectionId };
  }

  async deleteResume(resumeId: string, userId: string): Promise<void> {
    const parsedId = resumeIdSchema.safeParse(resumeId);
    if (!parsedId.success) {
      throw new NotFoundException('Resume not found.');
    }
    const claimed = await this.repository.deleteResume(parsedId.data, userId);
    if (!claimed) {
      throw new NotFoundException('Resume not found.');
    }
  }

  private async findOwnedDocument(resumeId: string, userId: string) {
    const parsedId = resumeIdSchema.safeParse(resumeId);
    if (!parsedId.success) {
      throw new NotFoundException('Resume not found.');
    }
    const document = await this.repository.findDocument(parsedId.data, userId);
    if (document === undefined) {
      throw new NotFoundException('Resume not found.');
    }
    return document;
  }
}
