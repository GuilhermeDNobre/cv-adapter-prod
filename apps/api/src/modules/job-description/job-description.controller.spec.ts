import type { JobDescriptionResponse } from 'schema/contracts/job-description';
import { describe, expect, it, vi } from 'vitest';
import { JobDescriptionController } from './job-description.controller';
import type { JobDescriptionService } from './job-description.service';

const SAMPLE_RESPONSE: JobDescriptionResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  language: 'pt-BR',
  requirements: [],
};

function createController() {
  const createJobDescription = vi.fn(async () => SAMPLE_RESPONSE);
  const getJobDescription = vi.fn(async () => SAMPLE_RESPONSE);
  const service = { createJobDescription, getJobDescription } as unknown as JobDescriptionService;
  return {
    controller: new JobDescriptionController(service),
    service,
    createJobDescription,
    getJobDescription,
  };
}

describe('JobDescriptionController.createJobDescription', () => {
  it('should delegate the text to the service', async () => {
    const { controller, createJobDescription } = createController();

    await controller.createJobDescription({ text: 'vaga' });

    expect(createJobDescription).toHaveBeenCalledWith('vaga');
  });
});

describe('JobDescriptionController.readJobDescription', () => {
  it('should delegate the id to the service', async () => {
    const { controller, getJobDescription } = createController();

    await controller.readJobDescription('some-id');

    expect(getJobDescription).toHaveBeenCalledWith('some-id');
  });
});
