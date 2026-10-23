import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  type PipeTransform,
} from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import {
  createBaseResumeRequestSchema,
  createResumeSectionRequestSchema,
  updateResumeSettingsRequestSchema,
  updateResumeStructureRequestSchema,
  type CreateBaseResumeRequest,
  type CreateResumeSectionRequest,
  type ResumeDocumentResponse,
  type ResumeListResponse,
  type UpdateResumeSettingsRequest,
  type UpdateResumeStructureRequest,
} from 'schema/contracts/resume';
import { BaseResumeService } from './base-resume.service';
import { ResumeService } from './resume.service';

export class CreateBaseResumePipe implements PipeTransform<unknown, CreateBaseResumeRequest> {
  transform(value: unknown): CreateBaseResumeRequest {
    const result = createBaseResumeRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

export class UpdateResumeSettingsPipe implements PipeTransform<unknown, UpdateResumeSettingsRequest> {
  transform(value: unknown): UpdateResumeSettingsRequest {
    const result = updateResumeSettingsRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

export class UpdateResumeStructurePipe implements PipeTransform<unknown, UpdateResumeStructureRequest> {
  transform(value: unknown): UpdateResumeStructureRequest {
    const result = updateResumeStructureRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

export class CreateResumeSectionPipe implements PipeTransform<unknown, CreateResumeSectionRequest> {
  transform(value: unknown): CreateResumeSectionRequest {
    const result = createResumeSectionRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller()
export class BaseResumeController {
  constructor(
    @Inject(BaseResumeService) private readonly baseResumeService: BaseResumeService,
    @Inject(ResumeService) private readonly resumeService: ResumeService,
  ) {}

  @Post('base-resumes')
  @HttpCode(HttpStatus.ACCEPTED)
  createBaseResume(
    @Body(new CreateBaseResumePipe()) body: CreateBaseResumeRequest,
  ): Promise<{ id: string }> {
    return this.baseResumeService.createBaseResume(LOCAL_USER_ID, body);
  }

  @Get('resumes')
  listResumes(): Promise<ResumeListResponse> {
    return this.resumeService.listResumes(LOCAL_USER_ID);
  }

  @Get('resumes/:resumeId')
  getResume(@Param('resumeId') resumeId: string): Promise<ResumeDocumentResponse> {
    return this.resumeService.getResume(resumeId, LOCAL_USER_ID);
  }

  @Put('resumes/:resumeId/settings')
  @HttpCode(HttpStatus.OK)
  updateSettings(
    @Param('resumeId') resumeId: string,
    @Body(new UpdateResumeSettingsPipe()) body: UpdateResumeSettingsRequest,
  ): Promise<ResumeDocumentResponse> {
    return this.resumeService.updateSettings(resumeId, LOCAL_USER_ID, body);
  }

  @Put('resumes/:resumeId/structure')
  @HttpCode(HttpStatus.OK)
  updateStructure(
    @Param('resumeId') resumeId: string,
    @Body(new UpdateResumeStructurePipe()) body: UpdateResumeStructureRequest,
  ): Promise<ResumeDocumentResponse> {
    return this.resumeService.updateStructure(resumeId, LOCAL_USER_ID, body);
  }

  @Post('resumes/:resumeId/sections')
  @HttpCode(HttpStatus.CREATED)
  createSection(
    @Param('resumeId') resumeId: string,
    @Body(new CreateResumeSectionPipe()) body: CreateResumeSectionRequest,
  ): Promise<{ id: string }> {
    return this.resumeService.createSection(resumeId, LOCAL_USER_ID, body);
  }

  @Delete('resumes/:resumeId')
  @HttpCode(HttpStatus.OK)
  deleteResume(@Param('resumeId') resumeId: string): Promise<void> {
    return this.resumeService.deleteResume(resumeId, LOCAL_USER_ID);
  }
}
