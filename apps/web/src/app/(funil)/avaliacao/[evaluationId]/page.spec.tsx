import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { EvaluationResponse } from 'schema/contracts/evaluation';
import { ApiError } from '../../../../lib/api-client';
import {
  getCareerProfile,
  getDeepSeekKeyStatus,
  getEvaluation,
  getEvaluationByJobDescription,
  getResume,
  getResumeImport,
  listResumes,
} from '../../../../lib/api-client';
import AvaliacaoDetailPage from './page';

vi.mock('../../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api-client')>();
  return {
    ...actual,
    getCareerProfile: vi.fn(),
    getDeepSeekKeyStatus: vi.fn(),
    getEvaluation: vi.fn(),
    getEvaluationByJobDescription: vi.fn(),
    getResume: vi.fn(),
    getResumeImport: vi.fn(),
    listResumes: vi.fn(),
  };
});



const mockedGetEvaluation = vi.mocked(getEvaluation);

const EVALUATION_ID = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';

function queuedEvaluation(): EvaluationResponse {
  return {
    id: EVALUATION_ID,
    status: 'queued',
    matchScore: null,
    failureReason: null,
    resumeId: null,
    requirementCoverages: [],
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderEvaluationPage(): Promise<void> {
  render(
    await AvaliacaoDetailPage({
      params: Promise.resolve({ evaluationId: EVALUATION_ID }),
      searchParams: Promise.resolve({}),
    }),
  );
  await flushPromises();
}

describe('AvaliacaoDetailPage', () => {
  beforeEach(() => {
    mockedGetEvaluation.mockResolvedValue(queuedEvaluation());
    vi.mocked(getCareerProfile).mockRejectedValue(new ApiError(404, undefined, undefined));
    vi.mocked(getDeepSeekKeyStatus).mockResolvedValue({ configured: true, lastFour: '1234' });
    vi.mocked(getEvaluationByJobDescription).mockRejectedValue(
      new ApiError(404, undefined, undefined),
    );
    vi.mocked(getResume).mockRejectedValue(new ApiError(404, undefined, undefined));
    vi.mocked(getResumeImport).mockRejectedValue(new ApiError(404, undefined, undefined));
    vi.mocked(listResumes).mockRejectedValue(new ApiError(404, undefined, undefined));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should poll the evaluation identified by the route segment', async () => {
    await renderEvaluationPage();

    expect(mockedGetEvaluation).toHaveBeenCalledWith(EVALUATION_ID);
    expect(screen.getByRole('heading', { name: 'Sua Evaluation' })).toBeInTheDocument();
    const texts = screen.getAllByRole('status').map((region) => region.textContent ?? '');
    expect(texts.some((text) => text.includes('Sua Evaluation está na fila'))).toBe(true);
  });
});
