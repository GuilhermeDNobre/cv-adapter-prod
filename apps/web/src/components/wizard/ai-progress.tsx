'use client';

import type { EvaluationResponse } from 'schema/contracts/evaluation';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import type { ResumeImportResponse } from 'schema/contracts/resume-import';
import { AiActivity } from '../ui/ai-activity';

interface AiProgressProps {
  readonly importStatus?: ResumeImportResponse['status'] | null;
  readonly evaluationStatus?: EvaluationResponse['status'] | null;
  readonly generationStatus?: ResumeDocumentResponse['generationStatus'] | null;
  readonly generationStep?: ResumeDocumentResponse['generationStep'];
}

const IMPORT_LABELS: Readonly<
  Record<Extract<ResumeImportResponse['status'], 'queued' | 'extracting' | 'structuring'>, string>
> = {
  queued: 'Currículo recebido. Ele está na fila para o processamento.',
  extracting: 'Lendo o texto do arquivo.',
  structuring: 'Organizando as experiências do currículo.',
};

const IMPORT_POSITION: Readonly<
  Record<Extract<ResumeImportResponse['status'], 'queued' | 'extracting' | 'structuring'>, { readonly current: number; readonly total: number }>
> = {
  queued: { current: 1, total: 3 },
  extracting: { current: 2, total: 3 },
  structuring: { current: 3, total: 3 },
};

const EVALUATION_LABELS: Readonly<Record<Extract<EvaluationResponse['status'], 'queued' | 'analyzing'>, string>> = {
  queued: 'Sua Evaluation está na fila para análise.',
  analyzing: 'Cruzando as Evidences do seu Career Profile com os Requirements da vaga.',
};

const GENERATION_LABELS: Readonly<Record<NonNullable<ResumeDocumentResponse['generationStep']>, string>> = {
  planning: 'Montando o Adaptation Plan.',
  writing: 'Escrevendo as Sections e as Suggestions.',
  suggesting: 'Escrevendo as Sections e as Suggestions.',
  saving: 'Salvando o currículo.',
};

const GENERATION_POSITION: Readonly<Record<NonNullable<ResumeDocumentResponse['generationStep']>, { readonly current: number; readonly total: number }>> = {
  planning: { current: 1, total: 3 },
  writing: { current: 2, total: 3 },
  suggesting: { current: 2, total: 3 },
  saving: { current: 3, total: 3 },
};

interface ActivityState {
  readonly message: string;
  readonly current?: number;
  readonly total?: number;
}

function importState(status: ResumeImportResponse['status']): ActivityState | null {
  if (status === 'queued' || status === 'extracting' || status === 'structuring') {
    return { message: IMPORT_LABELS[status], ...IMPORT_POSITION[status] };
  }
  return null;
}

function evaluationState(status: EvaluationResponse['status']): ActivityState | null {
  if (status === 'queued' || status === 'analyzing') return { message: EVALUATION_LABELS[status] };
  return null;
}

function generationState(
  status: ResumeDocumentResponse['generationStatus'] | null | undefined,
  step: ResumeDocumentResponse['generationStep'],
): ActivityState | null {
  if (status !== 'generating') return null;
  if (step === null || step === undefined) return { message: 'Gerando o currículo.' };
  return { message: GENERATION_LABELS[step], ...GENERATION_POSITION[step] };
}

export function AiProgress({
  importStatus = null,
  evaluationStatus = null,
  generationStatus = null,
  generationStep = null,
}: AiProgressProps): React.JSX.Element {
  const state =
    (importStatus === null ? null : importState(importStatus)) ??
    (evaluationStatus === null ? null : evaluationState(evaluationStatus)) ??
    generationState(generationStatus, generationStep) ??
    null;
  const announced =
    state === null
      ? ''
      : state.current !== undefined && state.total !== undefined
        ? `${state.message} ${String(state.current)} de ${String(state.total)}`
        : state.message;
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <span className="sr-only">{announced}</span>
      {state !== null && (
        <AiActivity message={state.message} current={state.current} total={state.total} />
      )}
    </div>
  );
}
