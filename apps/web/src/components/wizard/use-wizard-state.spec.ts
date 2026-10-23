import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { EvaluationResponse } from 'schema/contracts/evaluation';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import type { ResumeImportResponse } from 'schema/contracts/resume-import';
import {
  ApiError,
  InvalidResponseError,
  NetworkError,
  getCareerProfile,
  getDeepSeekKeyStatus,
  getEvaluation,
  getEvaluationByJobDescription,
  getResume,
  getResumeImport,
  listResumes,
} from '../../lib/api-client';
import { notFoundAs, hasPendingWork, useWizardState, wizardHrefFor } from './use-wizard-state';
import { resumeDocumentFixture } from '../resume-editor/editor-fixtures';

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
const mockedImport = vi.mocked(getResumeImport);
const mockedKey = vi.mocked(getDeepSeekKeyStatus);
const mockedList = vi.mocked(listResumes);

const JOB_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
const EVALUATION_ID = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';
const RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const IMPORT_ID = '7b2f5a9d-1c6b-5f7c-9e1b-3a4d6e8f0b12';
const BASE_ID = '8c3a6b0e-2d7c-4a8d-8f2c-4b5e7f9a1c23';
const OTHER_BASE_ID = '9d4b7c1f-3e8d-4b9e-9a3d-5c6f8a0b2d34';
const EMPTY_PROFILE = { experiences: [], educationEntries: [], evidences: [] };

