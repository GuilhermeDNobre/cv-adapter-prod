import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DataErasureController, DataErasurePipe } from './data-erasure.controller';
import type { DataErasureService } from './data-erasure.service';

function createController() {
  const erase = vi.fn(async () => undefined);
  const service = { erase } as unknown as DataErasureService;
  return { controller: new DataErasureController(service), erase };
}

describe('DataErasureController.eraseData', () => {
  it('should delegate the scope to the service and return it', async () => {
    const { controller, erase } = createController();

    await expect(controller.eraseData({ scope: 'job_descriptions' })).resolves.toEqual({
      scope: 'job_descriptions',
    });
    expect(erase).toHaveBeenCalledWith('job_descriptions');
  });

  it('should delegate the career_profile scope', async () => {
    const { controller, erase } = createController();

    await expect(controller.eraseData({ scope: 'career_profile' })).resolves.toEqual({
      scope: 'career_profile',
    });
    expect(erase).toHaveBeenCalledWith('career_profile');
  });

  it('should delegate the everything scope', async () => {
    const { controller, erase } = createController();

    await expect(controller.eraseData({ scope: 'everything' })).resolves.toEqual({
      scope: 'everything',
    });
    expect(erase).toHaveBeenCalledWith('everything');
  });

  it('should delegate the resumes scope', async () => {
    const { controller, erase } = createController();

    await expect(controller.eraseData({ scope: 'resumes' })).resolves.toEqual({
      scope: 'resumes',
    });
    expect(erase).toHaveBeenCalledWith('resumes');
  });
});

describe('DataErasurePipe', () => {
  it('should accept each known scope', () => {
    const pipe = new DataErasurePipe();

    expect(pipe.transform({ scope: 'job_descriptions' })).toEqual({ scope: 'job_descriptions' });
    expect(pipe.transform({ scope: 'career_profile' })).toEqual({ scope: 'career_profile' });
    expect(pipe.transform({ scope: 'everything' })).toEqual({ scope: 'everything' });
    expect(pipe.transform({ scope: 'resumes' })).toEqual({ scope: 'resumes' });
  });

  it('should reject an unknown scope with 400', () => {
    const pipe = new DataErasurePipe();

    expect(() => pipe.transform({ scope: 'unknown' })).toThrow(BadRequestException);
  });

  it('should reject a missing scope with 400', () => {
    const pipe = new DataErasurePipe();

    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });
});
