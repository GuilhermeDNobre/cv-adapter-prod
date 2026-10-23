import { Controller, Get, Inject, Param } from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import type { EvaluationResponse } from 'schema/contracts/evaluation';
import { EvaluationService } from './evaluation.service';

@Controller('job-descriptions')
export class JobDescriptionEvaluationController {
  constructor(
    @Inject(EvaluationService) private readonly evaluationService: EvaluationService,
  ) {}

  @Get(':jobDescriptionId/evaluation')
  getEvaluationByJobDescription(
    @Param('jobDescriptionId') jobDescriptionId: string,
  ): Promise<EvaluationResponse> {
    return this.evaluationService.getEvaluationByJobDescription(
      jobDescriptionId,
      LOCAL_USER_ID,
    );
  }
}
