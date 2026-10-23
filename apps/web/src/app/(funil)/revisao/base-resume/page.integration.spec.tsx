import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BaseResumePage from './page';

const API_URL = 'http://localhost:3001';
const IMPORT_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const NEW_RESUME_ID = '44444444-4444-4444-8444-444444444444';
const POLL_INTERVAL_MS = 1500;

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readyProposal(): unknown {
  return {
    status: 'ready',
    failureReason: null,
    proposal: {
      name: 'Analista de dados',
      language: 'pt',
      style: { writingMethod: 'star', tone: 'technical', averageBulletWords: 12 },
      sections: [
        {
          kind: 'experience',
          title: null,
          entries: [
            {
              experienceId: '11111111-1111-4111-8111-111111111111',
              bullets: [
                {
                  evidenceId: '22222222-2222-4222-8222-222222222222',
                  original: 'Fiz relatórios em Python.',
                  text: 'Reduzi relatórios em 40% com Python.',
                },
              ],
            },
          ],
        },
      ],
    },
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

describe('BaseResumePage against a simulated API server', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should poll every 1500ms while generating and then offer decisions', async () => {
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (
        url === `${API_URL}/resume-imports/${IMPORT_ID}/base-resume-proposal` &&
        method === 'GET'
      ) {
        pollCount += 1;
        if (pollCount < 3) {
          return apiJson({ status: 'generating', proposal: null, failureReason: null }, 200);
        }
        return apiJson(readyProposal(), 200);
      }
      return apiJson({ statusCode: 404, message: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      await BaseResumePage({ searchParams: Promise.resolve({ resumeImportId: IMPORT_ID }) }),
    );
    await flushPromises();
    expect(screen.getByRole('heading', { name: 'Montando o Base Resume' })).toBeInTheDocument();
    expect(pollCount).toBe(1);

    await advanceTimers(POLL_INTERVAL_MS);
    await flushPromises();
    expect(pollCount).toBe(2);

    await advanceTimers(POLL_INTERVAL_MS);
    await flushPromises();
    expect(screen.getByLabelText('Nome do Base Resume')).toHaveValue('Analista de dados');
    expect(screen.getByText('0 de 1 bullets decididos')).toBeInTheDocument();
  });

  it('should approve with the chosen text through the simulated server and offer the pronto path', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (
        url === `${API_URL}/resume-imports/${IMPORT_ID}/base-resume-proposal` &&
        method === 'GET'
      ) {
        return apiJson(readyProposal(), 200);
      }
      if (url === `${API_URL}/base-resumes` && method === 'POST') {
        return apiJson({ id: NEW_RESUME_ID }, 200);
      }
      return apiJson({ statusCode: 404, message: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      await BaseResumePage({ searchParams: Promise.resolve({ resumeImportId: IMPORT_ID }) }),
    );
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Usar reescrita' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar Base Resume' }));
    await flushPromises();

    const posts = fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === `${API_URL}/base-resumes` && init?.method === 'POST',
    );
    expect(posts).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/pronto?resumeId=${NEW_RESUME_ID}`),
    );
  });

  it('should not offer to advance to the job before approval', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (
        url === `${API_URL}/resume-imports/${IMPORT_ID}/base-resume-proposal` &&
        method === 'GET'
      ) {
        return apiJson(readyProposal(), 200);
      }
      return apiJson({ statusCode: 404, message: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      await BaseResumePage({ searchParams: Promise.resolve({ resumeImportId: IMPORT_ID }) }),
    );
    await flushPromises();

    expect(screen.queryByRole('link', { name: /Avançar para Vaga/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Avançar para Vaga/ })).not.toBeInTheDocument();
  });
});
