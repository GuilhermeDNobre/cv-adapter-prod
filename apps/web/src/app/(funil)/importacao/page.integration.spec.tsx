import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ResumeImportResponse } from 'schema/contracts/resume-import';
import ImportacaoPage from './page';

const API_URL = 'http://localhost:3001';
const IMPORT_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const POLL_INTERVAL_MS = 1500;

const simulated = vi.hoisted(() => ({
  pollNumber: { current: 0 },
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

interface PollStep {
  readonly status: ResumeImportResponse['status'];
  readonly failureReason: ResumeImportResponse['failureReason'];
}

function step(
  status: ResumeImportResponse['status'],
  failureReason: ResumeImportResponse['failureReason'] = null,
): PollStep {
  return { status, failureReason };
}

function pollFixture(stepIndex: number, sequence: readonly PollStep[]): ResumeImportResponse {
  const current = sequence[Math.min(stepIndex, sequence.length - 1)];
  if (current === undefined) throw new Error('Expected a non-empty status sequence');
  return {
    id: IMPORT_ID,
    status: current.status,
    failureReason: current.failureReason,
    draft: null,
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

function stubApiServer(sequence: readonly PollStep[]): void {
  simulated.pollNumber.current = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${API_URL}/resume-imports` && init?.method === 'POST') {
      return apiJson(pollFixture(0, sequence), 202);
    }
    if (url === `${API_URL}/resume-imports/${IMPORT_ID}` && init?.method === 'GET') {
      const answered = simulated.pollNumber.current;
      simulated.pollNumber.current += 1;
      return apiJson(pollFixture(answered, sequence), 200);
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

async function renderUploadScreen(): Promise<void> {
  render(await ImportacaoPage({ searchParams: Promise.resolve({}) }));
}

function chooseSmallPdfAndSubmit(): void {
  const input = screen.getByLabelText('Arquivo do currículo');
  fireEvent.change(input, {
    target: { files: [new File(['%PDF-1.4 resume'], 'curriculo.pdf', { type: 'application/pdf' })] },
  });
  const form = input.closest('form');
  if (form === null) throw new Error('Expected the upload form to be rendered');
  fireEvent.submit(form);
}

describe('ImportacaoPage against a simulated API server', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should walk the queued, extracting and structuring stages and end offering the review', async () => {
    stubApiServer([
      step('queued'),
      step('extracting'),
      step('structuring'),
      step('ready_for_review'),
    ]);
    await renderUploadScreen();

    chooseSmallPdfAndSubmit();
    await flushPromises();
    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('Currículo recebido. Ele está na fila para o processamento.',);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('Lendo o texto do arquivo.');

    await advanceTimers(POLL_INTERVAL_MS);
    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('Organizando as experiências do currículo.',);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(screen.getByRole('heading', { name: 'Currículo lido' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar o rascunho' })).toHaveAttribute(
      'href',
      `/revisao?resumeImportId=${IMPORT_ID}`,
    );
  });

  it('should send the file as multipart form data', async () => {
    stubApiServer([step('queued')]);
    await renderUploadScreen();

    chooseSmallPdfAndSubmit();
    await flushPromises();

    const fetchMock = vi.mocked(fetch);
    const uploadCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === `${API_URL}/resume-imports` && init?.method === 'POST',
    );
    if (uploadCall === undefined) throw new Error('Expected the multipart upload request');
    const [, init] = uploadCall;
    expect(init?.body).toBeInstanceOf(FormData);
    const file = (init?.body as FormData).get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('curriculo.pdf');
  });

  it('should walk the stages and end with the dedicated scanned-PDF message', async () => {
    stubApiServer([step('queued'), step('extracting'), step('failed', 'no_text_layer')]);
    await renderUploadScreen();

    chooseSmallPdfAndSubmit();
    await flushPromises();
    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('fila para o processamento');

    await advanceTimers(POLL_INTERVAL_MS);
    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('Lendo o texto do arquivo.');

    await advanceTimers(POLL_INTERVAL_MS);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('cada página é uma foto');
    expect(alert).toHaveTextContent('não tem camada de texto');
    expect(alert).toHaveTextContent('Ainda não existe caminho para importar um currículo escaneado');
  });

  it('should keep polling the simulated server every 1500ms between stages', async () => {
    stubApiServer([step('queued'), step('extracting'), step('structuring')]);
    await renderUploadScreen();

    chooseSmallPdfAndSubmit();
    await flushPromises();
    const fetchMock = vi.mocked(fetch);
    const pollCount = (): number =>
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url) === `${API_URL}/resume-imports/${IMPORT_ID}` && init?.method === 'GET',
      ).length;
    expect(pollCount()).toBe(1);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(pollCount()).toBe(2);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(pollCount()).toBe(3);
  });
});
