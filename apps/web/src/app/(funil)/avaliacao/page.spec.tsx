import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { EvaluationResponse } from 'schema/contracts/evaluation';
import { createEvaluation } from '../../../lib/api-client';
import AvaliacaoPage from './page';

const simulated = vi.hoisted(() => {
  class RedirectSignal extends Error {
    readonly location: string;

    constructor(location: string) {
      super(`NEXT_REDIRECT: ${location}`);
      this.name = 'RedirectSignal';
      this.location = location;
    }
  }
  return { RedirectSignal, replace: vi.fn() };
});

const { replace } = simulated;

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string): never => {
    throw new simulated.RedirectSignal(url);
  }),
  useRouter: () => ({ replace: simulated.replace }),
}));

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return { ...actual, createEvaluation: vi.fn() };
});


const mockedCreateEvaluation = vi.mocked(createEvaluation);

const JOB_DESCRIPTION_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
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

async function renderAvaliacao(
  params: Record<string, string | string[] | undefined>,
): Promise<'rendered' | string> {
  try {
    render(await AvaliacaoPage({ searchParams: Promise.resolve(params) }));
    await flushPromises();
    return 'rendered';
  } catch (error: unknown) {
    if (error instanceof simulated.RedirectSignal) return error.location;
    throw error;
  }
}

describe('AvaliacaoPage', () => {
  beforeEach(() => {
    mockedCreateEvaluation.mockResolvedValue(queuedEvaluation());
  });

  afterEach(() => {
    mockedCreateEvaluation.mockReset();
    replace.mockReset();
  });

  it('should ask for a job description as content when the route carries none', async () => {
    expect(await renderAvaliacao({})).toBe('rendered');

    expect(screen.getByRole('heading', { name: 'Nenhuma vaga para avaliar' })).toBeInTheDocument();
    expect(mockedCreateEvaluation).not.toHaveBeenCalled();
  });

  it('should request the evaluation for the job description carried in the query string', async () => {
    expect(await renderAvaliacao({ vaga: JOB_DESCRIPTION_ID })).toBe('rendered');

    expect(mockedCreateEvaluation).toHaveBeenCalledWith(JOB_DESCRIPTION_ID);
    expect(replace).toHaveBeenCalledWith(`/avaliacao/${EVALUATION_ID}?vaga=${JOB_DESCRIPTION_ID}`);
  });
});
