import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CurriculosPage from './page';

const BASE_RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const TAILORED_RESUME_ID = '7b2f5a9d-1c6b-5f7c-9e1b-3a4d6e8f0b12';
const JOB_DESCRIPTION_ID = '11111111-1111-4111-8111-111111111111';

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function baseResumeItem() {
  return {
    id: BASE_RESUME_ID,
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
  };
}

function tailoredResumeItem() {
  return {
    id: TAILORED_RESUME_ID,
    kind: 'tailored',
    name: 'Backend focus',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: BASE_RESUME_ID,
    jobDescriptionId: JOB_DESCRIPTION_ID,
    jobTitle: 'Senior Full Stack Developer',
    generationStatus: 'ready',
    failureReason: null,
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    exports: [],
  };
}

function stubListEndpoint(resumes: unknown[]): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/resumes') && (init?.method ?? 'GET') === 'GET') {
      return apiJson({ resumes }, 200);
    }
    return apiJson({ statusCode: 404, message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('Curriculos page against a simulated API server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should list base and tailored resumes grouped by vacancy over the real HTTP client', async () => {
    stubListEndpoint([baseResumeItem(), tailoredResumeItem()]);
    render(<CurriculosPage />);

    await screen.findByRole('heading', { name: 'Base Resumes' });
    expect(screen.getAllByText('Backend focus')).toHaveLength(2);
    expect(
      screen.getByRole('region', { name: 'Senior Full Stack Developer' }),
    ).toBeInTheDocument();
    const openLinks = screen.getAllByRole('link', { name: 'Abrir' });
    expect(openLinks.map((link) => link.getAttribute('href')).sort()).toEqual(
      [`/curriculos/${BASE_RESUME_ID}`, `/curriculos/${TAILORED_RESUME_ID}`].sort(),
    );
    expect(screen.getByRole('link', { name: 'Criar Base Resume' })).toHaveAttribute(
      'href',
      '/curriculos/novo',
    );
  });

  it('should explain the Base Resume when the server returns an empty list', async () => {
    stubListEndpoint([]);
    render(<CurriculosPage />);

    await screen.findByRole('heading', { name: 'Nenhum currículo ainda' });
    expect(screen.getByRole('link', { name: 'Criar primeiro Base Resume' })).toHaveAttribute(
      'href',
      '/curriculos/novo',
    );
  });

  it('should request the list from the API endpoint', async () => {
    stubListEndpoint([baseResumeItem()]);
    render(<CurriculosPage />);

    await screen.findByRole('heading', { name: 'Base Resumes' });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/resumes',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
