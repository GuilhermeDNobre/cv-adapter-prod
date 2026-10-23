import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdaptationReviewController } from './adaptation-review.controller';
import { AdaptationReviewService } from './adaptation-review.service';
import { ResumeService } from './resume.service';

const RESUME_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';

function makeController(options: { decide?: unknown; undo?: unknown; document?: unknown }) {
  const reviews = {
    decide: vi.fn().mockImplementation(async () => {
      if (options.decide instanceof Error) {
        throw options.decide;
      }
      return RESUME_ID;
    }),
    undo: vi.fn().mockImplementation(async () => {
      if (options.undo instanceof Error) {
        throw options.undo;
      }
      return RESUME_ID;
    }),
  };
  const resumes = {
    getResume: vi.fn().mockResolvedValue(options.document ?? { id: RESUME_ID }),
  };
  const controller = new AdaptationReviewController(
    reviews as unknown as AdaptationReviewService,
    resumes as unknown as ResumeService,
  );
  return { controller, reviews, resumes };
}

describe('AdaptationReviewController', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 200 with the document on decide', async () => {
    const { controller, reviews } = makeController({ document: { id: RESUME_ID } });
    const result = await controller.decide(RESUME_ID, { evidenceId: EVIDENCE_ID, decision: 'accepted' });
    expect(reviews.decide).toHaveBeenCalledWith({ resumeId: RESUME_ID, userId: expect.any(String), evidenceId: EVIDENCE_ID, decision: 'accepted' });
    expect(result).toEqual({ id: RESUME_ID });
  });

  it('should return 200 with the document on undo', async () => {
    const { controller, reviews } = makeController({ document: { id: RESUME_ID } });
    const result = await controller.undo(RESUME_ID, { evidenceId: EVIDENCE_ID });
    expect(reviews.undo).toHaveBeenCalledWith({ resumeId: RESUME_ID, userId: expect.any(String), evidenceId: EVIDENCE_ID });
    expect(result).toEqual({ id: RESUME_ID });
  });

  it('should map a missing resume to 404', async () => {
    const { controller } = makeController({ decide: new NotFoundException('Resume not found.') });
    await expect(controller.decide(RESUME_ID, { evidenceId: EVIDENCE_ID, decision: 'accepted' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should map an invalid decision to 422', async () => {
    const { controller } = makeController({ decide: new UnprocessableEntityException('Only an added evidence can be accepted or rejected.') });
    await expect(controller.decide(RESUME_ID, { evidenceId: EVIDENCE_ID, decision: 'restored' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('should map undo without a decision to 422', async () => {
    const { controller } = makeController({ undo: new UnprocessableEntityException('There is no decision to undo.') });
    await expect(controller.undo(RESUME_ID, { evidenceId: EVIDENCE_ID })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should reject a malformed body with 400', async () => {
    const { controller } = makeController({});
    const pipe = (controller as unknown as { decide: unknown }).decide;
    void pipe;
    const { AdaptationReviewPipe } = await import('./adaptation-review.controller');
    expect(() => new AdaptationReviewPipe().transform({ evidenceId: 'nope', decision: 'accepted' })).toThrow(BadRequestException);
    expect(() => new AdaptationReviewPipe().transform({ evidenceId: EVIDENCE_ID, decision: 'ignored' })).toThrow(BadRequestException);
  });
});
