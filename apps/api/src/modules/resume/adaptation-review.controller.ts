import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  type PipeTransform,
} from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import {
  adaptationReviewRequestSchema,
  adaptationReviewUndoRequestSchema,
  type AdaptationReviewRequest,
  type AdaptationReviewUndoRequest,
  type ResumeDocumentResponse,
} from 'schema/contracts/resume';
import { AdaptationReviewService } from './adaptation-review.service';
import { ResumeService } from './resume.service';

export class AdaptationReviewPipe implements PipeTransform<unknown, AdaptationReviewRequest> {
  transform(value: unknown): AdaptationReviewRequest {
    const result = adaptationReviewRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

export class AdaptationReviewUndoPipe implements PipeTransform<unknown, AdaptationReviewUndoRequest> {
  transform(value: unknown): AdaptationReviewUndoRequest {
    const result = adaptationReviewUndoRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller()
export class AdaptationReviewController {
  constructor(
    @Inject(AdaptationReviewService) private readonly reviews: AdaptationReviewService,
    @Inject(ResumeService) private readonly resumes: ResumeService,
  ) {}

  @Post('resumes/:resumeId/adaptation-review')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('resumeId') resumeId: string,
    @Body(new AdaptationReviewPipe()) body: AdaptationReviewRequest,
  ): Promise<ResumeDocumentResponse> {
    const decidedId = await this.reviews.decide({
      resumeId,
      userId: LOCAL_USER_ID,
      evidenceId: body.evidenceId,
      decision: body.decision,
    });
    return this.resumes.getResume(decidedId, LOCAL_USER_ID);
  }

  @Post('resumes/:resumeId/adaptation-review/undo')
  @HttpCode(HttpStatus.OK)
  async undo(
    @Param('resumeId') resumeId: string,
    @Body(new AdaptationReviewUndoPipe()) body: AdaptationReviewUndoRequest,
  ): Promise<ResumeDocumentResponse> {
    const restoredId = await this.reviews.undo({
      resumeId,
      userId: LOCAL_USER_ID,
      evidenceId: body.evidenceId,
    });
    return this.resumes.getResume(restoredId, LOCAL_USER_ID);
  }
}