function evaluationFixture(status: EvaluationResponse['status']): EvaluationResponse {
  return {
    id: EVALUATION_ID,
    status,
    matchScore: status === 'ready' ? 80 : null,
    failureReason: null,
    resumeId: null,
    requirementCoverages: [],
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

function importFixture(status: ResumeImportResponse['status']): ResumeImportResponse {
  return {
    id: IMPORT_ID,
    status,
    failureReason: status === 'failed' ? 'not_a_resume' : null,
    draft: null,
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

function resumeFixture(
  status: ResumeDocumentResponse['generationStatus'],
): ResumeDocumentResponse {
  return resumeDocumentFixture({ generationStatus: status });
}

async function flush(): Promise<void> {
  await act(async () => {});
}

describe('useWizardState', () => {
  beforeEach(() => {
    mockedCareer.mockRejectedValue(new Error('no profile'));
    mockedEvaluation.mockRejectedValue(new Error('not found'));
    mockedEvaluationByJob.mockRejectedValue(new ApiError(404, undefined, undefined));
    mockedResume.mockRejectedValue(new Error('not found'));
    mockedImport.mockRejectedValue(new Error('not found'));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    mockedList.mockRejectedValue(new ApiError(404, undefined, undefined));
  });

  afterEach(() => {
    mockedCareer.mockReset();
    mockedEvaluation.mockReset();
    mockedEvaluationByJob.mockReset();
    mockedResume.mockReset();
    mockedImport.mockReset();
    mockedKey.mockReset();
    mockedList.mockReset();
  });

  it('should order the steps starting from the vaga and then the resume', async () => {
    const { result } = renderHook(() => useWizardState('vaga', {}));
    await flush();

    expect(result.current.steps.map((step) => step.id)).toEqual([
      'vaga',
      'curriculo',
      'avaliacao',
      'adaptar',
      'revisar',
      'exportar',
    ]);
  });

  it('should keep curriculo current without a career profile and block advance', async () => {
    const { result } = renderHook(() => useWizardState('curriculo', { jobDescriptionId: JOB_ID }));
    await flush();

    const state = result.current;
    expect(state.steps.find((step) => step.id === 'curriculo')?.status).toBe('current');
    expect(state.canAdvance).toBe(false);
    expect(state.blockedReason).toMatch(/Envie o currículo/);
  });

  it('should allow advance from curriculo once the career profile exists', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    const { result } = renderHook(() => useWizardState('curriculo', { jobDescriptionId: JOB_ID }));
    await flush();

    expect(result.current.canAdvance).toBe(true);
    expect(result.current.blockedReason).toBeNull();
  });

  it('should block curriculo advance until the vaga is known even with a career profile', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    const { result } = renderHook(() => useWizardState('curriculo', {}));
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/informe a vaga/);
  });

  it('should mark curriculo done via the career profile once the vaga is known', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    const { result } = renderHook(() => useWizardState('vaga', { jobDescriptionId: JOB_ID }));
    await flush();

    const curriculo = result.current.steps.find((step) => step.id === 'curriculo');
    expect(curriculo?.status).toBe('done');
    expect(curriculo?.href).toBe(`/curriculo?vaga=${JOB_ID}`);
  });

  it('should keep curriculo pending before the vaga even with a career profile', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    const { result } = renderHook(() => useWizardState('vaga', {}));
    await flush();

    const curriculo = result.current.steps.find((step) => step.id === 'curriculo');
    expect(curriculo?.status).toBe('pending');
    expect(curriculo?.href).toBeNull();
  });

  it('should block curriculo advance while the import is queued', async () => {
    mockedImport.mockResolvedValue(importFixture('extracting'));
    const { result } = renderHook(() =>
      useWizardState('curriculo', { jobDescriptionId: JOB_ID, resumeImportId: IMPORT_ID }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/Aguarde a leitura/);
  });

  it('should block curriculo advance when the import failed', async () => {
    mockedImport.mockResolvedValue(importFixture('failed'));
    const { result } = renderHook(() =>
      useWizardState('curriculo', { jobDescriptionId: JOB_ID, resumeImportId: IMPORT_ID }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/importação falhou/);
  });

  it('should require the vaga id to advance from vaga', async () => {
    const { result } = renderHook(() => useWizardState('vaga', {}));
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/Cole o anúncio/);
  });

  it('should allow advance from vaga when the job id is present', async () => {
    const { result } = renderHook(() => useWizardState('vaga', { jobDescriptionId: JOB_ID }));
    await flush();

    expect(result.current.canAdvance).toBe(true);
    expect(result.current.blockedReason).toBeNull();
    expect(result.current.steps.find((step) => step.id === 'vaga')?.status).toBe('current');
  });

  it('should mark vaga done when later stages carry its id', async () => {
    mockedEvaluation.mockResolvedValue(evaluationFixture('ready'));
    const { result } = renderHook(() =>
      useWizardState('avaliacao', { jobDescriptionId: JOB_ID, evaluationId: EVALUATION_ID }),
    );
    await flush();

    expect(result.current.steps.find((step) => step.id === 'vaga')?.status).toBe('done');
  });

  it('should wait for a pending evaluation', async () => {
    mockedEvaluation.mockResolvedValue(evaluationFixture('analyzing'));
    const { result } = renderHook(() =>
      useWizardState('avaliacao', { jobDescriptionId: JOB_ID, evaluationId: EVALUATION_ID }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/Aguarde a Evaluation/);
  });

  it('should allow advance when the evaluation is ready', async () => {
    mockedEvaluation.mockResolvedValue(evaluationFixture('ready'));
    const { result } = renderHook(() =>
      useWizardState('avaliacao', { jobDescriptionId: JOB_ID, evaluationId: EVALUATION_ID }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(true);
  });

  it('should block advance when the evaluation failed', async () => {
    mockedEvaluation.mockResolvedValue(evaluationFixture('failed'));
    const { result } = renderHook(() =>
      useWizardState('avaliacao', { jobDescriptionId: JOB_ID, evaluationId: EVALUATION_ID }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/avaliação falhou/);
  });

  it('should require vaga and avaliacao ids on adaptar', async () => {
    const { result } = renderHook(() => useWizardState('adaptar', {}));
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/informe a vaga/);
  });

  it('should ask for generation on adaptar when ids are present', async () => {
    const { result } = renderHook(() =>
      useWizardState('adaptar', { jobDescriptionId: JOB_ID, evaluationId: EVALUATION_ID }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/Gere o Tailored Resume/);
  });

  it('should wait while the resume is generating on revisar', async () => {
    mockedResume.mockResolvedValue(resumeFixture('generating'));
    const { result } = renderHook(() =>
      useWizardState('revisar', {
        jobDescriptionId: JOB_ID,
        evaluationId: EVALUATION_ID,
        resumeId: RESUME_ID,
      }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/Aguarde a geração/);
  });

  it('should allow advance from revisar when the resume is ready', async () => {
    mockedResume.mockResolvedValue(resumeFixture('ready'));
    const { result } = renderHook(() =>
      useWizardState('revisar', {
        jobDescriptionId: JOB_ID,
        evaluationId: EVALUATION_ID,
        resumeId: RESUME_ID,
      }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(true);
    expect(result.current.steps.find((step) => step.id === 'adaptar')?.status).toBe('done');
    expect(result.current.steps.find((step) => step.id === 'revisar')?.status).toBe('current');
  });

  it('should block revisar advance when generation failed', async () => {
    mockedResume.mockResolvedValue(resumeFixture('failed'));
    const { result } = renderHook(() =>
      useWizardState('revisar', { resumeId: RESUME_ID }),
    );
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/geração falhou/);
  });

  it('should keep exportar current without advance', async () => {
    mockedResume.mockResolvedValue(resumeFixture('ready'));
    const { result } = renderHook(() =>
      useWizardState('exportar', { resumeId: RESUME_ID }),
    );
    await flush();

    expect(result.current.steps.find((step) => step.id === 'exportar')?.status).toBe('current');
    expect(result.current.canAdvance).toBe(false);
  });

  it('should block with the key message when no DeepSeek key is configured', async () => {
    mockedKey.mockResolvedValue({ configured: false, lastFour: null });
    const { result } = renderHook(() => useWizardState('vaga', { jobDescriptionId: JOB_ID }));
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/chave da DeepSeek/);
  });

  it('should expose done hrefs that preserve vaga and avaliacao', async () => {
    mockedCareer.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    mockedEvaluation.mockResolvedValue(evaluationFixture('ready'));
    const { result } = renderHook(() =>
      useWizardState('adaptar', { jobDescriptionId: JOB_ID, evaluationId: EVALUATION_ID }),
    );
    await waitFor(() => {
      expect(result.current.steps.find((step) => step.id === 'avaliacao')?.status).toBe('done');
    });

    const avaliacao = result.current.steps.find((step) => step.id === 'avaliacao');
    expect(avaliacao?.href).toContain(`/avaliacao/${EVALUATION_ID}`);
    expect(avaliacao?.href).toContain(`vaga=${JOB_ID}`);
  });

  it('should derive vaga and avaliacao from only a resume id', async () => {
    mockedResume.mockResolvedValue({
      ...resumeFixture('ready'),
      id: RESUME_ID,
      kind: 'tailored',
      jobDescriptionId: JOB_ID,
    });
    mockedEvaluationByJob.mockResolvedValue(evaluationFixture('ready'));
    const { result } = renderHook(() => useWizardState('revisar', { resumeId: RESUME_ID }));
    await waitFor(() => {
      expect(result.current.steps.find((step) => step.id === 'vaga')?.status).toBe('done');
    });

    expect(result.current.ids.jobDescriptionId).toBe(JOB_ID);
    expect(result.current.ids.evaluationId).toBe(EVALUATION_ID);
    const vaga = result.current.steps.find((step) => step.id === 'vaga');
    expect(vaga?.href).toContain('/vaga');
    const avaliacao = result.current.steps.find((step) => step.id === 'avaliacao');
    expect(avaliacao?.status).toBe('done');
    expect(avaliacao?.href).toContain(`/avaliacao/${EVALUATION_ID}`);
    expect(avaliacao?.href).toContain(`vaga=${JOB_ID}`);
    expect(mockedEvaluationByJob).toHaveBeenCalledWith(JOB_ID);
  });

  it('should derive avaliacao and resume from only a job description id', async () => {
    mockedEvaluationByJob.mockResolvedValue(evaluationFixture('ready'));
    mockedList.mockResolvedValue({
      resumes: [
        {
          id: RESUME_ID,
          kind: 'tailored',
          name: 'Backend focus',
          language: 'en',
          template: 'comfortable',
          lengthTarget: 2,
          writingMethod: 'xyz',
          tone: 'direct',
          baseResumeId: null,
          jobDescriptionId: JOB_ID,
          jobTitle: null,
          generationStatus: 'ready',
          failureReason: null,
          createdAt: '2026-09-06T10:00:00.000Z',
          updatedAt: '2026-09-06T10:00:00.000Z',
          exports: [],
        },
      ],
    });
    mockedResume.mockResolvedValue(resumeFixture('ready'));
    const { result } = renderHook(() => useWizardState('adaptar', { jobDescriptionId: JOB_ID }));
    await waitFor(() => {
      expect(result.current.steps.find((step) => step.id === 'avaliacao')?.status).toBe('done');
    });

    expect(result.current.ids.evaluationId).toBe(EVALUATION_ID);
    expect(result.current.ids.resumeId).toBe(RESUME_ID);
    expect(result.current.steps.find((step) => step.id === 'adaptar')?.status).toBe('current');
    expect(result.current.steps.find((step) => step.id === 'adaptar')?.done).toBe(true);
  });

  it('should keep avaliacao pending without logging when the job has no evaluation', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedCareer.mockRejectedValue(new ApiError(404, undefined, undefined));
    mockedEvaluationByJob.mockRejectedValue(new ApiError(404, undefined, undefined));
    mockedList.mockRejectedValue(new ApiError(404, undefined, undefined));
    const { result } = renderHook(() => useWizardState('adaptar', { jobDescriptionId: JOB_ID }));
    await flush();

    expect(result.current.steps.find((step) => step.id === 'avaliacao')?.status).toBe('pending');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('should keep exportar blocked without a reason', async () => {
    mockedResume.mockResolvedValue(resumeFixture('ready'));
    const { result } = renderHook(() =>
      useWizardState('exportar', { resumeId: RESUME_ID }),
    );
    await flush();

    expect(result.current.steps.find((step) => step.id === 'exportar')?.status).toBe('current');
    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toBeNull();
  });

  it('should return fallback without logging on 404 for career profile', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedCareer.mockRejectedValue(new ApiError(404, undefined, undefined));
    const { result } = renderHook(() => useWizardState('curriculo', { jobDescriptionId: JOB_ID }));
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/Envie o currículo/);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('should log and keep curriculo blocked on 500 for career profile', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedCareer.mockRejectedValue(new ApiError(500, 'boom', { message: 'boom' }));
    const { result } = renderHook(() => useWizardState('curriculo', { jobDescriptionId: JOB_ID }));
    await flush();

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toMatch(/Envie o currículo/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('wizard.state.load_failed', {
      resource: 'career_profile',
      status: 500,
    });
    errorSpy.mockRestore();
  });

  it('should keep deepseek key unknown on error without blocking advance', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedCareer.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    mockedKey.mockRejectedValue(new ApiError(500, 'boom', { message: 'boom' }));
    const { result } = renderHook(() => useWizardState('vaga', { jobDescriptionId: JOB_ID }));
    await flush();

    expect(result.current.canAdvance).toBe(true);
    expect(result.current.blockedReason).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('wizard.state.load_failed', {
      resource: 'deepseek_key',
      status: 500,
    });
    errorSpy.mockRestore();
  });

  it('should keep vaga and avaliacao in curriculo and vaga hrefs', () => {
    expect(wizardHrefFor('curriculo', { jobDescriptionId: 'j1' })).toBe('/curriculo?vaga=j1');
    expect(wizardHrefFor('vaga', { jobDescriptionId: 'j1' })).toContain('?vaga=j1');
    expect(wizardHrefFor('curriculo', { jobDescriptionId: 'j1', evaluationId: 'e1' })).toBe(
      '/curriculo?vaga=j1&avaliacao=e1',
    );
  });

  it('should carry the chosen base resume in the step hrefs', () => {
    const ids = { jobDescriptionId: 'j1', evaluationId: 'e1', baseResumeId: 'b1' };

    expect(wizardHrefFor('curriculo', ids)).toBe('/curriculo?vaga=j1&avaliacao=e1&base=b1');
    expect(wizardHrefFor('avaliacao', ids)).toBe('/avaliacao/e1?vaga=j1&avaliacao=e1&base=b1');
    expect(wizardHrefFor('adaptar', ids)).toBe('/adaptar?vaga=j1&avaliacao=e1&base=b1');
  });

  it('should expose the chosen base resume in the done step links', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    const { result } = renderHook(() =>
      useWizardState('avaliacao', { jobDescriptionId: JOB_ID, baseResumeId: BASE_ID }),
    );
    await flush();

    const curriculo = result.current.steps.find((step) => step.id === 'curriculo');
    expect(curriculo?.href).toBe(`/curriculo?vaga=${JOB_ID}&base=${BASE_ID}`);
    expect(result.current.ids.baseResumeId).toBe(BASE_ID);
  });

  it('should follow a new base resume choice without reloading the wizard data', async () => {
    mockedCareer.mockResolvedValue(EMPTY_PROFILE);
    const { result, rerender } = renderHook(
      ({ baseResumeId }: { baseResumeId: string }) =>
        useWizardState('curriculo', { jobDescriptionId: JOB_ID, baseResumeId }),
      { initialProps: { baseResumeId: BASE_ID } },
    );
    await flush();
    const loadsBefore = mockedCareer.mock.calls.length;

    rerender({ baseResumeId: OTHER_BASE_ID });
    await flush();

    expect(result.current.ids.baseResumeId).toBe(OTHER_BASE_ID);
    expect(wizardHrefFor('avaliacao', result.current.ids)).toBe(
      `/avaliacao?vaga=${JOB_ID}&base=${OTHER_BASE_ID}`,
    );
    expect(mockedCareer.mock.calls.length).toBe(loadsBefore);
  });

  it('should derive the base resume from the tailored resume when none was chosen', async () => {
    mockedResume.mockResolvedValue({
      ...resumeFixture('ready'),
      id: RESUME_ID,
      kind: 'tailored',
      baseResumeId: BASE_ID,
      jobDescriptionId: JOB_ID,
    });
    mockedEvaluationByJob.mockResolvedValue(evaluationFixture('ready'));
    const { result } = renderHook(() => useWizardState('revisar', { resumeId: RESUME_ID }));
    await waitFor(() => {
      expect(result.current.ids.baseResumeId).toBe(BASE_ID);
    });

    const adaptar = result.current.steps.find((step) => step.id === 'adaptar');
    expect(adaptar?.href).toContain(`base=${BASE_ID}`);
  });

  it('should keep the chosen base resume over the one the tailored resume came from', async () => {
    mockedResume.mockResolvedValue({
      ...resumeFixture('ready'),
      id: RESUME_ID,
      kind: 'tailored',
      baseResumeId: BASE_ID,
      jobDescriptionId: JOB_ID,
    });
    const { result } = renderHook(() =>
      useWizardState('revisar', { resumeId: RESUME_ID, baseResumeId: OTHER_BASE_ID }),
    );
    await flush();

    expect(result.current.ids.baseResumeId).toBe(OTHER_BASE_ID);
  });

  it('should not take a base resume from a base resume document', async () => {
    mockedResume.mockResolvedValue({
      ...resumeFixture('ready'),
      id: RESUME_ID,
      kind: 'base',
      baseResumeId: BASE_ID,
    });
    const { result } = renderHook(() => useWizardState('revisar', { resumeId: RESUME_ID }));
    await flush();

    expect(result.current.ids.baseResumeId).toBeUndefined();
  });

  it('should re-read until the evaluation is ready without remounting', async () => {
    vi.useFakeTimers();
    try {
      mockedEvaluation
        .mockResolvedValueOnce(evaluationFixture('queued'))
        .mockResolvedValue(evaluationFixture('ready'));
      const { result } = renderHook(() =>
        useWizardState('avaliacao', { jobDescriptionId: JOB_ID, evaluationId: EVALUATION_ID }),
      );
      await flush();

      expect(result.current.canAdvance).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      await flush();

      expect(result.current.canAdvance).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('hasPendingWork', () => {
  it('should be true for every intermediate state and false for terminals', () => {
    const base = {
      careerReady: true,
      evaluation: null,
      resume: null,
      resumeImport: null,
      keyConfigured: true,
    };
    expect(hasPendingWork({ ...base, evaluation: evaluationFixture('queued') })).toBe(true);
    expect(hasPendingWork({ ...base, evaluation: evaluationFixture('analyzing') })).toBe(true);
    expect(hasPendingWork({ ...base, resumeImport: importFixture('queued') })).toBe(true);
    expect(hasPendingWork({ ...base, resumeImport: importFixture('extracting') })).toBe(true);
    expect(hasPendingWork({ ...base, resumeImport: importFixture('structuring') })).toBe(true);
    expect(hasPendingWork({ ...base, resume: resumeFixture('generating') })).toBe(true);
    expect(hasPendingWork({ ...base, evaluation: evaluationFixture('ready') })).toBe(false);
    expect(
      hasPendingWork({ ...base, evaluation: evaluationFixture('failed') }),
    ).toBe(false);
    expect(hasPendingWork({ ...base, resumeImport: importFixture('ready_for_review') })).toBe(
      false,
    );
    expect(hasPendingWork({ ...base, resume: resumeFixture('ready') })).toBe(false);
    expect(hasPendingWork(base)).toBe(false);
  });
});

describe('notFoundAs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return fallback without logging on 404', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = notFoundAs(false, 'career_profile');
    const result = handler(new ApiError(404, undefined, { message: 'not found' }));

    expect(result).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should return null and log resource and status on 500 without payload', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = notFoundAs<EvaluationResponse | null>(null, 'evaluation');
    const result = handler(new ApiError(500, 'boom', { message: 'boom' }));

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('wizard.state.load_failed', {
      resource: 'evaluation',
      status: 500,
    });
    const logged = errorSpy.mock.calls[0]?.[1] as unknown;
    expect(JSON.stringify(logged)).not.toContain('boom');
  });

  it('should return null with null status on NetworkError', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = notFoundAs(null, 'resume');
    const result = handler(new NetworkError());

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('wizard.state.load_failed', {
      resource: 'resume',
      status: null,
    });
  });

  it('should return null with null status on InvalidResponseError', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = notFoundAs(null, 'resume_import');
    const result = handler(new InvalidResponseError());

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('wizard.state.load_failed', {
      resource: 'resume_import',
      status: null,
    });
  });

  it('should return null with null status on unknown errors', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = notFoundAs<boolean | null>(null, 'deepseek_key');
    const result = handler(new Error('down'));

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('wizard.state.load_failed', {
      resource: 'deepseek_key',
      status: null,
    });
  });
});
