import { useEffect, useState } from 'react';
import type { ResumeImportResponse } from 'schema/contracts/resume-import';
import { ApiError, getResumeImport } from '../lib/api-client';

const POLL_INTERVAL_MS = 1500;
const HTTP_NOT_FOUND = 404;

// The worker leaves 'queued', 'extracting' and 'structuring' behind; the last three states
// end the polling. The list is typed against the contract so a new status forces a decision here.
const TERMINAL_STATUSES: readonly ResumeImportResponse['status'][] = [
  'ready_for_review',
  'confirmed',
  'failed',
];

export type ResumeImportPollErrorKind = 'not-found';

export interface ResumeImportStatus {
  readonly resumeImport: ResumeImportResponse | null;
  readonly pollErrorKind: ResumeImportPollErrorKind | null;
}

// SSE and WebSocket were rejected in the techspec; a fixed-interval GET is the chosen
// transport for import progress.
export function useResumeImportStatus(resumeImportId: string | null): ResumeImportStatus {
  const [resumeImport, setResumeImport] = useState<ResumeImportResponse | null>(null);
  const [pollErrorKind, setPollErrorKind] = useState<ResumeImportPollErrorKind | null>(null);

  useEffect(() => {
    if (resumeImportId === null) return;
    const importId = resumeImportId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function pollOnce(): Promise<void> {
      try {
        const current = await getResumeImport(importId);
        if (cancelled) return;
        setResumeImport(current);
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
  }, [resumeImportId]);

  return { resumeImport, pollErrorKind };
}

// A 404 cannot heal on a later tick, so polling stops. Anything else is treated as a
// blip: the next tick overwrites the stale state, so an offline second never kills the screen.
function fatalPollErrorKindOf(error: unknown): ResumeImportPollErrorKind | null {
  if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) return 'not-found';
  return null;
}
