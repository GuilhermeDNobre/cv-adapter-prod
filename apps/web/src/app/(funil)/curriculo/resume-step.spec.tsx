import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ResumeListItem, ResumeListResponse } from 'schema/contracts/resume';
import {
  ApiError,
  NetworkError,
  getCareerProfile,
  getDeepSeekKeyStatus,
  getEvaluationByJobDescription,
  listResumes,
} from '../../../lib/api-client';
import { ResumeStep } from './resume-step';
import CurriculoPage from './page';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return {
    ...actual,
    getCareerProfile: vi.fn(),
    getDeepSeekKeyStatus: vi.fn(),
    getEvaluation: vi.fn(),
    getEvaluationByJobDescription: vi.fn(),
    getResume: vi.fn(),
    getResumeImport: vi.fn(),
    listResumes: vi.fn(),
    uploadSourceDocument: vi.fn(),
  };
});

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
}));

const mockedCareer = vi.mocked(getCareerProfile);
const mockedList = vi.mocked(listResumes);

const JOB_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
const OTHER_JOB_ID = '11111111-1111-4111-8111-111111111111';
const FIRST_BASE_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const SECOND_BASE_ID = '7b2f5a9d-1c6b-4f7c-9e1b-3a4d6e8f0b12';
const TAILORED_ID = '8c3a6b0e-2d7c-4a8d-8f2c-4b5e7f9a1c23';
const EMPTY_PROFILE = { experiences: [], educationEntries: [], evidences: [] };
const notFound = new ApiError(404, undefined, undefined);

