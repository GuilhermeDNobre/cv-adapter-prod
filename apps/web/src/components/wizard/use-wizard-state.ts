'use client';

import { useEffect, useState } from 'react';
import {
  ApiError,
  getCareerProfile,
  getDeepSeekKeyStatus,
  getEvaluation,
  getEvaluationByJobDescription,
  getResume,
  getResumeImport,
  listResumes,
} from '../../lib/api-client';
import type { EvaluationResponse } from 'schema/contracts/evaluation';
import type {
  ResumeDocumentResponse,
  ResumeListItem,
} from 'schema/contracts/resume';
import type { ResumeImportResponse } from 'schema/contracts/resume-import';
import {
  resumeStepHref,
  wizardQueryOf,
  type WizardQueryIds,
  type WizardStepId,
} from './wizard-route';

export type { WizardStepId } from './wizard-route';
export type StepStatus = 'done' | 'current' | 'pending';

export interface WizardRouteIds extends WizardQueryIds {
  readonly resumeId?: string;
  readonly resumeImportId?: string;
}

export interface WizardStepState {
  readonly id: WizardStepId;
  readonly status: StepStatus;
  readonly done: boolean;
  readonly href: string | null;
}

export interface WizardState {
  readonly steps: ReadonlyArray<WizardStepState>;
  readonly ids: WizardRouteIds;
  readonly canAdvance: boolean;
  readonly blockedReason: string | null;
}

export const WIZARD_STEPS: readonly WizardStepId[] = [
  'vaga',
  'curriculo',
  'avaliacao',
  'adaptar',
  'revisar',
  'exportar',
];

export const WIZARD_STEP_LABELS: Readonly<Record<WizardStepId, string>> = {
  vaga: 'Vaga',
  curriculo: 'Currículo',
  avaliacao: 'Avaliação',
  adaptar: 'Adaptar',
  revisar: 'Revisar',
  exportar: 'Exportar',
};

export type WizardResource =
  | 'career_profile'
  | 'evaluation'
  | 'resume'
  | 'resume_import'
  | 'deepseek_key';

export const BLOCKED_REASONS = {
  KEY_REQUIRED: 'Configure a chave da DeepSeek para continuar.',
  IMPORT_FAILED: 'A importação falhou. Envie outro arquivo para continuar.',
  IMPORT_PENDING: 'Aguarde a leitura do currículo terminar para continuar.',
  IMPORT_MISSING: 'Envie o currículo e confirme a revisão para continuar.',
  RESUME_MISSING_JOB: 'Volte e informe a vaga para continuar.',
  JOB_MISSING: 'Cole o anúncio da vaga para continuar.',
  EVALUATION_MISSING: 'Inicie a avaliação para continuar.',
  EVALUATION_FAILED: 'A avaliação falhou. Volte e tente de novo.',
  EVALUATION_PENDING: 'Aguarde a Evaluation ficar pronta para continuar.',
  ADAPT_MISSING_JOB: 'Volte e informe a vaga para continuar.',
  ADAPT_MISSING_EVALUATION: 'Volte e conclua a avaliação para continuar.',
  ADAPT_NOT_GENERATED: 'Gere o Tailored Resume para continuar.',
  REVIEW_MISSING: 'Carregue o currículo para continuar.',
  REVIEW_FAILED: 'A geração falhou. Volte e gere de novo.',
  REVIEW_PENDING: 'Aguarde a geração terminar para continuar.',
} as const;

export interface AdvanceResult {
  readonly canAdvance: boolean;
  readonly blockedReason: string | null;
}

export interface WizardData {
  readonly careerReady: boolean | null;
  readonly evaluation: EvaluationResponse | null;
  readonly resume: ResumeDocumentResponse | null;
  readonly resumeImport: ResumeImportResponse | null;
  readonly keyConfigured: boolean | null;
}

const WIZARD_POLL_INTERVAL_MS = 1500;

