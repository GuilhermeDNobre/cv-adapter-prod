import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { EvaluationResponse, RequirementCoverageResponse } from 'schema/contracts/evaluation';
import { ApiError, denyGap, getEvaluation, undenyGap } from '../../../../lib/api-client';
import { MATCH_COUNT_MS } from '../../../../lib/motion';
import { EvaluationScreen } from './evaluation-screen';

vi.mock('../../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api-client')>();
  return {
    ...actual,
    getEvaluation: vi.fn(),
    denyGap: vi.fn(),
    undenyGap: vi.fn(),
  };
});

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));
const motionReduced = vi.hoisted(() => ({ value: false }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => motionReduced.value };
});

const mockedGetEvaluation = vi.mocked(getEvaluation);
const mockedDenyGap = vi.mocked(denyGap);
const mockedUndenyGap = vi.mocked(undenyGap);
const replace = simulated.replace;

const EVALUATION_ID = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';
const POLL_INTERVAL_MS = 1500;
const EVIDENCE_ID = 'b7e1d9f3-4a6c-4e8f-9a0b-c1d2e3f4a5b6';
const EVIDENCE_STATEMENT =
  'Migrei 12 serviços para clusters Kubernetes em produção, com zero downtime.';

const COVERED_KUBERNETES: RequirementCoverageResponse = {
  requirementId: '11111111-1111-4111-8111-111111111111',
  literalTerm: 'Kubernetes',
  concept: 'Experiência com orquestração de containers',
  kind: 'mandatory',
  coverage: 'covered',
  evidenceId: EVIDENCE_ID,
  evidenceStatement: EVIDENCE_STATEMENT,
  rationale: 'Conduzi migração de clusters em produção.',
  denied: false,
};

const GAP_ENGLISH: RequirementCoverageResponse = {
  requirementId: '22222222-2222-4222-8222-222222222222',
  literalTerm: 'Inglês avançado',
  concept: 'Comunicação profissional em inglês',
  kind: 'mandatory',
  coverage: 'gap',
  evidenceId: null,
  evidenceStatement: null,
  rationale: 'Nenhuma Evidence descreve uso profissional do inglês.',
  denied: false,
};

const COVERED_GIT: RequirementCoverageResponse = {
  requirementId: '33333333-3333-4333-8333-333333333333',
  literalTerm: 'Git',
  concept: 'Fluxo de versionamento colaborativo',
  kind: 'desirable',
  coverage: 'covered',
  evidenceId: 'c8f2e0a4-5b7d-4f9a-8b1c-d2e3f4a5b6c7',
  evidenceStatement: 'Mantive o histórico do repositório revisado por pares.',
  rationale: 'Mantive o fluxo de code review do time.',
  denied: false,
};

const DENIED_POWERBI: RequirementCoverageResponse = {
  requirementId: '44444444-4444-4444-8444-444444444444',
  literalTerm: 'Power BI',
  concept: 'Dashboards interativos de negócio',
  kind: 'desirable',
  coverage: 'gap',
  evidenceId: null,
  evidenceStatement: null,
  rationale: 'Nenhuma Evidence menciona Power BI.',
  denied: true,
};

const PARTIAL_DOCKER: RequirementCoverageResponse = {
  requirementId: '55555555-5555-4555-8555-555555555555',
  literalTerm: 'Docker',
  concept: 'Empacotamento de aplicações em containers',
  kind: 'mandatory',
  coverage: 'partial',
  evidenceId: 'd9f3e1b5-6c8d-4f9a-9b1d-e3f4a5b6c7d8',
  evidenceStatement: 'Conteinerizei serviços legados com Docker Compose.',
  rationale: 'Uso parcial de containers sem orquestração.',
  denied: false,
};

