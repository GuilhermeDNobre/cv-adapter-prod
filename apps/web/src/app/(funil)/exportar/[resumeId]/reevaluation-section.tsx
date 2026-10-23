'use client';
import { useEffect, useState } from 'react';
import type { ResumeReevaluationLatestResponse } from 'schema/contracts/evaluation';
import { createResumeEvaluation, getLatestResumeEvaluation } from '../../../../lib/api-client';
import { failureReasonMessage } from '../../../../lib/ai-error-messages';
import { Button } from '../../../../components/button';
import { ErrorMessage } from '../../../../components/error-message';
import { StatusRegion } from '../../../../components/status-region';
import { Card } from '../../../../components/ui/card';
import { StatusBadge } from '../../../../components/ui/status-badge';

const POLL_INTERVAL_MS = 1500;
const LOADING_MESSAGE = 'Avaliação do currículo em andamento.';
const LOAD_FAILED_MESSAGE =
  'Não foi possível carregar a reavaliação agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';
const EVALUATION_FAILED_MESSAGE =
  'A reavaliação não conseguiu terminar desta vez. A exportação continua disponível abaixo.';
const KIND_LABELS = { mandatory: 'Obrigatório', desirable: 'Desejável' } as const;

type ReevaluationStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ResumeReevaluationLatestResponse }
  | { readonly kind: 'failedEvaluation'; readonly data: ResumeReevaluationLatestResponse }
  | { readonly kind: 'failed'; readonly message: string };

interface ReevaluationSectionProps {
  readonly resumeId: string;
  readonly resumeUpdatedAt: string;
}

function isTerminal(status: string): boolean {
  return status === 'ready' || status === 'failed';
}

function isFresh(latestUpdatedAt: string, resumeUpdatedAt: string): boolean {
  return new Date(latestUpdatedAt).getTime() >= new Date(resumeUpdatedAt).getTime();
}

function toStage(data: ResumeReevaluationLatestResponse): ReevaluationStage {
  if (data.status === 'failed') {
    return { kind: 'failedEvaluation', data };
  }
  return { kind: 'ready', data };
}

export function ReevaluationSection({ resumeId, resumeUpdatedAt }: ReevaluationSectionProps): React.JSX.Element {
  const [stage, setStage] = useState<ReevaluationStage>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function ensureFreshEvaluation(): Promise<ResumeReevaluationLatestResponse | null> {
      try {
        const latest = await getLatestResumeEvaluation(resumeId);
        if (cancelled) {
          return null;
        }
        if (isFresh(latest.updatedAt, resumeUpdatedAt) || isTerminal(latest.status)) {
          if (isFresh(latest.updatedAt, resumeUpdatedAt)) {
            return latest;
          }
        }
        const created = await createResumeEvaluation(resumeId);
        if (cancelled) {
          return null;
        }
        void created;
        return await getLatestResumeEvaluation(resumeId);
      } catch (error: unknown) {
        if (cancelled) {
          return null;
        }
        const status = error !== null && typeof error === 'object' && 'status' in error ? (error as { status: unknown }).status : null;
        if (status === 404) {
          const created = await createResumeEvaluation(resumeId);
          if (cancelled) {
            return null;
          }
          void created;
          return await getLatestResumeEvaluation(resumeId);
        }
        throw error;
      }
    }
    async function pollOnce(): Promise<void> {
      try {
        const current = await ensureFreshEvaluation();
        if (cancelled || current === null) {
          return;
        }
        if (!isTerminal(current.status)) {
          setStage({ kind: 'loading' });
          timer = setTimeout(() => void pollOnce(), POLL_INTERVAL_MS);
          return;
        }
        setStage(toStage(current));
      } catch {
        if (!cancelled) {
          setStage({ kind: 'failed', message: LOAD_FAILED_MESSAGE });
        }
      }
    }
    setStage({ kind: 'loading' });
    void pollOnce();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [resumeId, resumeUpdatedAt, reloadToken]);
  if (stage.kind === 'loading') {
    return (
      <section aria-label="Reavaliação de compatibilidade" className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text">Compatibilidade com a vaga</h3>
        <Card className="p-4">
          <p className="text-[13px] text-text-2">{LOADING_MESSAGE}</p>
        </Card>
        <StatusRegion>{LOADING_MESSAGE}</StatusRegion>
      </section>
    );
  }
  if (stage.kind === 'failed') {
    return (
      <section aria-label="Reavaliação de compatibilidade" className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text">Compatibilidade com a vaga</h3>
        <ErrorMessage message={stage.message} />
        <div>
          <Button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar de novo
          </Button>
        </div>
        <StatusRegion>{''}</StatusRegion>
      </section>
    );
  }
  if (stage.kind === 'failedEvaluation') {
    return (
      <section aria-label="Reavaliação de compatibilidade" className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text">Compatibilidade com a vaga</h3>
        <ErrorMessage message={failureReasonMessage(stage.data.failureReason, EVALUATION_FAILED_MESSAGE)} />
        <div>
          <Button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar de novo
          </Button>
        </div>
        <StatusRegion>{''}</StatusRegion>
      </section>
    );
  }
  const data = stage.data;
  const baselineScore = data.baseline?.matchScore ?? null;
  const currentScore = data.matchScore ?? 0;
  const headline = baselineScore === null ? `Compatibilidade: ${String(currentScore)}%` : `Compatibilidade: ${String(baselineScore)}% → ${String(currentScore)}%`;
  const improved = data.comparisons.filter((item) => item.improved);
  const missing = data.comparisons.filter((item) => item.coverageAfter === 'gap');
  return (
    <section aria-label="Reavaliação de compatibilidade" className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text">Compatibilidade com a vaga</h3>
      <Card className="flex flex-col gap-4 p-4">
        <p className="font-medium text-text">{headline}</p>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-text">Melhorou</h4>
          {improved.length === 0 ? (
            <p className="text-[13px] text-text-2">Nenhum Requirement melhorou.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {improved.map((item) => (
                <li key={item.requirementId} className="text-[13px] text-text-2">
                  {item.literalTerm}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-text">Ainda falta</h4>
          {missing.length === 0 ? (
            <p className="text-[13px] text-text-2">Nada faltando.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {missing.map((item) => (
                <li key={item.requirementId} className="flex items-center gap-2 text-[13px] text-text-2">
                  <StatusBadge status={item.coverageAfter} />
                  <span>{item.literalTerm}</span>
                  <span className="text-xs text-text-3">{KIND_LABELS[item.kind]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <StatusRegion>{headline}</StatusRegion>
    </section>
  );
}
