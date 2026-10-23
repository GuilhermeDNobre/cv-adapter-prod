import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { JobDescriptionEvaluationController } from './job-description-evaluation.controller';
import type { EvaluationService } from './evaluation.service';

const JOB_DESCRIPTION_ID = '11111111-2222-4333-8444-555555555555';
const EVALUATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function readyEvaluation() {
  return {
    id: EVALUATION_ID,
    status: 'ready',
    matchScore: 70,
    failureReason: null,
    requirementCoverages: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('JobDescriptionEvaluationController', () => {
  it('should return the latest evaluation of the job description', async () => {
    const evaluationService = {
      getEvaluationByJobDescription: vi.fn().mockResolvedValue(readyEvaluation()),
    } as unknown as EvaluationService;
    const controller = new JobDescriptionEvaluationController(evaluationService);

    const result = await controller.getEvaluationByJobDescription(JOB_DESCRIPTION_ID);

    expect(result.id).toBe(EVALUATION_ID);
    expect(evaluationService.getEvaluationByJobDescription).toHaveBeenCalledWith(
      JOB_DESCRIPTION_ID,
      expect.any(String),
    );
  });

  it('should propagate 404 when the job has no evaluation', async () => {
    const evaluationService = {
      getEvaluationByJobDescription: vi
        .fn()
        .mockRejectedValue(new NotFoundException('Evaluation not found.')),
    } as unknown as EvaluationService;
    const controller = new JobDescriptionEvaluationController(evaluationService);

    await expect(
      controller.getEvaluationByJobDescription(JOB_DESCRIPTION_ID),
    ).rejects.toThrow(/not found/);
  });
});
