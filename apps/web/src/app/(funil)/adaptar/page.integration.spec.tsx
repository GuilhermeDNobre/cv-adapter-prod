import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AdaptarPage from './page';

const API_URL = 'http://localhost:3001';
const JOB_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
const EVALUATION_ID = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';
const BASE_ID = '7b2f5a9d-1c6b-5f7c-9e1b-3a4d6e8f0b12';
const TAILORED_ID = '8c3a6b0e-2d7c-6a8d-0f2c-4b5e7f9a1b23';

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
  usePathname: () => '/adaptar',
  useSearchParams: () => new URLSearchParams(),
}));

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function baseListBody() {
  return {
    resumes: [
      {
        id: BASE_ID,
        kind: 'base',
        name: 'Backend focus',
        language: 'pt',
        template: 'comfortable',
        lengthTarget: 2,
        writingMethod: 'xyz',
        tone: 'direct',
        baseResumeId: null,
        jobDescriptionId: null,
        jobTitle: null,
        generationStatus: 'ready',
        failureReason: null,
        createdAt: '2026-09-05T10:00:00.000Z',
        updatedAt: '2026-09-05T10:00:00.000Z',
        exports: [],
      },
    ],
  };
}

function stubApiServer(jobLanguage = 'en'): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${API_URL}/resumes` && (init?.method ?? 'GET') === 'GET') {
      return apiJson(baseListBody(), 200);
    }
    if (url === `${API_URL}/job-descriptions/${JOB_ID}` && (init?.method ?? 'GET') === 'GET') {
      return apiJson({ id: JOB_ID, language: jobLanguage, requirements: [] }, 200);
    }
    if (url === `${API_URL}/tailored-resumes` && init?.method === 'POST') {
      return apiJson({ id: TAILORED_ID }, 202);
    }
    return apiJson({ statusCode: 404, message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderAdaptar(
  params: Record<string, string | string[] | undefined>,
): Promise<void> {
  render(await AdaptarPage({ searchParams: Promise.resolve(params) }));
  await flushPromises();
}

describe('AdaptarPage against a simulated API server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    simulated.replace.mockReset();
  });

  it('should ask for the vaga when no ids were carried in', async () => {
    stubApiServer();
    await renderAdaptar({});

    expect(screen.getByText('Informe a vaga para escolher o Base Resume e gerar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colar uma vaga' })).toHaveAttribute('href', '/vaga');
  });

  it('should ask for the avaliacao when only vaga was carried in', async () => {
    stubApiServer();
    await renderAdaptar({ vaga: JOB_ID });

    expect(
      screen.getByText('Conclua a avaliação antes de gerar o Tailored Resume.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para avaliação' })).toHaveAttribute(
      'href',
      `/avaliacao?vaga=${JOB_ID}`,
    );
  });

  it('should list base resumes and generate the tailored over the real HTTP client', async () => {
    stubApiServer();
    await renderAdaptar({ vaga: JOB_ID, avaliacao: EVALUATION_ID });

    const generate = await screen.findByRole('button', {
      name: 'Gerar currículo para esta vaga',
    });
    fireEvent.click(generate);
    await flushPromises();

    const fetchMock = vi.mocked(fetch);
    const tailoredCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === `${API_URL}/tailored-resumes` && init?.method === 'POST',
    );
    if (tailoredCall === undefined) throw new Error('Expected the tailored-resumes request');
    expect(JSON.parse(String(tailoredCall[1]?.body))).toEqual({
      baseResumeId: BASE_ID,
      jobDescriptionId: JOB_ID,
      language: 'en',
    });
    await vi.waitFor(() => {
      expect(simulated.replace).toHaveBeenCalledWith(
        `/revisar/${TAILORED_ID}?vaga=${encodeURIComponent(JOB_ID)}&avaliacao=${encodeURIComponent(EVALUATION_ID)}`,
      );
    });
  });

  it('should offer creating the first base resume inline', async () => {
    stubApiServer();
    await renderAdaptar({ vaga: JOB_ID, avaliacao: EVALUATION_ID });

    expect(
      screen.getByRole('heading', { name: 'Criar novo Base Resume' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome do Base Resume' })).toBeInTheDocument();
  });

  it('should keep the document settings in Adaptar and no other stage panel', async () => {
    stubApiServer();
    await renderAdaptar({ vaga: JOB_ID, avaliacao: EVALUATION_ID });

    expect(screen.getByText('Writing Method')).toBeInTheDocument();
    expect(screen.getByText('Tone')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Exportar PDF' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Cobertura dos Requirements' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Configurações do documento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('O que mudou em relação ao Base Resume')).not.toBeInTheDocument();
  });

  it('should preselect the resume language from the job language', async () => {
    stubApiServer('en');
    await renderAdaptar({ vaga: JOB_ID, avaliacao: EVALUATION_ID });

    const language = await screen.findByLabelText('Idioma do currículo');
    expect(language).toHaveValue('en');
  });

  it('should preselect Portuguese when the job language starts with pt', async () => {
    stubApiServer('pt-BR');
    await renderAdaptar({ vaga: JOB_ID, avaliacao: EVALUATION_ID });

    const language = await screen.findByLabelText('Idioma do currículo');
    expect(language).toHaveValue('pt');
  });

  it('should send the chosen language when generating the tailored resume', async () => {
    stubApiServer('pt-BR');
    await renderAdaptar({ vaga: JOB_ID, avaliacao: EVALUATION_ID });

    const language = await screen.findByLabelText('Idioma do currículo');
    fireEvent.change(language, { target: { value: 'en' } });

    const generate = await screen.findByRole('button', {
      name: 'Gerar currículo para esta vaga',
    });
    fireEvent.click(generate);
    await flushPromises();

    const fetchMock = vi.mocked(fetch);
    const tailoredCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === `${API_URL}/tailored-resumes` && init?.method === 'POST',
    );
    if (tailoredCall === undefined) throw new Error('Expected the tailored-resumes request');
    expect(JSON.parse(String(tailoredCall[1]?.body))).toEqual({
      baseResumeId: BASE_ID,
      jobDescriptionId: JOB_ID,
      language: 'en',
    });
  });
});