export function hasPendingWork(data: WizardData): boolean {
  if (data.evaluation?.status === 'queued' || data.evaluation?.status === 'analyzing') return true;
  if (
    data.resumeImport?.status === 'queued' ||
    data.resumeImport?.status === 'extracting' ||
    data.resumeImport?.status === 'structuring'
  )
    return true;
  if (data.resume?.generationStatus === 'generating') return true;
  return false;
}

function present(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

export function wizardHrefFor(step: WizardStepId, ids: WizardRouteIds): string | null {
  const query = wizardQueryOf(ids);
  if (step === 'curriculo') return resumeStepHref(ids);
  if (step === 'vaga') return `/vaga${query}`;
  if (step === 'avaliacao') {
    if (present(ids.evaluationId)) {
      return `/avaliacao/${ids.evaluationId as string}${query}`;
    }
    return `/avaliacao${query}`;
  }
  if (step === 'adaptar') return `/adaptar${query}`;
  if (step === 'revisar') {
    if (!present(ids.resumeId)) return null;
    return `/revisar/${ids.resumeId as string}${query}`;
  }
  if (!present(ids.resumeId)) return null;
  return `/exportar/${ids.resumeId as string}${query}`;
}

function doneFor(step: WizardStepId, ids: WizardRouteIds, data: WizardData): boolean {
  if (step === 'vaga') return present(ids.jobDescriptionId);
  if (step === 'curriculo') return present(ids.jobDescriptionId) && data.careerReady === true;
  if (step === 'avaliacao') return data.evaluation?.status === 'ready';
  if (step === 'adaptar') return data.resume?.generationStatus === 'ready';
  if (step === 'revisar') return data.resume?.generationStatus === 'ready';
  return false;
}

function advanceFromResume(ids: WizardRouteIds, data: WizardData): AdvanceResult {
  if (!present(ids.jobDescriptionId)) return { canAdvance: false, blockedReason: BLOCKED_REASONS.RESUME_MISSING_JOB };
  if (data.careerReady) return { canAdvance: true, blockedReason: null };
  if (data.resumeImport?.status === 'failed') return { canAdvance: false, blockedReason: BLOCKED_REASONS.IMPORT_FAILED };
  if (data.resumeImport?.status === 'queued' || data.resumeImport?.status === 'extracting' || data.resumeImport?.status === 'structuring') return { canAdvance: false, blockedReason: BLOCKED_REASONS.IMPORT_PENDING };
  return { canAdvance: false, blockedReason: BLOCKED_REASONS.IMPORT_MISSING };
}

function advanceFromJob(ids: WizardRouteIds): AdvanceResult {
  if (present(ids.jobDescriptionId)) return { canAdvance: true, blockedReason: null };
  return { canAdvance: false, blockedReason: BLOCKED_REASONS.JOB_MISSING };
}

function advanceFromEvaluation(_ids: WizardRouteIds, data: WizardData): AdvanceResult {
  if (data.evaluation === null) return { canAdvance: false, blockedReason: BLOCKED_REASONS.EVALUATION_MISSING };
  if (data.evaluation.status === 'ready') return { canAdvance: true, blockedReason: null };
  if (data.evaluation.status === 'failed') return { canAdvance: false, blockedReason: BLOCKED_REASONS.EVALUATION_FAILED };
  return { canAdvance: false, blockedReason: BLOCKED_REASONS.EVALUATION_PENDING };
}

function advanceFromAdapt(ids: WizardRouteIds): AdvanceResult {
  if (!present(ids.jobDescriptionId)) return { canAdvance: false, blockedReason: BLOCKED_REASONS.ADAPT_MISSING_JOB };
  if (!present(ids.evaluationId)) return { canAdvance: false, blockedReason: BLOCKED_REASONS.ADAPT_MISSING_EVALUATION };
  return { canAdvance: false, blockedReason: BLOCKED_REASONS.ADAPT_NOT_GENERATED };
}

function advanceFromReview(_ids: WizardRouteIds, data: WizardData): AdvanceResult {
  if (data.resume === null) return { canAdvance: false, blockedReason: BLOCKED_REASONS.REVIEW_MISSING };
  if (data.resume.generationStatus === 'ready') return { canAdvance: true, blockedReason: null };
  if (data.resume.generationStatus === 'failed') return { canAdvance: false, blockedReason: BLOCKED_REASONS.REVIEW_FAILED };
  return { canAdvance: false, blockedReason: BLOCKED_REASONS.REVIEW_PENDING };
}

export const ADVANCE_RULES: Record<WizardStepId, (ids: WizardRouteIds, data: WizardData) => AdvanceResult> = {
  vaga: advanceFromJob,
  curriculo: advanceFromResume,
  avaliacao: advanceFromEvaluation,
  adaptar: advanceFromAdapt,
  revisar: advanceFromReview,
  exportar: () => ({ canAdvance: false, blockedReason: null }),
};

export function advanceFor(
  current: WizardStepId,
  ids: WizardRouteIds,
  data: WizardData,
): AdvanceResult {
  if (data.keyConfigured === false) return { canAdvance: false, blockedReason: BLOCKED_REASONS.KEY_REQUIRED };
  return ADVANCE_RULES[current](ids, data);
}

export function notFoundAs<T>(fallback: T, resource: WizardResource): (error: unknown) => T | null {
  return (error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return fallback;
    const status = error instanceof ApiError ? error.status : null;
    console.error('wizard.state.load_failed', { resource, status });
    return null;
  };
}

function buildSteps(current: WizardStepId, ids: WizardRouteIds, data: WizardData): ReadonlyArray<WizardStepState> {
  return WIZARD_STEPS.map((id) => {
    const done = doneFor(id, ids, data);
    if (id === current) return { id, status: 'current' as StepStatus, done, href: null };
    if (done) return { id, status: 'done' as StepStatus, done, href: wizardHrefFor(id, ids) };
    return { id, status: 'pending' as StepStatus, done: false, href: null };
  });
}

function latestTailoredForJob(
  resumes: readonly ResumeListItem[],
  jobDescriptionId: string,
): ResumeListItem | null {
  let latest: ResumeListItem | null = null;
  for (const resume of resumes) {
    if (resume.kind !== 'tailored') continue;
    if (resume.jobDescriptionId !== jobDescriptionId) continue;
    if (latest === null || resume.createdAt > latest.createdAt) latest = resume;
  }
  return latest;
}

async function fetchResume(resumeId: string | undefined): Promise<ResumeDocumentResponse | null> {
  if (!present(resumeId)) return null;
  return getResume(resumeId as string).catch(notFoundAs(null, 'resume'));
}

function deriveJobDescriptionId(
  ids: WizardRouteIds,
  resume: ResumeDocumentResponse | null,
): string | undefined {
  if (present(ids.jobDescriptionId)) return ids.jobDescriptionId as string;
  if (resume?.jobDescriptionId !== null && resume?.jobDescriptionId !== undefined && resume.jobDescriptionId !== '') {
    return resume.jobDescriptionId;
  }
  return undefined;
}

async function fetchEvaluation(
  evaluationId: string | undefined,
  jobDescriptionId: string | undefined,
): Promise<EvaluationResponse | null> {
  if (present(evaluationId)) {
    return getEvaluation(evaluationId as string).catch(notFoundAs(null, 'evaluation'));
  }
  if (present(jobDescriptionId)) {
    return getEvaluationByJobDescription(jobDescriptionId as string).catch(
      notFoundAs(null, 'evaluation'),
    );
  }
  return null;
}

async function deriveTailoredResume(
  jobDescriptionId: string | undefined,
  resumeId: string | undefined,
  resume: ResumeDocumentResponse | null,
): Promise<{ readonly resume: ResumeDocumentResponse | null; readonly resumeId: string | undefined }> {
  if (present(resumeId)) return { resume, resumeId: resumeId as string };
  if (!present(jobDescriptionId)) return { resume, resumeId: undefined };
  const list = await listResumes().catch(notFoundAs(null, 'resume'));
  if (list === null) return { resume, resumeId: undefined };
  const latest = latestTailoredForJob(list.resumes, jobDescriptionId as string);
  if (latest === null) return { resume, resumeId: undefined };
  const derived = await getResume(latest.id).catch(notFoundAs(null, 'resume'));
  if (derived === null) return { resume, resumeId: undefined };
  return { resume: derived, resumeId: derived.id };
}

function baseResumeOf(resume: ResumeDocumentResponse | null): string | undefined {
  if (resume?.kind !== 'tailored') return undefined;
  return resume.baseResumeId ?? undefined;
}

function withBaseResume(ids: WizardRouteIds, baseResumeId: string | undefined): WizardRouteIds {
  if (!present(baseResumeId)) return ids;
  return { ...ids, baseResumeId };
}

async function loadWizardData(ids: WizardRouteIds): Promise<{ readonly data: WizardData; readonly ids: WizardRouteIds }> {
  const [careerReady, resumeImport, keyConfigured] = await Promise.all([
    getCareerProfile().then(() => true as const).catch(notFoundAs(false, 'career_profile')),
    present(ids.resumeImportId)
      ? getResumeImport(ids.resumeImportId as string).catch(notFoundAs(null, 'resume_import'))
      : Promise.resolve(null),
    getDeepSeekKeyStatus().then((status) => status.configured).catch(notFoundAs(null, 'deepseek_key')),
  ]);
  const resume = await fetchResume(ids.resumeId);
  const jobDescriptionId = deriveJobDescriptionId(ids, resume);
  const evaluation = await fetchEvaluation(ids.evaluationId, jobDescriptionId);
  const evaluationId = present(ids.evaluationId) ? (ids.evaluationId as string) : evaluation?.id;
  const tailored = await deriveTailoredResume(jobDescriptionId, ids.resumeId, resume);
  const derivedIds: WizardRouteIds = {
    jobDescriptionId,
    evaluationId,
    baseResumeId: present(ids.baseResumeId) ? ids.baseResumeId : baseResumeOf(tailored.resume),
    resumeId: tailored.resumeId,
    resumeImportId: ids.resumeImportId,
  };
  const data: WizardData = { careerReady, evaluation, resume: tailored.resume, resumeImport, keyConfigured };
  return { data, ids: derivedIds };
}

const INITIAL_DATA: WizardData = {
  careerReady: false,
  evaluation: null,
  resume: null,
  resumeImport: null,
  keyConfigured: null,
};

export function useWizardState(current: WizardStepId, ids: WizardRouteIds): WizardState {
  const jobDescriptionId = ids.jobDescriptionId;
  const evaluationId = ids.evaluationId;
  const resumeId = ids.resumeId;
  const resumeImportId = ids.resumeImportId;
  const baseResumeId = ids.baseResumeId;
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [derivedIds, setDerivedIds] = useState<WizardRouteIds>(ids);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const input: WizardRouteIds = { jobDescriptionId, evaluationId, resumeId, resumeImportId };
    async function loadOnce(): Promise<void> {
      const loaded = await loadWizardData(input);
      if (cancelled) return;
      setData(loaded.data);
      setDerivedIds(loaded.ids);
      if (hasPendingWork(loaded.data)) timer = setTimeout(() => void loadOnce(), WIZARD_POLL_INTERVAL_MS);
    }
    void loadOnce();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [jobDescriptionId, evaluationId, resumeId, resumeImportId]);
  const routeIds = withBaseResume(derivedIds, baseResumeId);
  const steps = buildSteps(current, routeIds, data);
  const advance = advanceFor(current, routeIds, data);
  return { steps, ids: routeIds, canAdvance: advance.canAdvance, blockedReason: advance.blockedReason };
}
