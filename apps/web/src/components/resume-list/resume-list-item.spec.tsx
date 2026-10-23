import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ResumeListItem } from 'schema/contracts/resume';
import { deleteResume, downloadResumeExport } from '../../lib/api-client';
import { ResumeListItemView } from './resume-list-item';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, deleteResume: vi.fn(), downloadResumeExport: vi.fn() };
});

const mockedDelete = vi.mocked(deleteResume);
const mockedDownload = vi.mocked(downloadResumeExport);

const BASE_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const EXPORT_ID = '33333333-3333-4333-8333-333333333333';

function resumeFixture(overrides: Partial<ResumeListItem> = {}): ResumeListItem {
  return {
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
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('ResumeListItemView', () => {
  it('should download the last export without showing a uuid', async () => {
    const resume = resumeFixture({ exports: [{ id: EXPORT_ID, pageCount: 1, createdAt: '2026-09-07T10:00:00.000Z' }] });
    mockedDownload.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    render(<ResumeListItemView resume={resume} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Baixar último PDF' }));
    await flushPromises();

    expect(mockedDownload).toHaveBeenCalledWith(EXPORT_ID);
    expect(screen.queryByText(EXPORT_ID)).toBeNull();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    mockedDownload.mockReset();
  });

  it('should download with the readable resume filename', async () => {
    const resume = resumeFixture({
      name: 'Currículo São Paulo',
      exports: [{ id: EXPORT_ID, pageCount: 1, createdAt: '2026-09-07T10:00:00.000Z' }],
    });
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
    render(<ResumeListItemView resume={resume} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Baixar último PDF' }));
    await flushPromises();

    expect(capturedDownload).toBe('curriculo-curriculo-sao-paulo.pdf');
    clickSpy.mockRestore();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    mockedDownload.mockReset();
  });

  it('should hide the download button without exports', async () => {
    render(<ResumeListItemView resume={resumeFixture()} onDeleted={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Baixar último PDF' })).toBeNull();
  });

  it('should confirm deletion with focus on Cancelar and notify the list', async () => {
    const onDeleted = vi.fn();
    mockedDelete.mockResolvedValue(undefined);
    render(<ResumeListItemView resume={resumeFixture()} onDeleted={onDeleted} />);

    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar apagar currículo' }));
    await flushPromises();

    expect(mockedDelete).toHaveBeenCalledWith(BASE_ID);
    expect(onDeleted).toHaveBeenCalledWith(BASE_ID);
    mockedDelete.mockReset();
  });
});
