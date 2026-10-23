import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  resumeBulletIdSchema,
  resumeSectionIdSchema,
  sectionCommentIdSchema,
  type CreateSectionCommentRequest,
  type UpdateBulletRequest,
} from 'schema/contracts/resume';
import { DEFAULT_JOB_OPTIONS, RESUME_WRITING_QUEUE } from '../../queue.module';
import { ResumeEditingRepository } from './resume-editing.repository';
import { ResumeService } from './resume.service';

@Injectable()
export class ResumeEditingService {
  constructor(
    @Inject(ResumeEditingRepository) private readonly editing: ResumeEditingRepository,
    @Inject(ResumeService) private readonly resumes: ResumeService,
    @InjectQueue(RESUME_WRITING_QUEUE) private readonly writingQueue: Queue,
  ) {}

  async updateBullet(userId: string, bulletId: string, input: UpdateBulletRequest) {
    const owned = await this.requireOwnedBullet(userId, bulletId);
    await this.editing.updateBulletText(owned.bullet.id, input.text);
    return this.resumes.getResume(owned.resumeId, userId);
  }

  async createSectionComment(userId: string, sectionId: string, input: CreateSectionCommentRequest) {
    const owned = await this.requireOwnedSection(userId, sectionId);
    await this.editing.createSectionComment(owned.section.id, input.text);
    return this.resumes.getResume(owned.resume.id, userId);
  }

  async resolveSectionComment(userId: string, commentId: string) {
    const parsedId = sectionCommentIdSchema.safeParse(commentId);
    if (!parsedId.success) {
      throw new NotFoundException('Comment not found.');
    }
    const resumeId = await this.editing.resolveSectionComment(userId, parsedId.data);
    if (resumeId === undefined) {
      throw new NotFoundException('Comment not found.');
    }
    return this.resumes.getResume(resumeId, userId);
  }

  async requestSectionRewrite(userId: string, sectionId: string, instruction: string) {
    const owned = await this.requireOwnedSection(userId, sectionId);
    const state = await this.editing.readSectionState(owned.section.id);
    await this.editing.writeUndoSnapshot(owned.section.id, state);
    await this.editing.markGenerating(owned.resume.id);
    await this.writingQueue.add(
      'rewrite-section',
      { resumeId: owned.resume.id, userId, sectionId: owned.section.id, instruction },
      DEFAULT_JOB_OPTIONS,
    );
    console.log('resume.rewrite.enqueued', { resumeId: owned.resume.id, sectionId: owned.section.id });
    return this.resumes.getResume(owned.resume.id, userId);
  }

  async undoSectionRewrite(userId: string, sectionId: string) {
    const owned = await this.requireOwnedSection(userId, sectionId);
    const snapshot = await this.editing.readUndoSnapshot(owned.section.id);
    if (snapshot === undefined) {
      throw new NotFoundException('Nothing to undo.');
    }
    await this.editing.restoreSectionState(owned.section.id, snapshot);
    return this.resumes.getResume(owned.resume.id, userId);
  }

  private async requireOwnedBullet(userId: string, bulletId: string) {
    const parsedId = resumeBulletIdSchema.safeParse(bulletId);
    if (!parsedId.success) {
      throw new NotFoundException('Bullet not found.');
    }
    const owned = await this.editing.findOwnedBullet(userId, parsedId.data);
    if (owned === undefined) {
      throw new NotFoundException('Bullet not found.');
    }
    return owned;
  }

  private async requireOwnedSection(userId: string, sectionId: string) {
    const parsedId = resumeSectionIdSchema.safeParse(sectionId);
    if (!parsedId.success) {
      throw new NotFoundException('Section not found.');
    }
    const owned = await this.editing.findOwnedSection(userId, parsedId.data);
    if (owned === undefined) {
      throw new NotFoundException('Section not found.');
    }
    return owned;
  }
}
