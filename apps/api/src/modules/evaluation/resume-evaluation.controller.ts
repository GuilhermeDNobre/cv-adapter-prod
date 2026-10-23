import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import type {
  EvaluationResponse,
  ResumeReevaluationLatestResponse,
} from 'schema/contracts/evaluation';
import { EvaluationService } from './evaluation.service';

@Controller('resumes/:resumeId/evaluations')
export class ResumeEvaluationController {
  constructor(@Inject(EvaluationService) private readonly evaluations: EvaluationService) {}
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(@Param('resumeId') resumeId: string): Promise<EvaluationResponse> {
    return this.evaluations.createResumeEvaluation(LOCAL_USER_ID, resumeId);
  }
  @Get('latest')
  latest(@Param('resumeId') resumeId: string): Promise<ResumeReevaluationLatestResponse> {
    return this.evaluations.getLatestResumeEvaluation(LOCAL_USER_ID, resumeId);
  }
}
