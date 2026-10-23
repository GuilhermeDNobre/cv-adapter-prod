import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JobDescriptionResponse } from 'schema/contracts/job-description';
import PasteJobDescriptionPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/vaga',
  useSearchParams: () => new URLSearchParams(),
}));

const NOT_A_JOB_API_MESSAGE =
  'The text does not look like a job advertisement. Paste the full text of a real job posting and try again.';

const jobDescriptionFixture: JobDescriptionResponse = {
  id: '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01',
  language: 'en',
  requirements: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      literalTerm: '5+ years of TypeScript',
      concept: 'Senior TypeScript experience',
      normalizedConcept: 'typescript',
      kind: 'mandatory',
      ordinal: 0,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      literalTerm: 'Open-source contributions',
      concept: 'Public repository activity',
      normalizedConcept: 'open source',
      kind: 'desirable',
      ordinal: 1,
    },
  ],
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
    if (!url.endsWith('/job-descriptions') || init?.method !== 'POST') {
      return apiJson({ statusCode: 404, message: 'Not found' }, 404);
    }
    const body = JSON.parse(String(init.body)) as { text: string };
    if (!body.text.includes('TypeScript')) {
      return apiJson({ statusCode: 422, message: NOT_A_JOB_API_MESSAGE }, 422);
    }
    return apiJson(jobDescriptionFixture, 200);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function pasteAndSubmit(text: string): void {
  const field = screen.getByRole('textbox', { name: 'Anúncio da vaga' });
  fireEvent.change(field, { target: { value: text } });
  const form = field.closest('form');
  if (form === null) throw new Error('Expected the paste form to be rendered');
  fireEvent.submit(form);
}

describe('Paste job page against a simulated API server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should walk paste to submit to grouped requirements over the real HTTP client', async () => {
    stubApiServer();
    render(<PasteJobDescriptionPage />);

    pasteAndSubmit('Vaga sênior: 5+ years of TypeScript required.');

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    expect(screen.getByText('5+ years of TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Open-source contributions')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Enviar currículo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Colar outra vaga' })).toBeInTheDocument();
  });

  it('should advance to avaliacao through the wizard footer with the vaga id', async () => {
    stubApiServer();
    render(<PasteJobDescriptionPage />);

    pasteAndSubmit('Vaga sênior: 5+ years of TypeScript required.');

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    expect(screen.queryByRole('link', { name: 'Continuar para avaliação' })).not.toBeInTheDocument();
  });

  it('should not offer the next step when the text was rejected as not a job', async () => {
    stubApiServer();
    render(<PasteJobDescriptionPage />);

    pasteAndSubmit('bom dia, tudo bem?');

    await screen.findByRole('alert');
    expect(screen.queryByRole('link', { name: 'Continuar para avaliação' })).toBeNull();
  });

  it('should paste, submit and show the dedicated not-a-job rejection on a 422', async () => {
    stubApiServer();
    render(<PasteJobDescriptionPage />);

    pasteAndSubmit('bom dia, tudo bem?');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não encontramos uma vaga de emprego nesse texto.');
    expect(alert).toHaveTextContent('Cole o anúncio completo de uma vaga real e tente de novo.');
    expect(screen.getByRole('textbox', { name: 'Anúncio da vaga' })).toHaveValue(
      'bom dia, tudo bem?',
    );
  });

  it('should send the request to the API with the pasted text', async () => {
    stubApiServer();
    render(<PasteJobDescriptionPage />);

    pasteAndSubmit('Vaga com 5+ years of TypeScript.');

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    const fetchMock = vi.mocked(fetch);
    const jobCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/job-descriptions') && init?.method === 'POST',
    );
    if (jobCall === undefined) throw new Error('Expected the job-descriptions request');
    expect(JSON.parse(String(jobCall[1]?.body))).toEqual({
      text: 'Vaga com 5+ years of TypeScript.',
    });
  });
});
