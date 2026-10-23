import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ResumeImportResponse } from 'schema/contracts/resume-import';
import { getResumeImport } from '../../../lib/api-client';
import RevisaoPage from './page';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return { ...actual, getResumeImport: vi.fn() };
});

const mockedGet = vi.mocked(getResumeImport);

const IMPORT_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';

function readyImport(): ResumeImportResponse {
  return {
    id: IMPORT_ID,
    status: 'ready_for_review',
    failureReason: null,
    draft: {
      contactDetails: {
        fullName: 'Ana Souza',
        email: 'ana@exemplo.com',
        phone: '(11) 91234-5678',
        links: null,
      },
      experiences: [
        { company: 'Acme Tecnologia', role: 'Analista de dados', startedOn: '03/2021', endedOn: null },
      ],
      education: [],
      evidences: [{ statement: 'Automatizei relatórios em Python.' }],
    },
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderRevisao(
  params: Record<string, string | string[] | undefined>,
): Promise<void> {
  render(await RevisaoPage({ searchParams: Promise.resolve(params) }));
  await flushPromises();
}

describe('RevisaoPage', () => {
  beforeEach(() => {
    mockedGet.mockResolvedValue(readyImport());
  });

  afterEach(() => {
    mockedGet.mockReset();
  });

  it('should load the draft identified by the resumeImportId query string', async () => {
    await renderRevisao({ resumeImportId: IMPORT_ID });

    expect(mockedGet).toHaveBeenCalledWith(IMPORT_ID);
    expect(
      screen.getByRole('region', { name: 'Dados de contato' }),
    ).toBeInTheDocument();
  });

  it('should show its own message when the query string carries no resumeImportId', async () => {
    await renderRevisao({});

    expect(mockedGet).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Não encontramos esse rascunho');
    expect(screen.queryByRole('region', { name: 'Dados de contato' })).not.toBeInTheDocument();
  });
});
