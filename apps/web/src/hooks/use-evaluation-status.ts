import { useCallback, useEffect, useState } from 'react';
import type { EvaluationResponse } from 'schema/contracts/evaluation';
import { ApiError, getEvaluation } from '../lib/api-client';

const POLL_INTERVAL_MS = 1500;
const HTTP_NOT_FOUND = 404;

// The processor leaves 'queued' and 'analyzing' behind; 'ready' and 'failed' end the polling.
// The list is typed against the contract so a new status forces a decision here.
const TERMINAL_STATUSES: readonly EvaluationResponse['status'][] = ['ready', 'failed'];

export type EvaluationPollErrorKind = 'not-found';

export interface EvaluationStatus {
  readonly evaluation: EvaluationResponse | null;
  readonly pollErrorKind: EvaluationPollErrorKind | null;
  readonly refresh: () => void;
}

// Same fixed-interval GET the import polling uses: SSE and WebSocket were rejected in the
// techspec. refresh re-reads a terminal evaluation once — a denied Gap is server state, so
// the screen never reconciles locally what the next GET already knows.
export function useEvaluationStatus(evaluationId: string | null): EvaluationStatus {
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [pollErrorKind, setPollErrorKind] = useState<EvaluationPollErrorKind | null>(null);
  const [rereadToken, setRereadToken] = useState(0);

  const refresh = useCallback(() => {
    setRereadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (evaluationId === null) return;
    const id = evaluationId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function pollOnce(): Promise<void> {
      try {
        const current = await getEvaluation(id);
        if (cancelled) return;
        setEvaluation(current);
        if (TERMINAL_STATUSES.includes(current.status)) return;
      } catch (error: unknown) {
        if (cancelled) return;
        const kind = fatalPollErrorKindOf(error);
        if (kind !== null) {
          setPollErrorKind(kind);
          return;
        }
      }
      timer = setTimeout(() => void pollOnce(), POLL_INTERVAL_MS);
    }

    void pollOnce();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [evaluationId, rereadToken]);

  return { evaluation, pollErrorKind, refresh };
}

// A 404 cannot heal on a later tick, so polling stops. Anything else is treated as a
// blip: the next tick overwrites the stale state, so an offline second never kills the screen.
function fatalPollErrorKindOf(error: unknown): EvaluationPollErrorKind | null {
  if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) return 'not-found';
  return null;
}
