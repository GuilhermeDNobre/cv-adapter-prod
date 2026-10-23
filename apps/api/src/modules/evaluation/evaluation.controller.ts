import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  type PipeTransform,
} from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import {
  denyGapRequestSchema,
  type DenyGapRequest,
  type DenyGapResponse,
  type EvaluationResponse,
} from 'schema/contracts/evaluation';
import { EvaluationService } from './evaluation.service';
import { DeniedRequirementService } from '../career-profile/denied-requirement.service';

export class UndenyGapPipe implements PipeTransform<unknown, DenyGapRequest> {
  transform(value: unknown): DenyGapRequest {
    const result = denyGapRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller('evaluations')
export class EvaluationController {
  constructor(
    @Inject(EvaluationService) private readonly evaluationService: EvaluationService,
    @Inject(DeniedRequirementService)
    private readonly deniedRequirementService: DeniedRequirementService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  createEvaluation(
    @Body('jobDescriptionId') jobDescriptionId: string,
  ): Promise<EvaluationResponse> {
    return this.evaluationService.createEvaluation(LOCAL_USER_ID, jobDescriptionId);
  }

  @Get(':evaluationId')
  getEvaluation(
    @Param('evaluationId') evaluationId: string,
  ): Promise<EvaluationResponse> {
    return this.evaluationService.getEvaluation(evaluationId, LOCAL_USER_ID);
  }

  @Post(':evaluationId/deny-gap')
  @HttpCode(HttpStatus.OK)
  denyGap(
    @Param('evaluationId') evaluationId: string,
    @Body('requirementId') requirementId: string,
  ): Promise<DenyGapResponse> {
    return this.evaluationService.denyGap(evaluationId, requirementId, LOCAL_USER_ID);
  }

  @Post(':evaluationId/undeny-gap')
  @HttpCode(HttpStatus.OK)
  async undenyGap(
    @Param('evaluationId') evaluationId: string,
    @Body(new UndenyGapPipe()) body: DenyGapRequest,
  ): Promise<EvaluationResponse> {
    await this.deniedRequirementService.undenyGap({
      evaluationId,
      requirementId: body.requirementId,
    });
    console.log('evaluation.gap.undenied', {
      evaluationId,
      requirementId: body.requirementId,
    });
    return this.evaluationService.getEvaluation(evaluationId, LOCAL_USER_ID);
  }
}
