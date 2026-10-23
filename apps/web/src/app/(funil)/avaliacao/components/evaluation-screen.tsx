'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { EvaluationResponse, RequirementCoverageResponse } from 'schema/contracts/evaluation';
import { denyGap, undenyGap } from '../../../../lib/api-client';
import { failureReasonMessage } from '../../../../lib/ai-error-messages';
import { useEvaluationStatus } from '../../../../hooks/use-evaluation-status';
import { Button } from '../../../../components/button';
import { ErrorMessage } from '../../../../components/error-message';
import { StatusRegion } from '../../../../components/status-region';
import { AiProgress } from '../../../../components/wizard/ai-progress';
import { Card } from '../../../../components/ui/card';
import { SegmentedControl } from '../../../../components/ui/segmented-control';
import { StatusBadge } from '../../../../components/ui/status-badge';
import { MATCH_COUNT_MS, PROGRESS_BAR_MS } from '../../../../lib/motion';

const MATCH_SCORE_MAX_LABEL = 'de 100';

const KIND_LABELS: Readonly<Record<RequirementCoverageResponse['kind'], string>> = {
  mandatory: 'Obrigatório',
  desirable: 'Desejável',
};

const LOADING_MESSAGE = 'Carregando o andamento da Evaluation.';
const EVALUATION_FAILED_MESSAGE =
  'A análise não conseguiu terminar desta vez. Nenhuma Evaluation extra foi criada e nada do ' +
  'seu perfil mudou. Recarregue esta página para tentar de novo.';
const POLL_NOT_FOUND_MESSAGE =
  'Não encontramos esta Evaluation. Ela pode ter sido apagada.';
const DENY_FAILED_MESSAGE =
  'Não foi possível registrar sua resposta agora. O item continua como estava — tente de novo.';
const UNDENY_FAILED_MESSAGE =
  'Não foi possível desfazer sua resposta agora. O item continua como estava — tente de novo.';
const UNDENY_SUCCESS_MESSAGE = 'Resposta desfeita. O item volta a ser um Gap.';
const DENIED_NOTICE =
  'Você respondeu que não tem isso. O Match Score continua contando este item, e ele não volta ' +
  'a ser perguntado — nem nesta vaga, nem nas próximas.';
const DENY_SCORE_NOTICE =
  'Responder agora não muda o Match Score: ele continua contando este item. O que muda é que ' +
  'ele deixa de ser perguntado em toda vaga futura.';
const GAP_INTRO =
  'Ainda não há uma Evidence do seu Career Profile sobre isto. Um Gap não é uma reprovação: é ' +
  'a deixa para o que buscar ou responder.';

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function useAnimatedScore(
  evaluationId: string | null,
  score: number | null,
  ready: boolean,
): number | null {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState<number | null>(() => score);
  const animatedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || score === null || evaluationId === null) return;
    const key = `${evaluationId}:${String(score)}`;
    if (reduceMotion === true) {
      animatedKey.current = key;
      setDisplay(score);
      return;
    }
    if (animatedKey.current === key) {
      setDisplay(score);
      return;
    }
    animatedKey.current = key;
    setDisplay(0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / MATCH_COUNT_MS, 1);
      setDisplay(Math.round(easeOutCubic(progress) * score));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [evaluationId, score, ready, reduceMotion]);

  return display;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

function statusFor(coverage: RequirementCoverageResponse): string {
  // The denial is keyed by concept on the API side; only a Gap answered as absent is a
  // response. A covered item never presents as pending, and never as merely answered.
  if (coverage.denied && coverage.coverage === 'gap') return 'Respondido';
  if (coverage.coverage === 'covered') return 'Coberto';
  if (coverage.coverage === 'partial') return 'Parcial';
  return 'Gap';
}

interface CoverageItemProps {
  readonly coverage: RequirementCoverageResponse;
  readonly onDeny: (requirementId: string) => void;
  readonly isDenying: boolean;
  readonly onUndeny: (requirementId: string) => void;
  readonly isUndenying: boolean;
}

