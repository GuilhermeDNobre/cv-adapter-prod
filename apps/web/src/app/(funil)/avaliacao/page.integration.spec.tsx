import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import AvaliacaoPage from './page';

const API_URL = 'http://localhost:3001';
const JOB_DESCRIPTION_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';

const simulated = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: simulated.replace }),
}));

const MISSING_PROFILE_BODY = {
  statusCode: 422,
  message: 'You must have a Career Profile before requesting an evaluation.',
};

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubApiServer(): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${API_URL}/evaluations` && init?.method === 'POST') {
      return apiJson(MISSING_PROFILE_BODY, 422);
    }
    return apiJson({ statusCode: 404, message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderKickoff(): Promise<void> {
  render(
    await AvaliacaoPage({
      searchParams: Promise.resolve({ vaga: JOB_DESCRIPTION_ID }),
    }),
  );
  await flushPromises();
}

describe('AvaliacaoPage against a simulated API server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    simulated.replace.mockReset();
  });

  it('should send the job description id when requesting the evaluation', async () => {
    stubApiServer();
    await renderKickoff();

    const fetchMock = vi.mocked(fetch);
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === `${API_URL}/evaluations` && init?.method === 'POST',
    );
    if (createCall === undefined) throw new Error('Expected the evaluation request');
    expect(createCall[1]?.body).toBe(JSON.stringify({ jobDescriptionId: JOB_DESCRIPTION_ID }));
  });

  it('should render the missing career profile notice as content, not as failure', async () => {
    stubApiServer();
    await renderKickoff();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Seu Career Profile ainda não está pronto' }),
    ).toBeInTheDocument();
    expect(simulated.replace).not.toHaveBeenCalled();
  });
});
