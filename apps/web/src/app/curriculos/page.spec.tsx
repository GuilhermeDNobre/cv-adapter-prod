import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ResumeListItem } from 'schema/contracts/resume';
import { ApiError, deleteResume, downloadResumeExport, listResumes } from '../../lib/api-client';
import CurriculosPage from './page';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, listResumes: vi.fn(), deleteResume: vi.fn(), downloadResumeExport: vi.fn() };
});

const mockedListResumes = vi.mocked(listResumes);
const mockedDeleteResume = vi.mocked(deleteResume);
const mockedDownloadExport = vi.mocked(downloadResumeExport);

const BASE_RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const TAILORED_ONE_ID = '7b2f5a9d-1c6b-5f7c-9e1b-3a4d6e8f0b12';
const TAILORED_TWO_ID = '8c3a6b0e-2d7c-6a8d-0f2c-4b5e7f9a1c23';
const JOB_ONE_ID = '11111111-1111-4111-8111-111111111111';
const JOB_TWO_ID = '22222222-2222-4222-8222-222222222222';

function baseResume(overrides: Partial<ResumeListItem> = {}): ResumeListItem {
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
    ...overrides,
  };
}

function tailoredResume(
  id: string,
  jobDescriptionId: string,
  overrides: Partial<ResumeListItem> = {},
): ResumeListItem {
  return {
    id,
    kind: 'tailored',
    name: 'Backend focus',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: BASE_RESUME_ID,
    jobDescriptionId,
    jobTitle: 'Senior Full Stack Developer',
    generationStatus: 'ready',
    failureReason: null,
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    exports: [],
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('CurriculosPage', () => {
  afterEach(() => {
    mockedListResumes.mockReset();
    mockedDeleteResume.mockReset();
    mockedDownloadExport.mockReset();
  });

  it('should announce loading inside an aria-live region while fetching', async () => {
    let resolveList: (value: { resumes: ResumeListItem[] }) => void = () => undefined;
    mockedListResumes.mockReturnValue(
      new Promise<{ resumes: ResumeListItem[] }>((resolve) => {
        resolveList = resolve;
      }),
    );
    render(<CurriculosPage />);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Carregando currículos.');

    resolveList({ resumes: [] });
    await flushPromises();
  });

  it('should explain the Base Resume and link to the creation screen when empty', async () => {
    mockedListResumes.mockResolvedValue({ resumes: [] });
    render(<CurriculosPage />);
    await flushPromises();

    expect(
      screen.getByRole('heading', { name: 'Nenhum currículo ainda' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/seleção curada do seu Career Profile/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar primeiro Base Resume' })).toHaveAttribute(
      'href',
      '/curriculos/novo',
    );
  });

  it('should list base resumes with an open link to each document', async () => {
    mockedListResumes.mockResolvedValue({ resumes: [baseResume()] });
    render(<CurriculosPage />);
    await flushPromises();

    expect(screen.getByText('Backend focus')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir' })).toHaveAttribute(
      'href',
      `/curriculos/${BASE_RESUME_ID}`,
    );
  });

  it('should group tailored resumes by job title without the uuid', async () => {
    mockedListResumes.mockResolvedValue({
      resumes: [
        baseResume(),
        tailoredResume(TAILORED_ONE_ID, JOB_ONE_ID, { jobTitle: 'Senior Full Stack Developer' }),
        tailoredResume(TAILORED_TWO_ID, JOB_TWO_ID, { jobTitle: 'Data Engineer' }),
      ],
    });
    render(<CurriculosPage />);
    await flushPromises();

    const firstGroup = screen.getByRole('region', { name: 'Senior Full Stack Developer' });
    const secondGroup = screen.getByRole('region', { name: 'Data Engineer' });
    expect(firstGroup).toBeInTheDocument();
    expect(secondGroup).toBeInTheDocument();
    expect(screen.queryByText(JOB_ONE_ID)).toBeNull();
    expect(screen.queryByText(JOB_TWO_ID)).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Tailored Resumes por vaga' }),
    ).toBeInTheDocument();
  });

  it('should keep two tailored resumes of the same vacancy in one group', async () => {
    mockedListResumes.mockResolvedValue({
      resumes: [
        tailoredResume(TAILORED_ONE_ID, JOB_ONE_ID, { name: 'First try' }),
        tailoredResume(TAILORED_TWO_ID, JOB_ONE_ID, { name: 'Second try' }),
      ],
    });
    render(<CurriculosPage />);
    await flushPromises();

    const groups = screen.getAllByRole('region', { name: 'Senior Full Stack Developer' });
    expect(groups).toHaveLength(1);
    expect(screen.getByText('First try')).toBeInTheDocument();
    expect(screen.getByText('Second try')).toBeInTheDocument();
  });

  it('should download the last pdf when the item has exports', async () => {
    mockedListResumes.mockResolvedValue({
      resumes: [
        baseResume({
          exports: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              pageCount: 1,
              createdAt: '2026-09-07T10:00:00.000Z',
            },
          ],
        }),
      ],
    });
    mockedDownloadExport.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    render(<CurriculosPage />);
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Baixar último PDF' }));
    await flushPromises();

    expect(mockedDownloadExport).toHaveBeenCalled();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    mockedDownloadExport.mockReset();
  });

  it('should delete the item with confirmation and focus on Cancelar', async () => {
    mockedListResumes.mockResolvedValue({ resumes: [baseResume()] });
    mockedDeleteResume.mockResolvedValue(undefined);
    render(<CurriculosPage />);
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar apagar currículo' }));
    await flushPromises();

    expect(mockedDeleteResume).toHaveBeenCalledWith(BASE_RESUME_ID);
    mockedDeleteResume.mockReset();
  });

  it('should announce generation progress while a resume is being written', async () => {
    mockedListResumes.mockResolvedValue({
      resumes: [baseResume({ generationStatus: 'generating' })],
    });
    render(<CurriculosPage />);
    await flushPromises();

    expect(screen.getByText('Gerando 1 currículo.')).toBeInTheDocument();
    expect(screen.getByText('Gerando')).toBeInTheDocument();
  });

  it('should show the AI message for the received failure code', async () => {
    mockedListResumes.mockResolvedValue({
      resumes: [
        baseResume({ generationStatus: 'failed', failureReason: 'ai_key_rejected' }),
      ],
    });
    render(<CurriculosPage />);
    await flushPromises();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('A DeepSeek recusou a chave salva');
  });

  it('should show the export count with the last export date', async () => {
    mockedListResumes.mockResolvedValue({
      resumes: [
        baseResume({
          exports: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              pageCount: 2,
              createdAt: '2026-09-07T10:00:00.000Z',
            },
          ],
        }),
      ],
    });
    render(<CurriculosPage />);
    await flushPromises();

    expect(screen.getByText(/1 exportação/)).toBeInTheDocument();
  });

  it('should offer a retry when the list cannot be reached', async () => {
    mockedListResumes.mockRejectedValueOnce(new Error('network down'));
    mockedListResumes.mockResolvedValueOnce({ resumes: [baseResume()] });
    render(<CurriculosPage />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os currículos.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await flushPromises();

    expect(screen.getByText('Backend focus')).toBeInTheDocument();
  });

  it('should keep the AI failure payload out of the generic unreachable message', async () => {
    mockedListResumes.mockRejectedValueOnce(new ApiError(503, 'Service Unavailable'));
    render(<CurriculosPage />);
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('docker compose ps');
  });
});