function readyEvaluation(
  coverages: readonly RequirementCoverageResponse[],
): EvaluationResponse {
  return {
    id: EVALUATION_ID,
    status: 'ready',
    matchScore: 85,
    failureReason: null,
    resumeId: null,
    requirementCoverages: [...coverages],
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
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

function itemOf(literalTerm: string): HTMLElement {
  const [item] = screen.getAllByRole('listitem').filter(
    (candidate) => within(candidate).queryByText(literalTerm) !== null,
  );
  if (item === undefined) throw new Error(`Expected an item for ${literalTerm}`);
  return item;
}

async function renderReady(
  coverages: readonly RequirementCoverageResponse[],
  jobDescriptionId: string | null = null,
): Promise<void> {
  mockedGetEvaluation.mockResolvedValue(readyEvaluation(coverages));
  render(<EvaluationScreen evaluationId={EVALUATION_ID} jobDescriptionId={jobDescriptionId} />);
  await flushPromises();
}

describe('EvaluationScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mockedGetEvaluation.mockReset();
    mockedDenyGap.mockReset();
    mockedUndenyGap.mockReset();
    replace.mockReset();
  });

  it('should show the Match Score as a number with the item-by-item list below it', async () => {
    await renderReady([COVERED_KUBERNETES, GAP_ENGLISH]);
    await advanceTimers(MATCH_COUNT_MS);

    expect(screen.getByRole('heading', { name: 'Match Score' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Match Score' })).getByText('85'),
    ).toBeInTheDocument();
    expect(itemOf('Kubernetes')).toBeInTheDocument();

    const text = document.body.textContent ?? '';
    expect(text.indexOf('85')).toBeLessThan(text.indexOf('Kubernetes'));
  });

  it('should announce the score to screen readers once the evaluation is ready', async () => {
    await renderReady([COVERED_KUBERNETES]);

    const texts = screen.getAllByRole('status').map((region) => region.textContent ?? '');
    expect(texts.some((text) => text.includes('Evaluation pronta. Match Score 85 de 100.'))).toBe(
      true,
    );
  });

  it('should show the covering Evidence on a covered item and none on a Gap', async () => {
    await renderReady([COVERED_KUBERNETES, GAP_ENGLISH]);

    const covered = itemOf('Kubernetes');
    expect(within(covered).getByText('Evidence que cobre este item')).toBeInTheDocument();
    expect(within(covered).getByText(EVIDENCE_STATEMENT)).toBeInTheDocument();
    expect(within(covered).queryByText(EVIDENCE_ID)).not.toBeInTheDocument();
    expect(within(covered).getByText('Conduzi migração de clusters em produção.')).toBeInTheDocument();

    const gap = itemOf('Inglês avançado');
    expect(within(gap).queryByText('Evidence que cobre este item')).not.toBeInTheDocument();
  });

  it('should label each coverage state and keep mandatory and desirable apart by group', async () => {
    await renderReady([COVERED_KUBERNETES, COVERED_GIT, DENIED_POWERBI]);

    expect(within(itemOf('Kubernetes')).getByText('Coberto')).toBeInTheDocument();
    expect(within(itemOf('Kubernetes')).getByText('Obrigatório')).toBeInTheDocument();
    expect(within(itemOf('Git')).getByText('Desejável')).toBeInTheDocument();
    expect(within(itemOf('Power BI')).getByText('Desejável')).toBeInTheDocument();
    expect(within(itemOf('Git')).queryByText('Kubernetes')).not.toBeInTheDocument();
  });

  it('should frame a Gap as something to answer, never as a failure block', async () => {
    await renderReady([GAP_ENGLISH]);

    const gap = itemOf('Inglês avançado');
    expect(within(gap).getByText(/não é uma reprovação/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should say before the action that denying does not change the score', async () => {
    await renderReady([GAP_ENGLISH]);

    const gap = itemOf('Inglês avançado');
    expect(within(gap).getByText(/não muda o Match Score/)).toBeInTheDocument();
    expect(within(gap).getByRole('button', { name: 'Não tenho isso' })).toBeInTheDocument();
  });

  it('should deny a Gap through the endpoint and render it as answered with the same number', async () => {
    await renderReady([COVERED_KUBERNETES, GAP_ENGLISH]);
    await advanceTimers(MATCH_COUNT_MS);
    mockedGetEvaluation.mockResolvedValue(
      readyEvaluation([COVERED_KUBERNETES, { ...GAP_ENGLISH, denied: true }]),
    );
    mockedDenyGap.mockResolvedValue({ denied: true, normalizedConcept: 'ingles avancado' });

    fireEvent.click(within(itemOf('Inglês avançado')).getByRole('button', { name: 'Não tenho isso' }));
    await flushPromises();

    expect(mockedDenyGap).toHaveBeenCalledWith(EVALUATION_ID, GAP_ENGLISH.requirementId);
    const gap = itemOf('Inglês avançado');
    expect(within(gap).getByText('Respondido')).toBeInTheDocument();
    expect(within(gap).getByText(/Você respondeu que não tem isso/)).toBeInTheDocument();
    expect(within(gap).queryByRole('button', { name: 'Não tenho isso' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Match Score' })).getByText('85')).toBeInTheDocument();
  });

  it('should show an already denied Gap as answered, with only the undo affordance', async () => {
    await renderReady([DENIED_POWERBI]);

    const denied = itemOf('Power BI');
    expect(within(denied).getByText('Respondido')).toBeInTheDocument();
    expect(within(denied).queryByText('Gap')).not.toBeInTheDocument();
    expect(
      within(denied).queryByRole('button', { name: 'Não tenho isso' }),
    ).not.toBeInTheDocument();
    expect(within(denied).getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
  });

  it('should undeny a denied Gap through the endpoint and announce the result', async () => {
    await renderReady([DENIED_POWERBI]);
    const undoneEvaluation = readyEvaluation([
      { ...DENIED_POWERBI, denied: false },
    ]);
    mockedGetEvaluation.mockResolvedValue(undoneEvaluation);
    mockedUndenyGap.mockResolvedValue(undoneEvaluation);

    fireEvent.click(within(itemOf('Power BI')).getByRole('button', { name: 'Desfazer' }));
    await flushPromises();

    expect(mockedUndenyGap).toHaveBeenCalledWith(EVALUATION_ID, DENIED_POWERBI.requirementId);
    const texts = screen.getAllByRole('status').map((region) => region.textContent ?? '');
    expect(
      texts.some((text) => text.includes('Resposta desfeita. O item volta a ser um Gap.')),
    ).toBe(true);
  });

  it('should show the Gap as open again with deny affordance after a successful undeny', async () => {
    await renderReady([DENIED_POWERBI]);
    await advanceTimers(MATCH_COUNT_MS);
    const undoneEvaluation = readyEvaluation([{ ...DENIED_POWERBI, denied: false }]);
    mockedGetEvaluation.mockResolvedValue(undoneEvaluation);
    mockedUndenyGap.mockResolvedValue(undoneEvaluation);

    fireEvent.click(within(itemOf('Power BI')).getByRole('button', { name: 'Desfazer' }));
    await flushPromises();

    const gap = itemOf('Power BI');
    expect(within(gap).getByRole('button', { name: 'Não tenho isso' })).toBeInTheDocument();
    expect(within(gap).queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Match Score' })).getByText('85'),
    ).toBeInTheDocument();
  });

  it('should stop polling once the evaluation reaches the ready state', async () => {
    await renderReady([COVERED_KUBERNETES]);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);

    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);
  });

  it('should walk queued and analyzing progress through the aria-live region until ready', async () => {
    mockedGetEvaluation
      .mockResolvedValueOnce({ ...readyEvaluation([]), status: 'queued', matchScore: null })
      .mockResolvedValueOnce({ ...readyEvaluation([]), status: 'analyzing', matchScore: null })
      .mockResolvedValue(readyEvaluation([COVERED_KUBERNETES]));
    render(<EvaluationScreen evaluationId={EVALUATION_ID} />);
    await flushPromises();

    function statusTexts(): string[] {
      return screen.getAllByRole('status').map((region) => region.textContent ?? '');
    }

    expect(statusTexts().some((text) => text.includes('Sua Evaluation está na fila'))).toBe(true);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(
      statusTexts().some((text) => text.includes('Cruzando as Evidences do seu Career Profile')),
    ).toBe(true);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(
      statusTexts().some((text) => text.includes('Evaluation pronta. Match Score 85 de 100.')),
    ).toBe(true);
    await advanceTimers(MATCH_COUNT_MS);
    expect(within(screen.getByRole('region', { name: 'Match Score' })).getByText('85')).toBeInTheDocument();
  });

  it('should say the analysis failed when the evaluation reaches the failed state', async () => {
    mockedGetEvaluation.mockResolvedValue({
      ...readyEvaluation([]),
      status: 'failed',
      matchScore: null,
    });
    render(<EvaluationScreen evaluationId={EVALUATION_ID} />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('A análise não conseguiu terminar');
    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);
  });

  it('should say the evaluation may have been deleted when polling answers 404', async () => {
    mockedGetEvaluation.mockRejectedValue(new ApiError(404, 'Evaluation not found.'));
    render(<EvaluationScreen evaluationId={EVALUATION_ID} />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não encontramos esta Evaluation. Ela pode ter sido apagada.',
    );
  });

  it('should say the balance is exhausted when the failure reason is ai_balance_exhausted', async () => {
    mockedGetEvaluation.mockResolvedValue({
      ...readyEvaluation([]),
      status: 'failed',
      matchScore: null,
      failureReason: 'ai_balance_exhausted',
    });
    render(<EvaluationScreen evaluationId={EVALUATION_ID} />);
    await flushPromises();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('O saldo da sua conta na DeepSeek acabou');
    expect(alert).not.toHaveTextContent('A análise não conseguiu terminar');
  });

  it('should say the key was rejected when the failure reason is ai_key_rejected', async () => {
    mockedGetEvaluation.mockResolvedValue({
      ...readyEvaluation([]),
      status: 'failed',
      matchScore: null,
      failureReason: 'ai_key_rejected',
    });
    render(<EvaluationScreen evaluationId={EVALUATION_ID} />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('A DeepSeek recusou a chave salva');
  });

  it('should say the AI did not answer when the failure reason is ai_unavailable', async () => {
    mockedGetEvaluation.mockResolvedValue({
      ...readyEvaluation([]),
      status: 'failed',
      matchScore: null,
      failureReason: 'ai_unavailable',
    });
    render(<EvaluationScreen evaluationId={EVALUATION_ID} />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('A IA não respondeu agora');
  });

  it('should show the portuguese concept and rationale the api returns for each item', async () => {
    await renderReady([COVERED_KUBERNETES]);

    const covered = itemOf('Kubernetes');
    expect(within(covered).getByText('Experiência com orquestração de containers')).toBeInTheDocument();
    expect(
      within(covered).getByText('Conduzi migração de clusters em produção.'),
    ).toBeInTheDocument();
  });

  it('should expose no advance link in the screen because the wizard footer owns it', async () => {
    const jobId = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
    await renderReady([COVERED_KUBERNETES], jobId);

    expect(screen.queryByRole('link', { name: 'Continuar para adaptar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Colar uma vaga' })).not.toBeInTheDocument();
  });

  it('should expose no vacancy link when no vacancy was carried in', async () => {
    await renderReady([COVERED_KUBERNETES], null);

    expect(screen.queryByRole('link', { name: 'Continuar para adaptar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Colar uma vaga' })).not.toBeInTheDocument();
  });

  it('should show the queued text only once from AiProgress', async () => {
    mockedGetEvaluation.mockResolvedValue({
      ...readyEvaluation([]),
      status: 'queued',
      matchScore: null,
    });
    render(<EvaluationScreen evaluationId={EVALUATION_ID} />);
    await flushPromises();

    const queuedText = 'Sua Evaluation está na fila para análise.';
    const all = screen.getAllByText(queuedText);
    const visible = all.filter((node) => {
      const element = node as HTMLElement;
      if (element.classList.contains('sr-only')) return false;
      if (element.closest('.sr-only') !== null) return false;
      if (element.children.length !== 0) return false;
      return true;
    });
    expect(visible).toHaveLength(1);

    const statuses = screen.getAllByRole('status');
    const repeating = statuses.filter((region) =>
      (region.textContent ?? '').includes(queuedText),
    );
    expect(repeating).toHaveLength(1);
  });

  it('should filter to Gaps only with correct counters', async () => {
    await renderReady([COVERED_KUBERNETES, PARTIAL_DOCKER, GAP_ENGLISH]);
    await advanceTimers(MATCH_COUNT_MS);

    expect(screen.getByRole('radio', { name: 'Todos 3' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Cobertos 1' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Parciais 1' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Gaps 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Gaps 1' }));

    expect(screen.getByRole('radio', { name: 'Gaps 1' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(within(items[0] as HTMLElement).getByText('Inglês avançado')).toBeInTheDocument();
    expect(screen.queryByText('Kubernetes')).not.toBeInTheDocument();
    expect(screen.queryByText('Docker')).not.toBeInTheDocument();
  });

  it('should expose the final score in an img aria-label', async () => {
    await renderReady([COVERED_KUBERNETES]);

    expect(
      screen.getByRole('img', { name: 'Match Score: 85 de 100' }),
    ).toBeInTheDocument();

    await advanceTimers(MATCH_COUNT_MS);

    expect(
      within(screen.getByRole('region', { name: 'Match Score' })).getByText('85'),
    ).toBeInTheDocument();
  });

  it('should show the final number directly with reduced motion', async () => {
    motionReduced.value = true;
    try {
      await renderReady([COVERED_KUBERNETES]);

      expect(
        within(screen.getByRole('region', { name: 'Match Score' })).getByText('85'),
      ).toBeInTheDocument();
    } finally {
      motionReduced.value = false;
    }
  });

  it('should use the singular in the legend when a count is 1', async () => {
    const GAP_SPANISH: RequirementCoverageResponse = {
      ...GAP_ENGLISH,
      requirementId: '66666666-6666-4666-8666-666666666666',
      literalTerm: 'Espanhol avançado',
      concept: 'Comunicação profissional em espanhol',
    };
    await renderReady([COVERED_KUBERNETES, PARTIAL_DOCKER, GAP_ENGLISH, GAP_SPANISH]);

    const region = screen.getByRole('region', { name: 'Match Score' });
    expect(within(region).getByText(/1 coberto/)).toBeInTheDocument();
    expect(within(region).getByText(/1 parcial/)).toBeInTheDocument();
    expect(within(region).getByText(/2 gaps/)).toBeInTheDocument();
  });

  it('should keep the filter fitted to its content', async () => {
    await renderReady([COVERED_KUBERNETES, PARTIAL_DOCKER, GAP_ENGLISH]);

    const filter = screen.getByRole('radiogroup', { name: 'Filtrar requirements por status' });
    expect(filter).toHaveClass('self-start');
  });
});
