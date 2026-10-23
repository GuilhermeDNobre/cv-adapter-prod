'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, aiErrorCodeOf, createEvaluation } from '../../../../lib/api-client';
import { aiErrorMessageForCode } from '../../../../lib/ai-error-messages';
import { ErrorMessage } from '../../../../components/error-message';
import { StatusRegion } from '../../../../components/status-region';
import { buttonClasses } from '../../../../components/button';
import { resumeStepHref, wizardQueryOf } from '../../../../components/wizard/wizard-route';

const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const VAGA_ROUTE = '/vaga';
const EVALUATION_ROUTE_PREFIX = '/avaliacao';

const REQUESTING_MESSAGE = 'Preparando sua Evaluation. Isso leva alguns segundos.';
const NO_JOB_MESSAGE =
  'A Evaluation compara seu Career Profile com uma vaga específica. Cole o anúncio de uma vaga para começar.';
const NO_CAREER_PROFILE_MESSAGE =
  'A Evaluation compara a vaga com as Evidences do seu Career Profile, e ele ainda não está ' +
  'pronto. Envie seu currículo e confirme a revisão para liberar a avaliação.';
const JOB_NOT_FOUND_MESSAGE =
  'Não encontramos essa vaga. Cole o anúncio de novo para receber a Evaluation.';
const UNREACHABLE_MESSAGE =
  'Não foi possível falar com o cv-adapter, e nenhuma avaliação foi iniciada. Confira se ele ' +
  'está rodando (docker compose ps) e tente de novo.';

type KickoffStage =
  | { readonly kind: 'requesting' }
  | { readonly kind: 'no-career-profile' }
  | { readonly kind: 'job-not-found' }
  | { readonly kind: 'ai-error'; readonly message: string }
  | { readonly kind: 'unreachable' };

function kickoffStageFor(error: unknown): KickoffStage {
  if (error instanceof ApiError) {
    const aiCode = aiErrorCodeOf(error);
    if (aiCode !== null) return { kind: 'ai-error', message: aiErrorMessageForCode(aiCode) };
    if (error.status === HTTP_UNPROCESSABLE_ENTITY) return { kind: 'no-career-profile' };
    if (error.status === HTTP_NOT_FOUND) return { kind: 'job-not-found' };
  }
  return { kind: 'unreachable' };
}

const LINK_CLASSES = [buttonClasses('primary', 'md'), 'w-fit'].join(' ');

interface ContentNoticeProps {
  readonly heading: string;
  readonly message: string;
  readonly linkHref: string;
  readonly linkLabel: string;
}

function ContentNotice({
  heading,
  message,
  linkHref,
  linkLabel,
}: ContentNoticeProps): React.JSX.Element {
  return (
    <section
      aria-label={heading}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow"
    >
      <h2 className="text-base font-semibold tracking-[-0.01em] text-text">{heading}</h2>
      <p className="text-sm text-text-2">{message}</p>
      <a href={linkHref} className={LINK_CLASSES}>
        {linkLabel}
      </a>
    </section>
  );
}

interface EvaluationKickoffProps {
  readonly jobDescriptionId: string | null;
  readonly baseResumeId?: string;
}

export function EvaluationKickoff({
  jobDescriptionId,
  baseResumeId,
}: EvaluationKickoffProps): React.JSX.Element {
  const router = useRouter();
  const hasRequested = useRef(false);
  const [stage, setStage] = useState<KickoffStage>({ kind: 'requesting' });
  const resolvedId = jobDescriptionId;

  useEffect(() => {
    if (resolvedId === null || hasRequested.current) return;
    hasRequested.current = true;
    void (async () => {
      try {
        const evaluation = await createEvaluation(resolvedId);
        const query = wizardQueryOf({ jobDescriptionId: resolvedId, baseResumeId });
        router.replace(`${EVALUATION_ROUTE_PREFIX}/${evaluation.id}${query}`);
      } catch (error: unknown) {
        setStage(kickoffStageFor(error));
      }
    })();
  }, [resolvedId, baseResumeId, router]);

  if (resolvedId === null) {
    return (
      <ContentNotice
        heading="Nenhuma vaga para avaliar"
        message={NO_JOB_MESSAGE}
        linkHref={VAGA_ROUTE}
        linkLabel="Colar uma vaga"
      />
    );
  }

  const resumeStepLink = resumeStepHref({ jobDescriptionId: resolvedId });

  return (
    <div className="flex flex-col gap-6">
      {stage.kind === 'requesting' && <p className="font-medium text-text">{REQUESTING_MESSAGE}</p>}
      {stage.kind === 'no-career-profile' && (
        <ContentNotice
          heading="Seu Career Profile ainda não está pronto"
          message={NO_CAREER_PROFILE_MESSAGE}
          linkHref={resumeStepLink}
          linkLabel="Enviar currículo"
        />
      )}
      {stage.kind === 'job-not-found' && (
        <ContentNotice
          heading="Vaga não encontrada"
          message={JOB_NOT_FOUND_MESSAGE}
          linkHref={VAGA_ROUTE}
          linkLabel="Colar a vaga de novo"
        />
      )}
      {stage.kind === 'unreachable' && <ErrorMessage message={UNREACHABLE_MESSAGE} />}
      {stage.kind === 'ai-error' && <ErrorMessage message={stage.message} />}
      <StatusRegion>{stage.kind === 'requesting' ? REQUESTING_MESSAGE : ''}</StatusRegion>
    </div>
  );
}
