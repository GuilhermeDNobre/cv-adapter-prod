import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  MAX_SOURCE_DOCUMENT_SIZE_BYTES,
  type ResumeImportResponse,
} from 'schema/contracts/resume-import';
import { ApiError, NetworkError, getResumeImport, uploadSourceDocument } from '../../../lib/api-client';
import ImportacaoPage from './page';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return {
    ...actual,
    uploadSourceDocument: vi.fn(),
    getResumeImport: vi.fn(),
  };
});


const simulated = vi.hoisted(() => {
  class RedirectSignal extends Error {
    readonly location: string;

    constructor(location: string) {
      super(`NEXT_REDIRECT: ${location}`);
      this.name = 'RedirectSignal';
      this.location = location;
    }
  }
  return { RedirectSignal };
});

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string): never => {
    throw new simulated.RedirectSignal(url);
  }),
}));

const mockedUpload = vi.mocked(uploadSourceDocument);
const mockedGet = vi.mocked(getResumeImport);

const IMPORT_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const POLL_INTERVAL_MS = 1500;

function importFixture(
  status: ResumeImportResponse['status'],
  failureReason: ResumeImportResponse['failureReason'] = null,
): ResumeImportResponse {
  return {
    id: IMPORT_ID,
    status,
    failureReason,
    draft: null,
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

async function renderImportacao(
  params: Record<string, string | string[] | undefined> = {},
): Promise<void> {
  render(await ImportacaoPage({ searchParams: Promise.resolve(params) }));
}

function fileInput(): HTMLElement {
  return screen.getByLabelText('Arquivo do currículo');
}

function chooseFile(file: File): void {
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

function chooseSmallPdf(): void {
  chooseFile(new File(['%PDF-1.4 resume'], 'curriculo.pdf', { type: 'application/pdf' }));
}

function submitUpload(): void {
  const form = fileInput().closest('form');
  if (form === null) throw new Error('Expected the upload form to be rendered');
  fireEvent.submit(form);
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Enviar currículo' });
}

async function uploadAndReachStatus(
  next: ResumeImportResponse,
): Promise<void> {
  mockedUpload.mockResolvedValue(importFixture('queued'));
  mockedGet.mockResolvedValue(next);
  await renderImportacao();
  chooseSmallPdf();
  submitUpload();
  await flushPromises();
}

describe('ImportacaoPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mockedUpload.mockReset();
    mockedGet.mockReset();
  });

  it('should render the file field with an associated label', async () => {
    await renderImportacao();

    expect(fileInput()).toHaveAttribute('type', 'file');
  });

  it('should send an upload that carries a vaga to the resume step of that vaga', async () => {
    const jobId = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
    const evaluationId = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';

    const attempt = ImportacaoPage({
      searchParams: Promise.resolve({ vaga: jobId, avaliacao: evaluationId }),
    });

    await expect(attempt).rejects.toMatchObject({
      location: `/curriculo?vaga=${jobId}&avaliacao=${evaluationId}`,
    });
  });

  it('should stay on the resume area upload when no vaga is carried', async () => {
    await renderImportacao({ vaga: '' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Envie o currículo que você já tem' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Avançar para/ })).not.toBeInTheDocument();
  });

  it('should state the accepted formats and the size limit before any attempt', async () => {
    await renderImportacao();

    expect(
      screen.getByText(
        'Formatos aceitos: .pdf, .tex, .latex, .html, .htm. Tamanho máximo: 10 MB.',
      ),
    ).toBeInTheDocument();
    expect(fileInput().getAttribute('aria-describedby')).toBe(
      'source-document-formats-hint',
    );
  });

  it('should disable submit while no file is chosen', async () => {
    await renderImportacao();

    expect(submitButton()).toBeDisabled();
  });

  it('should apply the drag-over state while a file hovers the dropzone', async () => {
    await renderImportacao();
    const dropzone = screen.getByTestId('source-document-dropzone');

    expect(dropzone.className).not.toContain('border-accent');

    fireEvent.dragEnter(dropzone);
    expect(dropzone.className).toContain('border-accent');
    expect(dropzone.className).toContain('bg-accent-soft');

    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toContain('border-accent');
    expect(dropzone.className).not.toContain('bg-accent-soft');
  });

  it('should select the dropped file with the same effect as choosing it through the input', async () => {
    mockedUpload.mockResolvedValue(importFixture('queued'));
    mockedGet.mockResolvedValue(importFixture('queued'));
    await renderImportacao();
    const dropped = new File(['%PDF-1.4 resume'], 'solto.pdf', { type: 'application/pdf' });

    fireEvent.drop(screen.getByTestId('source-document-dropzone'), {
      dataTransfer: { files: [dropped] },
    });

    expect(submitButton()).toBeEnabled();
    submitUpload();
    await flushPromises();

    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(mockedUpload.mock.calls[0]?.[0]).toBe(dropped);
  });

  it('should warn about the size limit before any attempt when the file is too large', async () => {
    await renderImportacao();
    chooseFile(
      new File([new Uint8Array(MAX_SOURCE_DOCUMENT_SIZE_BYTES + 1)], 'gigante.pdf', {
        type: 'application/pdf',
      }),
    );

    expect(screen.getByText(/gigante\.pdf tem mais de 10 MB/)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('should upload the chosen file and announce the queued stage inside an aria-live region', async () => {
    mockedUpload.mockResolvedValue(importFixture('queued'));
    mockedGet.mockResolvedValue(importFixture('queued'));
    await renderImportacao();
    chooseSmallPdf();

    submitUpload();
    await flushPromises();

    expect(mockedUpload).toHaveBeenCalledTimes(1);
    const regions = screen.getAllByRole('status');
    expect(regions.length).toBeGreaterThan(0);
    for (const region of regions) {
      expect(region).toHaveAttribute('aria-live', 'polite');
    }
    expect(regions.map((region) => region.textContent ?? '').join(' ')).toContain('Currículo recebido. Ele está na fila para o processamento.');
    expect(screen.queryByLabelText('Arquivo do currículo')).not.toBeInTheDocument();
  });

  it('should announce the uploading state while the POST is in flight', async () => {
    let resolveUpload: (value: ResumeImportResponse) => void = () => undefined;
    mockedUpload.mockReturnValue(
      new Promise<ResumeImportResponse>((resolve) => {
        resolveUpload = resolve;
      }),
    );
    await renderImportacao();
    chooseSmallPdf();

    submitUpload();
    await flushPromises();

    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('Enviando o arquivo.');

    resolveUpload(importFixture('queued'));
    mockedGet.mockResolvedValue(importFixture('queued'));
    await flushPromises();
    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('fila para o processamento');
  });

  it('should advance the visible progress as the worker reports each stage', async () => {
    mockedUpload.mockResolvedValue(importFixture('queued'));
    mockedGet
      .mockResolvedValueOnce(importFixture('queued'))
      .mockResolvedValueOnce(importFixture('extracting'))
      .mockResolvedValueOnce(importFixture('structuring'))
      .mockResolvedValue(importFixture('ready_for_review'));
    await renderImportacao();
    chooseSmallPdf();
    submitUpload();
    await flushPromises();

    await advanceTimers(POLL_INTERVAL_MS);
    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('Lendo o texto do arquivo.');

    await advanceTimers(POLL_INTERVAL_MS);
    expect(screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' ')).toContain('Organizando as experiências do currículo.',);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(screen.getByRole('heading', { name: 'Currículo lido' })).toBeInTheDocument();
  });

  it('should offer the path to review once the import is ready for review', async () => {
    await uploadAndReachStatus(importFixture('ready_for_review'));

    expect(screen.getByRole('heading', { name: 'Currículo lido' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar o rascunho' })).toHaveAttribute(
      'href',
      `/revisao?resumeImportId=${IMPORT_ID}`,
    );
  });

  it('should say the PDF has no text layer and stay honest about the missing path', async () => {
    await uploadAndReachStatus(importFixture('failed', 'no_text_layer'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('cada página é uma foto');
    expect(alert).toHaveTextContent('não tem camada de texto');
    expect(alert).toHaveTextContent('Ainda não existe caminho para importar um currículo escaneado');
    expect(alert).not.toHaveTextContent('tente de novo');
  });

  it('should name the accepted formats when the worker rejects an unsupported file', async () => {
    await uploadAndReachStatus(importFixture('failed', 'unsupported_format'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não reconhecemos esse arquivo como PDF, LaTeX ou HTML.');
    expect(alert).toHaveTextContent('Envie o currículo em um desses três formatos');
  });

  it('should point at embedded images when the worker says the file is too large', async () => {
    await uploadAndReachStatus(importFixture('failed', 'too_large'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('O arquivo passou do limite de 10 MB.');
    expect(alert).toHaveTextContent('provavelmente há imagens embutidas');
  });

  it('should say the file does not look like a resume when the worker reports not_a_resume', async () => {
    await uploadAndReachStatus(importFixture('failed', 'not_a_resume'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('O arquivo não parece um currículo');
    expect(alert).toHaveTextContent('vagas e outros documentos não funcionam aqui');
  });

  it('should explain the empty extraction when the worker reports extraction_empty', async () => {
    await uploadAndReachStatus(importFixture('failed', 'extraction_empty'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('O arquivo abriu, mas quase nenhum texto veio dele.');
    expect(alert).toHaveTextContent('Gere um novo PDF, LaTeX ou HTML a partir do original');
  });

  it('should let the person start over from a failure with another file', async () => {
    await uploadAndReachStatus(importFixture('failed', 'not_a_resume'));

    fireEvent.click(screen.getByRole('button', { name: 'Enviar outro arquivo' }));

    expect(fileInput()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should map a synchronous 400 format rejection to its own message', async () => {
    mockedUpload.mockRejectedValue(
      new ApiError(400, 'Unsupported file format. Accepted formats: PDF, LaTeX (.tex), HTML.'),
    );
    await renderImportacao();
    chooseSmallPdf();
    submitUpload();
    await flushPromises();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não reconhecemos esse arquivo como PDF, LaTeX ou HTML.');
    expect(fileInput()).toBeInTheDocument();
  });

  it('should map a synchronous 400 size rejection to its own message', async () => {
    mockedUpload.mockRejectedValue(
      new ApiError(400, 'File exceeds the 10485760-byte size limit.'),
    );
    await renderImportacao();
    chooseSmallPdf();
    submitUpload();
    await flushPromises();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('O arquivo passou do limite de 10 MB.');
  });

  it('should say the cv-adapter is not answering when the upload never reaches the API', async () => {
    mockedUpload.mockRejectedValue(new NetworkError());
    await renderImportacao();
    chooseSmallPdf();
    submitUpload();
    await flushPromises();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Não foi possível falar com o cv-adapter, e o arquivo não foi enviado. Confira se ele está rodando (docker compose ps) e tente de novo.',
    );
  });

  it('should say the import was not found when a poll answers 404', async () => {
    mockedUpload.mockResolvedValue(importFixture('queued'));
    mockedGet.mockRejectedValue(new ApiError(404, 'Resume import not found.'));
    await renderImportacao();
    chooseSmallPdf();
    submitUpload();
    await flushPromises();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não encontramos esse envio.');
  });

  it('should say the balance is exhausted when the worker reports ai_balance_exhausted', async () => {
    await uploadAndReachStatus(importFixture('failed', 'ai_balance_exhausted'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('O saldo da sua conta na DeepSeek acabou');
  });

  it('should say the key was rejected when the worker reports ai_key_rejected', async () => {
    await uploadAndReachStatus(importFixture('failed', 'ai_key_rejected'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('A DeepSeek recusou a chave salva');
  });

  it('should say the AI did not answer when the worker reports ai_unavailable', async () => {
    await uploadAndReachStatus(importFixture('failed', 'ai_unavailable'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('A IA não respondeu agora');
  });
});