function resumeItem(id: string, overrides: Partial<ResumeListItem> = {}): ResumeListItem {
  return {
    id,
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

function savedResumes(): ResumeListResponse {
  return {
    resumes: [
      resumeItem(FIRST_BASE_ID),
      resumeItem(SECOND_BASE_ID, { name: 'Analista de dados', language: 'en', template: 'dense' }),
      resumeItem(TAILORED_ID, {
        kind: 'tailored',
        name: 'Adaptado para outra vaga',
        baseResumeId: FIRST_BASE_ID,
        jobDescriptionId: OTHER_JOB_ID,
        jobTitle: 'Data Engineer',
      }),
    ],
  };
}

async function flush(): Promise<void> {
  await act(async () => {});
}

async function renderStep(initialBaseResumeId?: string): Promise<void> {
  render(<ResumeStep jobDescriptionId={JOB_ID} initialBaseResumeId={initialBaseResumeId} />);
  await flush();
}

function advanceLink(): HTMLElement {
  return screen.getByRole('link', { name: /Avançar para Avaliação/ });
}

describe('ResumeStep', () => {
  beforeEach(() => {
    vi.mocked(getDeepSeekKeyStatus).mockResolvedValue({ configured: true, lastFour: '1234' });
    vi.mocked(getEvaluationByJobDescription).mockRejectedValue(notFound);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockedCareer.mockReset();
    mockedList.mockReset();
  });

  it('should announce the loading state while the saved resumes are fetched', async () => {
    mockedCareer.mockReturnValue(new Promise<never>(() => undefined));
    mockedList.mockReturnValue(new Promise<never>(() => undefined));
    await renderStep();

    const regions = screen.getAllByRole('status').map((region) => region.textContent ?? '');
    expect(regions).toContain('Carregando seus currículos.');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Arquivo do currículo')).not.toBeInTheDocument();
  });

  it('should list only the Base Resumes and preselect the first one', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue(savedResumes());
    await renderStep();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Backend focus' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Analista de dados' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Backend focus' })).toHaveAccessibleDescription(
      'Português · Template Confortável · Criado em 05/09/2026',
    );
    expect(screen.queryByText('Adaptado para outra vaga')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Base Resume de partida' })).toBeInTheDocument();
  });

  it('should advance to the evaluation carrying the vaga and the preselected Base Resume', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue(savedResumes());
    await renderStep();

    expect(advanceLink()).toHaveAttribute('href', `/avaliacao?vaga=${JOB_ID}&base=${FIRST_BASE_ID}`);
  });

  it('should start from the Base Resume carried in the URL', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue(savedResumes());
    await renderStep(SECOND_BASE_ID);

    expect(screen.getByRole('radio', { name: 'Analista de dados' })).toBeChecked();
    expect(advanceLink()).toHaveAttribute('href', `/avaliacao?vaga=${JOB_ID}&base=${SECOND_BASE_ID}`);
  });

  it('should fall back to the first Base Resume when the carried one no longer exists', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue(savedResumes());
    await renderStep('99999999-9999-4999-8999-999999999999');

    expect(screen.getByRole('radio', { name: 'Backend focus' })).toBeChecked();
  });

  it('should keep the chosen Base Resume in the URL and in the advance link', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue(savedResumes());
    await renderStep();

    fireEvent.click(screen.getByRole('radio', { name: 'Analista de dados' }));
    await flush();

    expect(screen.getByRole('radio', { name: 'Analista de dados' })).toBeChecked();
    expect(simulated.replace).toHaveBeenCalledWith(
      `/curriculo?vaga=${JOB_ID}&base=${SECOND_BASE_ID}`,
      { scroll: false },
    );
    expect(advanceLink()).toHaveAttribute('href', `/avaliacao?vaga=${JOB_ID}&base=${SECOND_BASE_ID}`);
  });

  it('should show the generation status of a Base Resume that is not ready', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue({
      resumes: [resumeItem(FIRST_BASE_ID, { generationStatus: 'generating' })],
    });
    await renderStep();

    expect(screen.getByRole('radio', { name: 'Backend focus' })).toHaveAccessibleDescription(
      'Português · Template Confortável · Criado em 05/09/2026 · Gerando',
    );
  });

  it('should keep the upload behind a disclosure when there are saved resumes', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue(savedResumes());
    await renderStep();

    const toggle = screen.getByRole('button', { name: 'Enviar um currículo novo' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Arquivo do currículo')).not.toBeVisible();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Arquivo do currículo')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar currículo' })).toBeInTheDocument();
  });

  it('should say nothing is saved and open the upload when there is no career profile', async () => {
    mockedCareer.mockRejectedValue(notFound);
    mockedList.mockResolvedValue({ resumes: [] });
    await renderStep();

    expect(screen.getByText(/Você ainda não tem currículo salvo/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Envie o currículo que você já tem' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Arquivo do currículo')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar um currículo novo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Avançar para Avaliação/ })).toBeDisabled();
    expect(screen.getByText('Envie o currículo e confirme a revisão para continuar.')).toBeInTheDocument();
  });

  it('should let the person advance with the career profile when no Base Resume is saved', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue({ resumes: [] });
    await renderStep();

    expect(screen.getByText(/Seu Career Profile está pronto, mas ainda não há Base Resume/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar um currículo novo' })).toBeInTheDocument();
    expect(advanceLink()).toHaveAttribute('href', `/avaliacao?vaga=${JOB_ID}`);
  });

  it('should explain the failure without the payload and load again on retry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockRejectedValueOnce(new NetworkError()).mockResolvedValue(savedResumes());
    await renderStep();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar seus currículos.');
    expect(errorSpy).toHaveBeenCalledWith('resume_step.load_failed', { status: null });

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await flush();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Backend focus' })).toBeChecked();
    errorSpy.mockRestore();
  });

  it('should report a failed career profile read as a load failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedCareer.mockRejectedValue(new ApiError(500, 'boom', { message: 'boom' }));
    mockedList.mockResolvedValue(savedResumes());
    await renderStep();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar seus currículos.');
    expect(errorSpy).toHaveBeenCalledWith('resume_step.load_failed', { status: 500 });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('boom');
    errorSpy.mockRestore();
  });
});

describe('CurriculoPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockedCareer.mockReset();
    mockedList.mockReset();
  });

  it('should read the flow ids from the URL and render the resume step', async () => {
    vi.mocked(getDeepSeekKeyStatus).mockResolvedValue({ configured: true, lastFour: '1234' });
    vi.mocked(getEvaluationByJobDescription).mockRejectedValue(notFound);
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    mockedList.mockResolvedValue(savedResumes());

    render(
      await CurriculoPage({
        searchParams: Promise.resolve({ vaga: JOB_ID, base: SECOND_BASE_ID }),
      }),
    );
    await flush();

    expect(screen.getByRole('heading', { level: 1, name: 'Escolha o currículo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Analista de dados' })).toBeChecked();
    expect(advanceLink()).toHaveAttribute('href', `/avaliacao?vaga=${JOB_ID}&base=${SECOND_BASE_ID}`);
  });
});