function CoverageItem({
  coverage,
  onDeny,
  isDenying,
  onUndeny,
  isUndenying,
}: CoverageItemProps): React.JSX.Element {
  // The statement, not the id: RF-23 exists so the person can judge whether the coverage is
  // fair, and nobody can judge a UUID.
  const showsEvidence = coverage.evidenceStatement !== null && coverage.coverage !== 'gap';
  const isDeniedGap = coverage.denied && coverage.coverage === 'gap';
  const canDeny = coverage.coverage === 'gap' && !coverage.denied;
  return (
    <li className="grid gap-[14px] px-4 py-[14px] [grid-template-columns:88px_minmax(0,1fr)_auto]">
      <div className="flex items-start">
        {isDeniedGap ? (
          <span className="inline-flex h-[22px] items-center rounded-md bg-surface-2 px-2 text-xs font-semibold text-text-2">
            {statusFor(coverage)}
          </span>
        ) : (
          <StatusBadge status={coverage.coverage} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-text">{coverage.literalTerm}</p>
        <p className="text-xs text-text-3">{KIND_LABELS[coverage.kind]}</p>
        <p className="text-[13px] text-text-2">{coverage.concept}</p>
        {showsEvidence && (
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-semibold text-text">Evidence que cobre este item</p>
            <blockquote className="text-[13px] text-text-2">{coverage.evidenceStatement}</blockquote>
            <p className="text-[13px] text-text-2">{coverage.rationale}</p>
          </div>
        )}
        {canDeny && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-text-2">{GAP_INTRO}</p>
            <p className="text-[13px] text-text-2">{coverage.rationale}</p>
            <p className="text-[13px] text-text-2">{DENY_SCORE_NOTICE}</p>
          </div>
        )}
        {coverage.denied && <p className="text-[13px] text-text-2">{DENIED_NOTICE}</p>}
      </div>
      <div className="flex items-start">
        {canDeny && (
          <Button variant="secondary" size="xs" onClick={() => onDeny(coverage.requirementId)} disabled={isDenying}>
            Não tenho isso
          </Button>
        )}
        {isDeniedGap && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onUndeny(coverage.requirementId)}
            disabled={isUndenying}
          >
            Desfazer
          </Button>
        )}
      </div>
    </li>
  );
}

type CoverageFilter = 'all' | 'covered' | 'partial' | 'gap';

interface CoverageListProps {
  readonly coverages: readonly RequirementCoverageResponse[];
  readonly onDeny: (requirementId: string) => void;
  readonly denyingRequirementId: string | null;
  readonly onUndeny: (requirementId: string) => void;
  readonly undenyingRequirementId: string | null;
}

function CoverageList({
  coverages,
  onDeny,
  denyingRequirementId,
  onUndeny,
  undenyingRequirementId,
}: CoverageListProps): React.JSX.Element {
  const [filter, setFilter] = useState<CoverageFilter>('all');
  const coveredCount = coverages.filter((coverage) => coverage.coverage === 'covered').length;
  const partialCount = coverages.filter((coverage) => coverage.coverage === 'partial').length;
  const gapCount = coverages.filter((coverage) => coverage.coverage === 'gap').length;
  const filtered =
    filter === 'all' ? coverages : coverages.filter((coverage) => coverage.coverage === filter);

  function handleFilterChange(value: string): void {
    if (value === 'all' || value === 'covered' || value === 'partial' || value === 'gap') {
      setFilter(value);
    }
  }

  return (
    <section aria-label="Cobertura requirement a requirement" className="flex flex-col gap-4">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-text">O que a vaga pede, item a item</h2>
      <SegmentedControl
        options={[
          { value: 'all', label: 'Todos', count: coverages.length },
          { value: 'covered', label: 'Cobertos', count: coveredCount },
          { value: 'partial', label: 'Parciais', count: partialCount },
          { value: 'gap', label: 'Gaps', count: gapCount },
        ]}
        value={filter}
        onChange={handleFilterChange}
        ariaLabel="Filtrar requirements por status"
        className="self-start"
      />
      <Card className="overflow-hidden">
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map((coverage) => (
            <CoverageItem
              key={coverage.requirementId}
              coverage={coverage}
              onDeny={onDeny}
              isDenying={denyingRequirementId === coverage.requirementId}
              onUndeny={onUndeny}
              isUndenying={undenyingRequirementId === coverage.requirementId}
            />
          ))}
        </ul>
      </Card>
    </section>
  );
}

interface ScoreCardProps {
  readonly evaluation: EvaluationResponse;
  readonly displayScore: number | null;
}

function ScoreCard({ evaluation, displayScore }: ScoreCardProps): React.JSX.Element {
  const score = evaluation.matchScore ?? 0;
  const shown = displayScore ?? score;
  const coverages = evaluation.requirementCoverages;
  const coveredCount = coverages.filter((coverage) => coverage.coverage === 'covered').length;
  const partialCount = coverages.filter((coverage) => coverage.coverage === 'partial').length;
  const gapCount = coverages.filter((coverage) => coverage.coverage === 'gap').length;
  return (
    <section aria-label="Match Score">
      <Card className="flex flex-wrap items-end gap-8 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-[13px] font-medium text-text-2">Match Score</h2>
          <p role="img" aria-label={`Match Score: ${String(score)} de 100`} className="flex items-baseline gap-2">
            <span className="inline-block min-w-[2ch] text-[72px] font-semibold leading-[0.95] tracking-[-0.045em] tabular-nums text-text">
              {String(shown)}
            </span>
            <span className="text-[15px] text-text-3">{MATCH_SCORE_MAX_LABEL}</span>
          </p>
          <p className="max-w-[420px] text-sm text-text-2">
            O número orienta; a lista abaixo é o que dá para usar: ela aponta, item por item, a
            Evidence que comprova cada Requirement da vaga.
          </p>
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-2">
          <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent"
              style={{
                width: `${String(score)}%`,
                transition: `width ${String(PROGRESS_BAR_MS)}ms ease-out`,
              }}
            />
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] tabular-nums">
            <span className="text-ok">● {countLabel(coveredCount, 'coberto', 'cobertos')}</span>
            <span className="text-warn">● {countLabel(partialCount, 'parcial', 'parciais')}</span>
            <span className="text-text-3">○ {countLabel(gapCount, 'gap', 'gaps')}</span>
          </p>
        </div>
      </Card>
    </section>
  );
}

