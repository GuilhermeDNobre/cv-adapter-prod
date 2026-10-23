import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { LOCAL_USER_ID } from 'schema/local-user';
import type {
  BaseResumeProposalResponse,
  ResumeImportDraft,
  ResumeImportResponse,
} from 'schema/contracts/resume-import';
import { CareerProfileService } from '../career-profile/career-profile.service';
import { BaseResumeProposalService } from '../resume/proposal/base-resume-proposal.service';
import { DraftService } from './draft.service';
import { UploadSourceDocumentPipe } from './dto/upload-source-document.dto';
import { ResumeImportService } from './resume-import.service';
import { BASE_RESUME_PROPOSAL_QUEUE, DEFAULT_JOB_OPTIONS } from '../../queue.module';

@Controller('resume-imports')
export class ResumeImportController {
  constructor(
    @Inject(ResumeImportService) private readonly resumeImportService: ResumeImportService,
    @Inject(DraftService) private readonly draftService: DraftService,
    @Inject(CareerProfileService) private readonly careerProfileService: CareerProfileService,
    @Inject(BaseResumeProposalService) private readonly proposalService: BaseResumeProposalService,
    @InjectQueue(BASE_RESUME_PROPOSAL_QUEUE) private readonly proposalQueue: Queue,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  uploadSourceDocument(
    @UploadedFile(new UploadSourceDocumentPipe()) file: { buffer: Buffer; originalName: string; mimeType: string },
  ): Promise<ResumeImportResponse> {
    return this.resumeImportService.uploadSourceDocument(LOCAL_USER_ID, file.buffer);
  }

  @Get(':resumeImportId')
  getResumeImport(
    @Param('resumeImportId') resumeImportId: string,
  ): Promise<ResumeImportResponse> {
    return this.resumeImportService.getResumeImport(resumeImportId, LOCAL_USER_ID);
  }

  @Put(':resumeImportId/draft')
  saveDraft(
    @Param('resumeImportId') resumeImportId: string,
    @Body() draft: ResumeImportDraft,
  ): Promise<ResumeImportResponse> {
    return this.draftService.saveDraft(resumeImportId, LOCAL_USER_ID, draft);
  }

  @Post(':resumeImportId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmResumeImport(
    @Param('resumeImportId') resumeImportId: string,
  ): Promise<ResumeImportResponse> {
    await this.careerProfileService.confirmResumeImport(resumeImportId, LOCAL_USER_ID);
    const response = await this.resumeImportService.getResumeImport(resumeImportId, LOCAL_USER_ID);
    await this.proposalService.markGenerating(response.id);
    await this.proposalQueue.add(
      'generate',
      { resumeImportId: response.id, userId: LOCAL_USER_ID },
      DEFAULT_JOB_OPTIONS,
    );
    console.log('base_resume.proposal.enqueued', { resumeImportId: response.id });
    return response;
  }

  @Get(':resumeImportId/base-resume-proposal')
  getBaseResumeProposal(
    @Param('resumeImportId') resumeImportId: string,
  ): Promise<BaseResumeProposalResponse> {
    return this.proposalService.getProposal(resumeImportId, LOCAL_USER_ID);
  }
}
