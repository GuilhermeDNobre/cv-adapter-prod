import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { EvaluationResponse, RequirementCoverageResponse } from 'schema/contracts/evaluation';
import { MATCH_COUNT_MS } from '../../../../lib/motion';
import AvaliacaoDetailPage from './page';

const API_URL = 'http://localhost:3001';
const EVALUATION_ID = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';
const POLL_INTERVAL_MS = 1500;

const simulated = vi.hoisted(() => ({
  pollNumber: { current: 0 },
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ replace: vi.fn() }) }));


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

const REQUIRED_COVERAGES: readonly RequirementCoverageResponse[] = [
  COVERED_KUBERNETES,
  GAP_ENGLISH,
];

function statusOnly(status: 'queued' | 'analyzing'): EvaluationResponse {
  return {
    id: EVALUATION_ID,
    status,
    matchScore: null,
    failureReason: null,
    resumeId: null,
    requirementCoverages: [],
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

function readyWith(coverages: readonly RequirementCoverageResponse[]): EvaluationResponse {
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

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubApiServer(sequence: readonly EvaluationResponse[]): void {
  simulated.pollNumber.current = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${API_URL}/evaluations/${EVALUATION_ID}/deny-gap` && init?.method === 'POST') {
      return apiJson({ denied: true, normalizedConcept: 'ingles avancado' }, 200);
    }
    if (url === `${API_URL}/evaluations/${EVALUATION_ID}` && init?.method === 'GET') {
      const answered = simulated.pollNumber.current;
      simulated.pollNumber.current += 1;
      const next = sequence[Math.min(answered, sequence.length - 1)];
      if (next === undefined) throw new Error('Expected a non-empty status sequence');
      return apiJson(next, 200);
    }
    return apiJson({ statusCode: 404, message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function advanceTimers(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function renderEvaluationScreen(): Promise<ReturnType<typeof render>> {
  const view = render(
    await AvaliacaoDetailPage({
      params: Promise.resolve({ evaluationId: EVALUATION_ID }),
      searchParams: Promise.resolve({}),
    }),
  );
  await flushPromises();
  return view;
}

function pollCalls(): number {
  const fetchMock = vi.mocked(fetch);
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url) === `${API_URL}/evaluations/${EVALUATION_ID}` && init?.method === 'GET',
  ).length;
}

describe('AvaliacaoDetailPage against a simulated API server', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should walk queued and analyzing on screen and end with the score and the list', async () => {
    stubApiServer([
      statusOnly('queued'),
      statusOnly('queued'),
      statusOnly('analyzing'),
      readyWith(REQUIRED_COVERAGES),
    ]);
    await renderEvaluationScreen();

    function statusTexts(): string[] {
      return screen.getAllByRole('status').map((region) => region.textContent ?? '');
    }

    expect(statusTexts().some((text) => text.includes('Sua Evaluation está na fila'))).toBe(true);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(
      statusTexts().some((text) => text.includes('Cruzando as Evidences do seu Career Profile')),
    ).toBe(true);

    await advanceTimers(POLL_INTERVAL_MS);
    await advanceTimers(MATCH_COUNT_MS);
    expect(
      within(screen.getByRole('region', { name: 'Match Score' })).getByText('85'),
    ).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.getByText('Conduzi migração de clusters em produção.')).toBeInTheDocument();
    expect(pollCalls()).toBe(5);

    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(pollCalls()).toBe(5);
  });

  it('should deny a Gap through the endpoint and re-render it answered with the score intact', async () => {
    stubApiServer([
      readyWith(REQUIRED_COVERAGES),
      readyWith(REQUIRED_COVERAGES),
      readyWith([COVERED_KUBERNETES, { ...GAP_ENGLISH, denied: true }]),
    ]);
    await renderEvaluationScreen();
    await advanceTimers(MATCH_COUNT_MS);

    const denyButton = screen.getByRole('button', { name: 'Não tenho isso' });
    fireEvent.click(denyButton);
    await flushPromises();

    const fetchMock = vi.mocked(fetch);
    const denyCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === `${API_URL}/evaluations/${EVALUATION_ID}/deny-gap` &&
        init?.method === 'POST',
    );
    if (denyCall === undefined) throw new Error('Expected the deny-gap request');
    expect(denyCall[1]?.body).toBe(
      JSON.stringify({ requirementId: GAP_ENGLISH.requirementId }),
    );

    const deniedItem = screen
      .getAllByRole('listitem')
      .find((item) => within(item).queryByText('Inglês avançado') !== null);
    if (deniedItem === undefined) throw new Error('Expected the denied Gap to still be listed');
    expect(within(deniedItem).getByText('Respondido')).toBeInTheDocument();
    expect(
      within(deniedItem).queryByRole('button', { name: 'Não tenho isso' }),
    ).not.toBeInTheDocument();
    expect(within(deniedItem).getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Match Score' })).getByText('85'),
    ).toBeInTheDocument();
  });

  it('should stop querying the simulated server when the screen unmounts mid-analysis', async () => {
    stubApiServer([statusOnly('queued')]);
    const view = await renderEvaluationScreen();
    expect(pollCalls()).toBe(2);

    await act(async () => {
      view.unmount();
    });
    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(pollCalls()).toBe(2);
  });

  it('should keep the coverage in Avaliacao and no other stage panel', async () => {
    stubApiServer([readyWith(REQUIRED_COVERAGES)]);
    await renderEvaluationScreen();
    await flushPromises();

    expect(screen.getByRole('region', { name: 'Match Score' })).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Exportar PDF' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Configurações do documento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('O que mudou em relação ao Base Resume')).not.toBeInTheDocument();
  });
});