interface ReadyResultProps {
  readonly evaluation: EvaluationResponse;
  readonly isDenyFailed: boolean;
  readonly denyingRequirementId: string | null;
  readonly onDeny: (requirementId: string) => void;
  readonly isUndenyFailed: boolean;
  readonly undenyingRequirementId: string | null;
  readonly onUndeny: (requirementId: string) => void;
}

function ReadyResult({
  evaluation,
  isDenyFailed,
  denyingRequirementId,
  onDeny,
  isUndenyFailed,
  undenyingRequirementId,
  onUndeny,
}: ReadyResultProps): React.JSX.Element {
  const displayScore = useAnimatedScore(
    evaluation.id,
    evaluation.matchScore,
    evaluation.status === 'ready',
  );
  return (
    <div className="flex flex-col gap-6">
      <ScoreCard evaluation={evaluation} displayScore={displayScore} />
      <CoverageList
        coverages={evaluation.requirementCoverages}
        onDeny={onDeny}
        denyingRequirementId={denyingRequirementId}
        onUndeny={onUndeny}
        undenyingRequirementId={undenyingRequirementId}
      />
      {isDenyFailed && <ErrorMessage message={DENY_FAILED_MESSAGE} />}
      {isUndenyFailed && <ErrorMessage message={UNDENY_FAILED_MESSAGE} />}
    </div>
  );
}

interface EvaluationScreenProps {
  readonly evaluationId: string;
  readonly jobDescriptionId?: string | null;
}

export function EvaluationScreen({
  evaluationId,
}: EvaluationScreenProps): React.JSX.Element {
  const { evaluation, pollErrorKind, refresh } = useEvaluationStatus(evaluationId);
  const [denyingRequirementId, setDenyingRequirementId] = useState<string | null>(null);
  const [isDenyFailed, setIsDenyFailed] = useState(false);
  const [undenyingRequirementId, setUndenyingRequirementId] = useState<string | null>(null);
  const [isUndenyFailed, setIsUndenyFailed] = useState(false);
  const [undenyNotice, setUndenyNotice] = useState('');
  const isRunning =
    evaluation !== null && (evaluation.status === 'queued' || evaluation.status === 'analyzing');

  function deny(requirementId: string): void {
    setDenyingRequirementId(requirementId);
    setIsDenyFailed(false);
    setUndenyNotice('');
    void (async () => {
      try {
        await denyGap(evaluationId, requirementId);
        refresh();
      } catch {
        setIsDenyFailed(true);
      } finally {
        setDenyingRequirementId(null);
      }
    })();
  }

  function undeny(requirementId: string): void {
    setUndenyingRequirementId(requirementId);
    setIsUndenyFailed(false);
    setUndenyNotice('');
    void (async () => {
      try {
        await undenyGap(evaluationId, requirementId);
        setUndenyNotice(UNDENY_SUCCESS_MESSAGE);
        refresh();
      } catch {
        setIsUndenyFailed(true);
      } finally {
        setUndenyingRequirementId(null);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-6">
      {renderBody()}
      {isRunning ? (
        <Card className="p-4">
          <AiProgress evaluationStatus={evaluation?.status ?? null} />
        </Card>
      ) : (
        <AiProgress evaluationStatus={evaluation?.status ?? null} />
      )}
      <StatusRegion>{announcement()}</StatusRegion>
    </div>
  );

  function renderBody(): React.JSX.Element | null {
    if (pollErrorKind !== null) {
      return <ErrorMessage message={POLL_NOT_FOUND_MESSAGE} />;
    }
    if (evaluation === null) {
      return <p className="font-medium text-text">{LOADING_MESSAGE}</p>;
    }
    if (evaluation.status === 'failed') {
      return <ErrorMessage message={failureReasonMessage(evaluation.failureReason, EVALUATION_FAILED_MESSAGE)} />;
    }
    if (evaluation.status === 'queued' || evaluation.status === 'analyzing') {
      return null;
    }
    return (
      <ReadyResult
        evaluation={evaluation}
        isDenyFailed={isDenyFailed}
        denyingRequirementId={denyingRequirementId}
        onDeny={deny}
        isUndenyFailed={isUndenyFailed}
        undenyingRequirementId={undenyingRequirementId}
        onUndeny={undeny}
      />
    );
  }

  function announcement(): string {
    if (pollErrorKind !== null || evaluation === null || evaluation.status === 'failed')
      return undenyNotice;
    if (evaluation.status === 'queued' || evaluation.status === 'analyzing') return undenyNotice;
    const readyMessage = `Evaluation pronta. Match Score ${String(evaluation.matchScore)} ${MATCH_SCORE_MAX_LABEL}.`;
    if (undenyNotice !== '') return `${readyMessage} ${undenyNotice}`;
    return readyMessage;
  }
}
