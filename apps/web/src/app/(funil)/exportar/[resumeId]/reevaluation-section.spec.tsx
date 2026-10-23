'use client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '../../../../lib/api-client';
import {
  createResumeEvaluation as mockedCreate,
  getLatestResumeEvaluation as mockedLatest,
} from '../../../../lib/api-client';
import type { ResumeReevaluationLatestResponse } from 'schema/contracts/evaluation';
import { ReevaluationSection } from './reevaluation-section';

vi.mock('../../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api-client')>();
  return { ...actual, createResumeEvaluation: vi.fn(), getLatestResumeEvaluation: vi.fn() };
});

const createEvaluation = vi.mocked(mockedCreate);
const getLatest = vi.mocked(mockedLatest);
const RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const RESUME_UPDATED_AT = '2026-09-05T10:00:00.000Z';
const LATEST_UPDATED_AT = '2026-09-05T11:00:00.000Z';
const KUBERNETES_ID = '11111111-1111-4111-8111-111111111111';
const TYPESCRIPT_ID = '22222222-2222-4222-8222-222222222222';
const EVALUATION_ID = '33333333-3333-4333-8333-333333333333';

function readyResponse(): ResumeReevaluationLatestResponse {
  return {
    id: EVALUATION_ID,
    status: 'ready',
    matchScore: 100,
    failureReason: null,
    resumeId: RESUME_ID,
    requirementCoverages: [
      {
        requirementId: KUBERNETES_ID,
        literalTerm: 'Kubernetes',
        concept: 'Container orchestration',
        kind: 'mandatory',
        coverage: 'covered',
        evidenceId: null,
        evidenceStatement: null,
        rationale: 'Document covers it',
        denied: false,
      },
      {
        requirementId: TYPESCRIPT_ID,
        literalTerm: 'TypeScript',
        concept: 'TypeScript programming',
        kind: 'desirable',
        coverage: 'gap',
        evidenceId: null,
        evidenceStatement: null,
        rationale: 'No match',
        denied: false,
      },
    ],
    baseline: {
      id: '44444444-4444-4444-8444-444444444444',
      matchScore: 75,
      requirementCoverages: [
        {
          requirementId: KUBERNETES_ID,
          literalTerm: 'Kubernetes',
          concept: 'Container orchestration',
          kind: 'mandatory',
          coverage: 'gap',
          evidenceId: null,
          evidenceStatement: null,
          rationale: 'No evidence',
          denied: false,
        },
        {
          requirementId: TYPESCRIPT_ID,
          literalTerm: 'TypeScript',
          concept: 'TypeScript programming',
          kind: 'desirable',
          coverage: 'gap',
          evidenceId: null,
          evidenceStatement: null,
          rationale: 'No evidence',
          denied: false,
        },
      ],
    },
    comparisons: [
      {
        requirementId: KUBERNETES_ID,
        literalTerm: 'Kubernetes',
        kind: 'mandatory',
        coverageBefore: 'gap',
        coverageAfter: 'covered',
        improved: true,
      },
      {
        requirementId: TYPESCRIPT_ID,
        literalTerm: 'TypeScript',
        kind: 'desirable',
        coverageBefore: 'gap',
        coverageAfter: 'gap',
        improved: false,
      },
    ],
    createdAt: LATEST_UPDATED_AT,
    updatedAt: LATEST_UPDATED_AT,
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function advanceTimers(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('ReevaluationSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    createEvaluation.mockReset();
    getLatest.mockReset();
  });
  it('should show loading while the reevaluation is running', async () => {
    getLatest.mockResolvedValue({ ...readyResponse(), status: 'queued', matchScore: null });
    render(<ReevaluationSection resumeId={RESUME_ID} resumeUpdatedAt={RESUME_UPDATED_AT} />);
    await flushPromises();
    expect(screen.getAllByText('Avaliação do currículo em andamento.').length).toBeGreaterThan(0);
  });
  it('should show scores and lists when ready', async () => {
    getLatest.mockResolvedValue(readyResponse());
    render(<ReevaluationSection resumeId={RESUME_ID} resumeUpdatedAt={RESUME_UPDATED_AT} />);
    await flushPromises();
    expect(screen.getAllByText('Compatibilidade: 75% → 100%').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Melhorou' })).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ainda falta' })).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Desejável')).toBeInTheDocument();
  });
  it('should show an error with retry when loading fails', async () => {
    getLatest.mockRejectedValue(new Error('offline'));
    render(<ReevaluationSection resumeId={RESUME_ID} resumeUpdatedAt={RESUME_UPDATED_AT} />);
    await flushPromises();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    getLatest.mockResolvedValue(readyResponse());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    });
    await flushPromises();
    expect(screen.getAllByText('Compatibilidade: 75% → 100%').length).toBeGreaterThan(0);
  });
  it('should create a new evaluation when none exists', async () => {
    getLatest.mockRejectedValueOnce(new ApiError(404, undefined, undefined));
    createEvaluation.mockResolvedValue({
      id: EVALUATION_ID,
      status: 'queued',
      matchScore: null,
      failureReason: null,
      resumeId: RESUME_ID,
      requirementCoverages: [],
      createdAt: LATEST_UPDATED_AT,
      updatedAt: LATEST_UPDATED_AT,
    });
    getLatest.mockResolvedValue(readyResponse());
    render(<ReevaluationSection resumeId={RESUME_ID} resumeUpdatedAt={RESUME_UPDATED_AT} />);
    await flushPromises();
    await advanceTimers(1500);
    await flushPromises();
    expect(createEvaluation).toHaveBeenCalledWith(RESUME_ID);
    expect(screen.getAllByText('Compatibilidade: 75% → 100%').length).toBeGreaterThan(0);
  });
  it('should keep polling while queued and stop when ready', async () => {
    getLatest
      .mockResolvedValueOnce({ ...readyResponse(), status: 'queued', matchScore: null })
      .mockResolvedValueOnce(readyResponse());
    render(<ReevaluationSection resumeId={RESUME_ID} resumeUpdatedAt={RESUME_UPDATED_AT} />);
    await flushPromises();
    expect(screen.getAllByText('Avaliação do currículo em andamento.').length).toBeGreaterThan(0);
    await advanceTimers(1500);
    await flushPromises();
    expect(screen.getAllByText('Compatibilidade: 75% → 100%').length).toBeGreaterThan(0);
  });
});
