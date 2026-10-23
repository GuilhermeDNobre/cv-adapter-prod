import { Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import { SkillProposalService } from './skill-proposal.service';
import { ResumeService } from './resume.service';

@Controller()
export class SkillProposalController {
  constructor(
    @Inject(SkillProposalService) private readonly proposals: SkillProposalService,
    @Inject(ResumeService) private readonly resumes: ResumeService,
  ) {}

  @Post('resumes/:resumeId/skill-proposals/:proposalId/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Param('resumeId') resumeId: string,
    @Param('proposalId') proposalId: string,
  ): Promise<ResumeDocumentResponse> {
    const decidedId = await this.proposals.accept({ resumeId, proposalId, userId: LOCAL_USER_ID });
    return this.resumes.getResume(decidedId, LOCAL_USER_ID);
  }

  @Post('resumes/:resumeId/skill-proposals/:proposalId/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('resumeId') resumeId: string,
    @Param('proposalId') proposalId: string,
  ): Promise<ResumeDocumentResponse> {
    const decidedId = await this.proposals.reject({ resumeId, proposalId, userId: LOCAL_USER_ID });
    return this.resumes.getResume(decidedId, LOCAL_USER_ID);
  }
}
