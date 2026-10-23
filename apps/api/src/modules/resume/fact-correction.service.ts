import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  resumeEvidenceIdSchema,
  resumeExperienceIdSchema,
  resumeIdSchema,
  type UpdateEvidenceRequest,
  type UpdateExperienceRequest,
} from 'schema/contracts/resume';
import { EvidenceCorrectionService } from '../career-profile/evidence-correction.service';
import { ResumeEditingRepository } from './resume-editing.repository';
import { ResumeReviewService } from './resume-review.service';

export interface CorrectEvidenceInput {
  readonly userId: string;
  readonly evidenceId: string;
  readonly resumeId: string;
  readonly correction: UpdateEvidenceRequest;
}

export interface CorrectExperienceInput {
  readonly userId: string;
  readonly experienceId: string;
  readonly resumeId: string;
  readonly correction: UpdateExperienceRequest;
}

@Injectable()
export class FactCorrectionService {
  constructor(
    @Inject(EvidenceCorrectionService) private readonly corrections: EvidenceCorrectionService,
    @Inject(ResumeReviewService) private readonly reviewMarker: ResumeReviewService,
    @Inject(ResumeEditingRepository) private readonly editing: ResumeEditingRepository,
  ) {}

  async correctEvidence(input: CorrectEvidenceInput): Promise<string> {
    const target = await this.requireOwnedResume(input.userId, input.resumeId);
    const parsedEvidence = resumeEvidenceIdSchema.safeParse(input.evidenceId);
    if (!parsedEvidence.success) {
      throw new NotFoundException('Evidence not found.');
    }
    await this.corrections.correctEvidence({ userId: input.userId, evidenceId: parsedEvidence.data, statement: input.correction.statement });
    await this.reviewMarker.markForEvidence({ userId: input.userId, evidenceId: parsedEvidence.data });
    return target;
  }

  async correctExperience(input: CorrectExperienceInput): Promise<string> {
    const target = await this.requireOwnedResume(input.userId, input.resumeId);
    const parsedExperience = resumeExperienceIdSchema.safeParse(input.experienceId);
    if (!parsedExperience.success) {
      throw new NotFoundException('Experience not found.');
    }
    await this.corrections.correctExperience({
      userId: input.userId,
      experienceId: parsedExperience.data,
      company: input.correction.company,
      role: input.correction.role,
      startedOn: input.correction.startedOn,
      endedOn: input.correction.endedOn,
    });
    await this.reviewMarker.markForExperience({ userId: input.userId, experienceId: parsedExperience.data });
    return target;
  }

  private async requireOwnedResume(userId: string, resumeId: string): Promise<string> {
    const parsed = resumeIdSchema.safeParse(resumeId);
    if (!parsed.success) {
      throw new BadRequestException('Invalid resume id.');
    }
    const owned = await this.editing.findOwnedResumeRow(userId, parsed.data);
    if (owned === undefined) {
      throw new NotFoundException('Resume not found.');
    }
    return owned.id;
  }
}
