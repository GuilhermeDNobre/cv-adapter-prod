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
  createTailoredResumeRequestSchema,
  resumeBulletIdSchema,
  type CreateTailoredResumeRequest,
  type ResumeDocumentResponse,
} from 'schema/contracts/resume';
import { TailoredResumeService } from './tailored-resume.service';
import { ResumeService } from './resume.service';

export class CreateTailoredResumePipe implements PipeTransform<unknown, CreateTailoredResumeRequest> {
  transform(value: unknown): CreateTailoredResumeRequest {
    const result = createTailoredResumeRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller()
export class TailoredResumeController {
  constructor(
    @Inject(TailoredResumeService) private readonly tailoredService: TailoredResumeService,
    @Inject(ResumeService) private readonly resumes: ResumeService,
  ) {}

  @Post('tailored-resumes')
  @HttpCode(HttpStatus.ACCEPTED)
  createTailoredResume(@Body(new CreateTailoredResumePipe()) body: CreateTailoredResumeRequest): Promise<{ id: string }> {
    return this.tailoredService.createTailoredResume(LOCAL_USER_ID, body);
  }

  @Post('bullets/:bulletId/approve')
  @HttpCode(HttpStatus.OK)
  async approveSuggestion(@Param('bulletId') bulletId: string): Promise<ResumeDocumentResponse> {
    const parsed = resumeBulletIdSchema.safeParse(bulletId);
    if (!parsed.success) {
      throw new BadRequestException('Invalid bullet id.');
    }
    const resumeId = await this.tailoredService.approveSuggestion(LOCAL_USER_ID, parsed.data);
    return this.resumes.getResume(resumeId, LOCAL_USER_ID);
  }

  @Post('bullets/:bulletId/deny')
  @HttpCode(HttpStatus.OK)
  async denySuggestion(@Param('bulletId') bulletId: string): Promise<ResumeDocumentResponse> {
    const parsed = resumeBulletIdSchema.safeParse(bulletId);
    if (!parsed.success) {
      throw new BadRequestException('Invalid bullet id.');
    }
    const resumeId = await this.tailoredService.denySuggestion(LOCAL_USER_ID, parsed.data);
    return this.resumes.getResume(resumeId, LOCAL_USER_ID);
  }
}
