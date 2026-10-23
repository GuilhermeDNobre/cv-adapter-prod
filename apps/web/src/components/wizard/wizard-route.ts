export type WizardStepId = 'vaga' | 'curriculo' | 'avaliacao' | 'adaptar' | 'revisar' | 'exportar';

export interface WizardQueryIds {
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
  readonly baseResumeId?: string;
}

const RESUME_STEP_ROUTE = '/curriculo';

// These screens serve both the résumé area and the wizard's résumé step: without a job id in the
// URL nobody is adapting anything, so they are framed as the résumé area.
const RESUME_AREA_PATHS: readonly string[] = [
  '/importacao',
  '/revisao',
  '/revisao/base-resume',
  '/pronto',
];

function isFilled(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value !== '';
}

export function wizardQueryOf(ids: WizardQueryIds): string {
  const params = new URLSearchParams();
  if (isFilled(ids.jobDescriptionId)) params.set('vaga', ids.jobDescriptionId);
  if (isFilled(ids.evaluationId)) params.set('avaliacao', ids.evaluationId);
  if (isFilled(ids.baseResumeId)) params.set('base', ids.baseResumeId);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export function resumeStepHref(ids: WizardQueryIds): string {
  return `${RESUME_STEP_ROUTE}${wizardQueryOf(ids)}`;
}

export function stepOfPath(pathname: string): WizardStepId {
  if (pathname.startsWith('/revisar/')) return 'revisar';
  if (pathname.startsWith('/exportar/')) return 'exportar';
  if (pathname.startsWith('/adaptar')) return 'adaptar';
  if (pathname.startsWith('/avaliacao')) return 'avaliacao';
  if (pathname.startsWith('/vaga')) return 'vaga';
  return 'curriculo';
}

export function isResumeAreaPath(pathname: string, jobDescriptionId: string | null): boolean {
  if (isFilled(jobDescriptionId)) return false;
  return RESUME_AREA_PATHS.includes(pathname);
}
