import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ExportarPage from './page';
import {
  RESUME_ID,
  resumeDocumentFixture,
} from '../../../../components/resume-editor/editor-fixtures';

const API_URL = 'http://localhost:3001';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => `/exportar/${RESUME_ID}`,
  useSearchParams: () => new URLSearchParams(),
}));

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubApiServer(document: unknown, reevaluation?: unknown, reevaluationStatus = 200): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${API_URL}/resumes/${RESUME_ID}` && (init?.method ?? 'GET') === 'GET') {
      return apiJson(document, 200);
    }
    if (url === `${API_URL}/resumes/${RESUME_ID}/evaluations/latest` && (init?.method ?? 'GET') === 'GET') {
      if (reevaluation === undefined) {
        return apiJson({ statusCode: 404, message: 'Not found' }, 404);
      }
      return apiJson(reevaluation, reevaluationStatus);
    }
    if (url === `${API_URL}/resumes/${RESUME_ID}/evaluations` && init?.method === 'POST') {
      return apiJson(reevaluation ?? { statusCode: 404, message: 'Not found' }, reevaluation === undefined ? 404 : 202);
    }
    return apiJson({ statusCode: 404, message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function tailoredWithJob(): unknown {
  return { ...resumeDocumentFixture(), jobDescriptionId: 'aaaaaaa1-1111-4111-8111-111111111111' };
}

function readyReevaluation(): unknown {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    status: 'ready',
    matchScore: 100,
    failureReason: null,
    resumeId: RESUME_ID,
    requirementCoverages: [],
    baseline: { id: '44444444-4444-4444-8444-444444444444', matchScore: 75, requirementCoverages: [] },
    comparisons: [
      {
        requirementId: '11111111-1111-4111-8111-111111111111',
        literalTerm: 'Kubernetes',
        kind: 'mandatory',
        coverageBefore: 'gap',
        coverageAfter: 'covered',
        improved: true,
      },
      {
        requirementId: '22222222-2222-4222-8222-222222222222',
        literalTerm: 'TypeScript',
        kind: 'desirable',
        coverageBefore: 'gap',
        coverageAfter: 'gap',
        improved: false,
      },
    ],
    createdAt: '2026-09-05T11:00:00.000Z',
    updatedAt: '2026-09-05T11:00:00.000Z',
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderExportar(): Promise<void> {
  render(
    await ExportarPage({
      params: Promise.resolve({ resumeId: RESUME_ID }),
      searchParams: Promise.resolve({}),
    }),
  );
  await flushPromises();
}

describe('ExportarPage against a simulated API server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should load the preview with the export panel', async () => {
    stubApiServer(resumeDocumentFixture());
    await renderExportar();

    expect(await screen.findByRole('heading', { name: 'Exportar' })).toBeInTheDocument();
    expect(screen.getByTitle('Pré-visualização do currículo')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Exportar PDF' })).toBeInTheDocument();
  });

  it('should show the saving progress as 3 de 3 while generating', async () => {
    stubApiServer({
      ...resumeDocumentFixture({ generationStatus: 'generating' }),
      generationStep: 'saving',
    });
    await renderExportar();

    const texts = await screen.findAllByRole('status').then((regions) =>
      regions.map((region) => region.textContent ?? ''),
    );
    expect(texts.some((text) => text.includes('Salvando o currículo'))).toBe(true);
    expect(texts.some((text) => text.includes('3 de 3'))).toBe(true);
  });

  it('should keep only the export panel with the page warning in Exportar', async () => {
    stubApiServer(resumeDocumentFixture());
    await renderExportar();

    await screen.findByRole('region', { name: 'Exportar PDF' });
    expect(
      screen.queryByRole('region', { name: 'Cobertura dos Requirements' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Configurações do documento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('O que mudou em relação ao Base Resume')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cobertura' })).not.toBeInTheDocument();
  });

  it('should show compatibility scores with download still enabled', async () => {
    stubApiServer(tailoredWithJob(), readyReevaluation());
    await renderExportar();
    expect((await screen.findAllByText('Compatibilidade: 75% → 100%')).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Melhorou' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ainda falta' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Exportar PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).not.toBeDisabled();
  });

  it('should keep download enabled while the reevaluation is loading', async () => {
    stubApiServer(tailoredWithJob(), {
      ...(readyReevaluation() as Record<string, unknown>),
      status: 'queued',
      matchScore: null,
    });
    await renderExportar();
    expect((await screen.findAllByText('Avaliação do currículo em andamento.')).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Exportar PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).not.toBeDisabled();
  });

  it('should keep download enabled when the reevaluation fails', async () => {
    stubApiServer(tailoredWithJob());
    await renderExportar();
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Exportar PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).not.toBeDisabled();
  });
});
