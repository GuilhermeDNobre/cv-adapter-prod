import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import type { EvaluationResponse } from 'schema/contracts/evaluation';
import { ApiError, createEvaluation } from '../../../../lib/api-client';
import { EvaluationKickoff } from './evaluation-kickoff';

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
}));

const replace = simulated.replace;

vi.mock('../../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api-client')>();
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

function noCareerProfileApiError(): ApiError {
  return new ApiError(
    422,
    'You must have a Career Profile before requesting an evaluation.',
    { statusCode: 422, message: 'You must have a Career Profile before requesting an evaluation.' },
  );
}

describe('EvaluationKickoff', () => {
  beforeEach(() => {
    mockedCreateEvaluation.mockResolvedValue(queuedEvaluation());
  });

  afterEach(() => {
    mockedCreateEvaluation.mockReset();
    replace.mockReset();
  });

  it('should explain what to do and link to the vaga screen when no job was carried in', () => {
    render(<EvaluationKickoff jobDescriptionId={null} />);

    expect(screen.getByRole('heading', { name: 'Nenhuma vaga para avaliar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colar uma vaga' })).toHaveAttribute(
      'href',
      '/vaga',
    );
    expect(mockedCreateEvaluation).not.toHaveBeenCalled();
  });

  it('should start the evaluation for the carried job and preserve vaga in the detail route', async () => {
    render(<EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />);
    await flushPromises();

    expect(mockedCreateEvaluation).toHaveBeenCalledWith(JOB_DESCRIPTION_ID);
    expect(replace).toHaveBeenCalledWith(
      `/avaliacao/${EVALUATION_ID}?vaga=${JOB_DESCRIPTION_ID}`,
    );
  });

  it('should show the not-found notice when the API cannot find the job', async () => {
    mockedCreateEvaluation.mockRejectedValue(new ApiError(404, 'Job description not found.'));

    render(<EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />);
    await flushPromises();

    expect(screen.getByRole('link', { name: 'Colar a vaga de novo' })).toBeInTheDocument();
  });

  it('should request the evaluation exactly once even under the StrictMode double run', async () => {
    const view = render(<EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />);
    view.rerender(<EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />);
    await flushPromises();

    expect(mockedCreateEvaluation).toHaveBeenCalledTimes(1);
  });

  it('should request once and redirect under StrictMode', async () => {
    mockedCreateEvaluation.mockResolvedValue({ ...queuedEvaluation(), id: 'e1' });
    render(
      <React.StrictMode>
        <EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />
      </React.StrictMode>,
    );
    await flushPromises();

    expect(mockedCreateEvaluation).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(`/avaliacao/e1?vaga=${JOB_DESCRIPTION_ID}`);
  });

  it('should point to the resume step of the same vaga when the 422 says there is no Career Profile', async () => {
    mockedCreateEvaluation.mockRejectedValue(noCareerProfileApiError());

    render(<EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />);
    await flushPromises();

    expect(
      screen.getByRole('heading', { name: 'Seu Career Profile ainda não está pronto' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enviar currículo' })).toHaveAttribute(
      'href',
      `/curriculo?vaga=${JOB_DESCRIPTION_ID}`,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should say the cv-adapter is not answering when the attempt never reaches the API', async () => {
    mockedCreateEvaluation.mockRejectedValue(new Error('network down'));

    render(<EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o cv-adapter, e nenhuma avaliação foi iniciada. Confira se ele está rodando (docker compose ps) e tente de novo.',
    );
  });

  it('should say the balance is exhausted when the creation answers with ai_balance_exhausted', async () => {
    mockedCreateEvaluation.mockRejectedValue(
      new ApiError(422, 'exhausted', { code: 'ai_balance_exhausted', message: 'exhausted' }),
    );

    render(<EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('O saldo da sua conta na DeepSeek acabou');
  });

  it('should say the key was rejected when the creation answers with ai_key_rejected', async () => {
    mockedCreateEvaluation.mockRejectedValue(
      new ApiError(422, 'rejected', { code: 'ai_key_rejected', message: 'rejected' }),
    );

    render(<EvaluationKickoff jobDescriptionId={JOB_DESCRIPTION_ID} />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('A DeepSeek recusou a chave salva');
  });
});
