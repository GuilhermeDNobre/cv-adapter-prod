import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, StreamableFile } from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import type { ExportResumeResponse } from 'schema/contracts/resume';
import { ResumeExportService } from './resume-export.service';

@Controller()
export class ResumeExportController {
  constructor(@Inject(ResumeExportService) private readonly exports: ResumeExportService) {}

  @Post('resumes/:resumeId/exports')
  @HttpCode(HttpStatus.CREATED)
  createExport(@Param('resumeId') resumeId: string): Promise<ExportResumeResponse> {
    return this.exports.exportResume(LOCAL_USER_ID, resumeId);
  }

  @Get('exports/:exportId/pdf')
  async downloadExport(@Param('exportId') exportId: string): Promise<StreamableFile> {
    const result = await this.exports.downloadExport(LOCAL_USER_ID, exportId);
    return new StreamableFile(result.pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${result.filename}"`,
    });
  }
}
