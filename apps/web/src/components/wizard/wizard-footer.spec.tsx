import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { WizardFooter } from './wizard-footer';
import {
  ApiError,
  getCareerProfile,
  getDeepSeekKeyStatus,
  getEvaluation,
  getEvaluationByJobDescription,
  getResume,
  listResumes,
} from '../../lib/api-client';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    getCareerProfile: vi.fn(),
    getEvaluation: vi.fn(),
    getEvaluationByJobDescription: vi.fn(),
    getResume: vi.fn(),
    getResumeImport: vi.fn(),
    getDeepSeekKeyStatus: vi.fn(),
    listResumes: vi.fn(),
  };
});

const mockedCareer = vi.mocked(getCareerProfile);
const mockedEvaluation = vi.mocked(getEvaluation);
const mockedEvaluationByJob = vi.mocked(getEvaluationByJobDescription);
const mockedResume = vi.mocked(getResume);
const mockedKey = vi.mocked(getDeepSeekKeyStatus);
const mockedList = vi.mocked(listResumes);

const JOB_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
const EVALUATION_ID = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';
const BASE_ID = '8c3a6b0e-2d7c-4a8d-8f2c-4b5e7f9a1c23';

async function flush(): Promise<void> {
  await act(async () => {});
}

describe('WizardFooter', () => {
  beforeEach(() => {
    mockedEvaluationByJob.mockRejectedValue(new ApiError(404, undefined, undefined));
    mockedList.mockRejectedValue(new ApiError(404, undefined, undefined));
  });

  afterEach(() => {
    mockedCareer.mockReset();
    mockedEvaluation.mockReset();
    mockedEvaluationByJob.mockReset();
    mockedResume.mockReset();
    mockedKey.mockReset();
    mockedList.mockReset();
  });

  it('should disable advance and expose the reason by aria-describedby', async () => {
    mockedCareer.mockRejectedValue(new Error('no profile'));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(<WizardFooter current="vaga" ids={{}} />);
    await flush();

    const advance = screen.getByRole('button', { name: /Avançar para/ });
    expect(advance).toBeDisabled();
    const describedBy = advance.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    if (describedBy !== null) {
      const reason = document.getElementById(describedBy);
      expect(reason?.textContent).toMatch(/Cole o anúncio/);
    }
  });

  it('should enable advance from vaga to the resume step with vaga in the href', async () => {
    mockedCareer.mockRejectedValue(new Error('no profile'));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(<WizardFooter current="vaga" ids={{ jobDescriptionId: JOB_ID }} />);
    await flush();

    const advance = screen.getByRole('link', { name: /Avançar para Currículo/ });
    expect(advance).toHaveAttribute('href', `/curriculo?vaga=${JOB_ID}`);
  });

  it('should offer no way back on vaga because it is the first step', async () => {
    mockedCareer.mockRejectedValue(new ApiError(404, undefined, undefined));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(<WizardFooter current="vaga" ids={{ jobDescriptionId: JOB_ID }} />);
    await flush();

    expect(screen.queryByRole('link', { name: /Voltar para/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voltar para/ })).not.toBeInTheDocument();
  });

  it('should advance from the resume step to avaliacao carrying vaga and the chosen base', async () => {
    mockedCareer.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(
      <WizardFooter current="curriculo" ids={{ jobDescriptionId: JOB_ID, baseResumeId: BASE_ID }} />,
    );
    await flush();

    expect(screen.getByRole('link', { name: /Avançar para Avaliação/ })).toHaveAttribute(
      'href',
      `/avaliacao?vaga=${JOB_ID}&base=${BASE_ID}`,
    );
  });

  it('should keep advance from the resume step blocked until the career profile exists', async () => {
    mockedCareer.mockRejectedValue(new ApiError(404, undefined, undefined));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(<WizardFooter current="curriculo" ids={{ jobDescriptionId: JOB_ID }} />);
    await flush();

    const advance = screen.getByRole('button', { name: /Avançar para Avaliação/ });
    expect(advance).toBeDisabled();
    expect(screen.getByText('Envie o currículo e confirme a revisão para continuar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Vaga/ })).toHaveAttribute(
      'href',
      `/vaga?vaga=${JOB_ID}`,
    );
  });

  it('should show the invalidation dialog and cancel without navigating', async () => {
    mockedCareer.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    mockedEvaluation.mockResolvedValue({
      id: EVALUATION_ID,
      status: 'ready',
      matchScore: 80,
      failureReason: null,
      resumeId: null,
      requirementCoverages: [],
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    });
    mockedResume.mockResolvedValue({
      id: '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01',
      kind: 'tailored',
      name: 'Backend focus',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 2,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: JOB_ID,
      generationStatus: 'ready',
      failureReason: null,
      adaptationPlan: null,
      adaptationChanges: null,
      adaptationReview: {},
      languageFallback: false,
      matchScore: 80,
      contact: { name: 'Ada', email: null, phone: null, links: null },
      sections: [],
      requirementCoverages: [],
      skillProposals: [],
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    });
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(
      <WizardFooter
        current="avaliacao"
        ids={{
          jobDescriptionId: JOB_ID,
          evaluationId: EVALUATION_ID,
          resumeId: '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01',
        }}
      />,
    );
    await flush();

    const back = screen.getByRole('button', { name: /Voltar para Currículo/ });
    fireEvent.click(back);
    await flush();

    expect(
      screen.getByRole('heading', { name: /Voltar pode invalidar/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await flush();

    expect(
      screen.queryByRole('heading', { name: /Voltar pode invalidar/ }),
    ).not.toBeInTheDocument();
  });

  it('should cite the current ready step in the invalidation warning', async () => {
    mockedCareer.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    mockedEvaluation.mockResolvedValue({
      id: EVALUATION_ID,
      status: 'ready',
      matchScore: 80,
      failureReason: null,
      resumeId: null,
      requirementCoverages: [],
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    });
    mockedResume.mockResolvedValue({
      id: '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01',
      kind: 'tailored',
      name: 'Backend focus',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 2,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: JOB_ID,
      generationStatus: 'ready',
      failureReason: null,
      adaptationPlan: null,
      adaptationChanges: null,
      adaptationReview: {},
      languageFallback: false,
      matchScore: 80,
      contact: { name: 'Ada', email: null, phone: null, links: null },
      sections: [],
      requirementCoverages: [],
      skillProposals: [],
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    });
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(
      <WizardFooter
        current="avaliacao"
        ids={{
          jobDescriptionId: JOB_ID,
          evaluationId: EVALUATION_ID,
          resumeId: '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01',
        }}
      />,
    );
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /Voltar para Currículo/ }));
    await flush();

    const description = screen.getByText(/pode deixar de concluir/);
    expect(description.textContent).toMatch(/Avaliação/);
  });
});
