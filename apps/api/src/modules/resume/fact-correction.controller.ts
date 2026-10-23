import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
  type PipeTransform,
} from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import {
  updateEvidenceRequestSchema,
  updateExperienceRequestSchema,
  type ResumeDocumentResponse,
  type UpdateEvidenceRequest,
  type UpdateExperienceRequest,
} from 'schema/contracts/resume';
import { FactCorrectionService } from './fact-correction.service';
import { ResumeService } from './resume.service';

export class UpdateEvidencePipe implements PipeTransform<unknown, UpdateEvidenceRequest> {
  transform(value: unknown): UpdateEvidenceRequest {
    const result = updateEvidenceRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

export class UpdateExperiencePipe implements PipeTransform<unknown, UpdateExperienceRequest> {
  transform(value: unknown): UpdateExperienceRequest {
    const result = updateExperienceRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller()
export class FactCorrectionController {
  constructor(
    @Inject(FactCorrectionService) private readonly corrections: FactCorrectionService,
    @Inject(ResumeService) private readonly resumes: ResumeService,
  ) {}

  @Put('evidences/:evidenceId')
  @HttpCode(HttpStatus.OK)
  async correctEvidence(
    @Param('evidenceId') evidenceId: string,
    @Query('resumeId') resumeId: string | undefined,
    @Body(new UpdateEvidencePipe()) body: UpdateEvidenceRequest,
  ): Promise<ResumeDocumentResponse> {
    const resume = await this.corrections.correctEvidence({
      userId: LOCAL_USER_ID,
      evidenceId,
      resumeId: this.requireResumeId(resumeId),
      correction: body,
    });
    return this.resumes.getResume(resume, LOCAL_USER_ID);
  }

  @Put('experiences/:experienceId')
  @HttpCode(HttpStatus.OK)
  async correctExperience(
    @Param('experienceId') experienceId: string,
    @Query('resumeId') resumeId: string | undefined,
    @Body(new UpdateExperiencePipe()) body: UpdateExperienceRequest,
  ): Promise<ResumeDocumentResponse> {
    const resume = await this.corrections.correctExperience({
      userId: LOCAL_USER_ID,
      experienceId,
      resumeId: this.requireResumeId(resumeId),
      correction: body,
    });
    return this.resumes.getResume(resume, LOCAL_USER_ID);
  }

  private requireResumeId(resumeId: string | undefined): string {
    if (resumeId === undefined || resumeId.trim() === '') {
      throw new BadRequestException('The resumeId query is required.');
    }
    return resumeId;
  }
}
