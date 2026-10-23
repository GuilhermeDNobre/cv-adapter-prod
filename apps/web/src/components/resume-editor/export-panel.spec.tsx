import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ResumeExportSummary, ResumeListResponse } from 'schema/contracts/resume';
import {
  ApiError,
  NetworkError,
  downloadResumeExport,
  exportResume,
  listResumes,
  updateResumeSettings,
} from '../../lib/api-client';
import { ExportPanel } from './export-panel';
import {
  RESUME_ID,
  assumedBulletFixture,
  experienceEntryFixture,
  experienceSectionFixture,
  resumeDocumentFixture,
  summarySectionFixture,
} from './editor-fixtures';

function documentWithoutReview() {
  const cleanExperience = {
    ...experienceSectionFixture(),
    entries: [experienceEntryFixture([assumedBulletFixture()])],
  };
  return resumeDocumentFixture({ sections: [summarySectionFixture(), cleanExperience] });
}

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    downloadResumeExport: vi.fn(),
    exportResume: vi.fn(),
    listResumes: vi.fn(),
    updateResumeSettings: vi.fn(),
  };
});

const mockedExport = vi.mocked(exportResume);
const mockedDownload = vi.mocked(downloadResumeExport);
const mockedList = vi.mocked(listResumes);
const mockedSettings = vi.mocked(updateResumeSettings);
const onDocumentChange = vi.fn();

const EXPORT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function listResponseWith(exports: readonly ResumeExportSummary[]): ResumeListResponse {
  return {
    resumes: [
      {
        id: RESUME_ID,
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
        exports: [...exports],
      },
    ],
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('ExportPanel', () => {
  afterEach(() => {
    mockedExport.mockReset();
    mockedDownload.mockReset();
    mockedList.mockReset();
    mockedSettings.mockReset();
    onDocumentChange.mockReset();
  });

  it('should warn about the overflow before exporting and offer the dense template', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    render(
      <ExportPanel
        resume={resumeDocumentFixture()}
        pageCount={3}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();

    expect(screen.getByText(/Aviso de estouro/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Usar Template denso' }),
    ).toBeInTheDocument();
  });

  it('should export and offer the fresh pdf for download', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    mockedExport.mockResolvedValue({
      exportId: EXPORT_ID,
      pageCount: 2,
      exceedsLengthTarget: false,
    });
    render(
      <ExportPanel
        resume={documentWithoutReview()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await flushPromises();

    expect(mockedExport).toHaveBeenCalledWith(RESUME_ID);
    expect(screen.getByRole('status')).toHaveTextContent('PDF exportado.');
    expect(
      screen.getByRole('button', { name: 'Baixar PDF exportado' }),
    ).toBeInTheDocument();
  });

  it('should warn how many bullets need review and where before exporting', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    render(
      <ExportPanel
        resume={resumeDocumentFixture()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();

    expect(screen.getByText(/1 Bullet precisa de revisão/)).toBeInTheDocument();
    expect(screen.getByText(/em Experience/)).toBeInTheDocument();
  });

  it('should ask for confirmation before exporting with review bullets', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    mockedExport.mockResolvedValue({
      exportId: EXPORT_ID,
      pageCount: 2,
      exceedsLengthTarget: false,
    });
    render(
      <ExportPanel
        resume={resumeDocumentFixture()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await flushPromises();

    expect(mockedExport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmar exportação' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exportação' }));
    await flushPromises();

    expect(mockedExport).toHaveBeenCalledWith(RESUME_ID);
    expect(screen.getByRole('status')).toHaveTextContent('PDF exportado.');
  });

  it('should report the server overflow after exporting without hiding the error', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    mockedExport.mockResolvedValue({
      exportId: EXPORT_ID,
      pageCount: 3,
      exceedsLengthTarget: true,
    });
    render(
      <ExportPanel
        resume={documentWithoutReview()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent(/passa do Length Target/);
  });

  it('should switch to the dense template from the overflow warning', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    const nextDocument = { ...resumeDocumentFixture(), template: 'dense' as const };
    mockedSettings.mockResolvedValue(nextDocument);
    render(
      <ExportPanel
        resume={resumeDocumentFixture()}
        pageCount={3}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Usar Template denso' }));
    await flushPromises();

    expect(mockedSettings).toHaveBeenCalledWith(RESUME_ID, { template: 'dense' });
    expect(onDocumentChange).toHaveBeenCalledWith(nextDocument);
  });

  it('should list previous exports with a download action each', async () => {
    mockedList.mockResolvedValue(
      listResponseWith([{ id: EXPORT_ID, pageCount: 2, createdAt: '2026-09-06T10:00:00.000Z' }]),
    );
    mockedDownload.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    render(
      <ExportPanel
        resume={resumeDocumentFixture()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );

    await screen.findByRole('button', { name: 'Baixar de novo' });

    fireEvent.click(screen.getByRole('button', { name: 'Baixar de novo' }));
    await flushPromises();

    expect(mockedDownload).toHaveBeenCalledWith(EXPORT_ID);
  });

  it('should download with the readable resume filename', async () => {
    mockedList.mockResolvedValue(
      listResponseWith([{ id: EXPORT_ID, pageCount: 2, createdAt: '2026-09-06T10:00:00.000Z' }]),
    );
    mockedDownload.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    let capturedDownload = '';
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        capturedDownload = this.download;
      });
    render(
      <ExportPanel
        resume={resumeDocumentFixture()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );

    await screen.findByRole('button', { name: 'Baixar de novo' });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar de novo' }));
    await flushPromises();

    expect(capturedDownload).toBe('curriculo-backend-focus.pdf');
    clickSpy.mockRestore();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  it('should show the case message on a 422 still generating instead of the docker hint', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    mockedExport.mockRejectedValue(new ApiError(422, 'Resume is still generating.'));
    render(
      <ExportPanel
        resume={documentWithoutReview()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await flushPromises();
    expect(screen.getByRole('alert')).toHaveTextContent('O currículo ainda está sendo gerado.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('docker compose ps');
  });

  it('should show the case message on a 422 generation failed instead of the docker hint', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    mockedExport.mockRejectedValue(new ApiError(422, 'Resume generation failed.'));
    render(
      <ExportPanel
        resume={documentWithoutReview()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await flushPromises();
    expect(screen.getByRole('alert')).toHaveTextContent('A última geração falhou; gere de novo antes de exportar.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('docker compose ps');
  });

  it('should keep the docker hint for a network failure', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    mockedExport.mockRejectedValue(new NetworkError());
    render(
      <ExportPanel
        resume={documentWithoutReview()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await flushPromises();
    expect(screen.getByRole('alert')).toHaveTextContent('docker compose ps');
  });

  it('should keep the docker hint for a 5xx failure', async () => {
    mockedList.mockResolvedValue(listResponseWith([]));
    mockedExport.mockRejectedValue(new ApiError(500, 'boom'));
    render(
      <ExportPanel
        resume={documentWithoutReview()}
        pageCount={2}
        onDocumentChange={onDocumentChange}
      />,
    );
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await flushPromises();
    expect(screen.getByRole('alert')).toHaveTextContent('docker compose ps');
  });
});
