import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ResumeImportDraft, ResumeImportResponse } from 'schema/contracts/resume-import';
import RevisaoPage from './page';

const API_URL = 'http://localhost:3001';
const IMPORT_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const INITIAL_DRAFT: ResumeImportDraft = {
  contactDetails: {
    fullName: 'Ana Souza',
    email: 'ana@exemplo.com',
    phone: '(11) 91234-5678',
    links: [{ title: null, url: 'https://linkedin.com/in/anasouza' }],
  },
  experiences: [
    { company: 'Acme Tecnologia', role: 'Analista de dados', startedOn: '03/2021', endedOn: '11/2023' },
  ],
  education: [
    { institution: 'USP', degree: 'Bacharelado em Estatística', startedOn: '2018', endedOn: '2022' },
  ],
  evidences: [
    { statement: 'Reduzi o tempo de relatório em 40% automatizando no Python.', experienceIndex: 0 },
  ],
};

interface FakeServerState {
  status: ResumeImportResponse['status'];
  draft: ResumeImportDraft | null;
}

function cloneDraft(draft: ResumeImportDraft): ResumeImportDraft {
  return JSON.parse(JSON.stringify(draft)) as ResumeImportDraft;
}

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function importResponse(state: FakeServerState): ResumeImportResponse {
  return {
    id: IMPORT_ID,
    status: state.status,
    failureReason: null,
    draft: state.draft,
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:30:00.000Z',
  };
}

function countCalls(method: string, suffix: string): number {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url, init]) => String(url).endsWith(suffix) && init?.method === method)
    .length;
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderReviewAgain(): Promise<void> {
  render(
    await RevisaoPage({ searchParams: Promise.resolve({ resumeImportId: IMPORT_ID }) }),
  );
  await flushPromises();
}

describe('RevisaoPage against a simulated API server', () => {
  let serverState: FakeServerState;

  beforeEach(() => {
    serverState = { status: 'ready_for_review', draft: cloneDraft(INITIAL_DRAFT) };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === `${API_URL}/resume-imports/${IMPORT_ID}` && method === 'GET') {
        return apiJson(importResponse(serverState), 200);
      }
      if (url === `${API_URL}/resume-imports/${IMPORT_ID}/draft` && method === 'PUT') {
        serverState.draft = JSON.parse(String(init?.body)) as ResumeImportDraft;
        return apiJson(importResponse(serverState), 200);
      }
      if (url === `${API_URL}/resume-imports/${IMPORT_ID}/confirm` && method === 'POST') {
        serverState.status = 'confirmed';
        return apiJson(importResponse(serverState), 200);
      }
      return apiJson({ statusCode: 404, message: 'Resume import not found.' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should survive an exit and a return with the correction already saved, then confirm and offer the evaluation path', async () => {
    const first = render(
      await RevisaoPage({ searchParams: Promise.resolve({ resumeImportId: IMPORT_ID }) }),
    );
    await flushPromises();

    const company = screen.getByLabelText('Empresa', { selector: '#experience-0-company' });
    fireEvent.change(company, { target: { value: 'Acme Tecnologia S.A.' } });
    fireEvent.blur(company);
    await flushPromises();

    expect(countCalls('PUT', `/resume-imports/${IMPORT_ID}/draft`)).toBe(1);
    expect(serverState.draft?.experiences[0]?.company).toBe('Acme Tecnologia S.A.');

    first.unmount();
    await renderReviewAgain();

    expect(
      screen.getByLabelText('Empresa', { selector: '#experience-0-company' }),
    ).toHaveValue('Acme Tecnologia S.A.');
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Ana Souza');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revisão' }));
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e criar meu Career Profile' }));
    await flushPromises();

    expect(countCalls('POST', `/resume-imports/${IMPORT_ID}/confirm`)).toBe(1);
    expect(serverState.status).toBe('confirmed');
    expect(screen.getByRole('link', { name: 'Continuar para a vaga' })).toHaveAttribute(
      'href',
      '/vaga',
    );
  });

  it('should say the draft does not exist when the simulated server has no such import', async () => {
    render(
      await RevisaoPage({ searchParams: Promise.resolve({ resumeImportId: 'missing-id' }) }),
    );
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('Não encontramos esse rascunho');
    expect(countCalls('PUT', `/resume-imports/${IMPORT_ID}/draft`)).toBe(0);
  });

  it('should refuse the review when the simulated server reports the import is still being read', async () => {
    serverState = { status: 'structuring', draft: null };
    await renderReviewAgain();

    expect(screen.getByRole('alert')).toHaveTextContent('não está pronto para revisão');
    expect(screen.queryByRole('region', { name: 'Dados de contato' })).not.toBeInTheDocument();
  });
});
