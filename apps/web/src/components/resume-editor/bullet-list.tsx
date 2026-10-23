'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResumeBulletResponse, ResumeDocumentResponse, ResumeEntryResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, deleteResumeBullet, moveResumeBullet } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';
import { BulletEditor } from './bullet-editor';
import { SuggestionCard } from './suggestion-card';

const MOVED_ANNOUNCEMENT = 'Bullet movido.';
const REMOVED_ANNOUNCEMENT = 'Bullet removido.';
const BULLET_LABEL_LIMIT = 40;
const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

function bulletSnippet(text: string): string {
  const singleLine = text.trim().replace(/\s+/g, ' ');
  if (singleLine.length <= BULLET_LABEL_LIMIT) return singleLine;
  return `${singleLine.slice(0, BULLET_LABEL_LIMIT)}…`;
}

interface BulletListProps {
  readonly entry: ResumeEntryResponse;
  readonly experienceId: string | null;
  readonly resumeId: string;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
  readonly onEmptyFocus: () => void;
}

export function BulletList({ entry, experienceId, resumeId, onDocumentChange, onEmptyFocus }: BulletListProps): React.JSX.Element {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const previousConfirmingRef = useRef<string | null>(null);
  const skipRestoreRef = useRef(false);

  useEffect(() => {
    if (confirmingId !== null) {
      previousConfirmingRef.current = confirmingId;
      cancelRef.current?.focus();
      return;
    }
    if (previousConfirmingRef.current !== null && !skipRestoreRef.current) {
      triggerRefs.current.get(previousConfirmingRef.current)?.focus();
    }
    previousConfirmingRef.current = null;
    skipRestoreRef.current = false;
  }, [confirmingId]);

  const ordered = [...entry.bullets].sort((a, b) => a.ordinal - b.ordinal);

  function move(bullet: ResumeBulletResponse, direction: 'up' | 'down', button: HTMLButtonElement): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const document = await moveResumeBullet(bullet.id, { direction });
        onDocumentChange(document);
        setNotice(MOVED_ANNOUNCEMENT);
        button.focus();
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function confirmRemove(bullet: ResumeBulletResponse): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        const document = await deleteResumeBullet(bullet.id);
        const assumed = ordered.filter((item) => item.status !== 'suggestion' && item.id !== bullet.id);
        const assumedBefore = ordered.filter((item) => item.status !== 'suggestion');
        const index = assumedBefore.findIndex((item) => item.id === bullet.id);
        const next = assumed[index] ?? assumed[index - 1];
        skipRestoreRef.current = true;
        setConfirmingId(null);
        onDocumentChange(document);
        setNotice(REMOVED_ANNOUNCEMENT);
        setIsBusy(false);
        if (next === undefined) {
          onEmptyFocus();
        } else {
          triggerRefs.current.get(next.id)?.focus();
        }
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
        setIsBusy(false);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((bullet, bulletIndex) => {
        if (bullet.status === 'suggestion') {
          return (
            <SuggestionCard key={bullet.id} bullet={bullet} onDocumentChange={onDocumentChange} />
          );
        }
        const bulletNumber = bulletIndex + 1;
        const snippet = bulletSnippet(bullet.text);
        return (
          <div key={bullet.id} className="flex flex-col gap-2">
            <BulletEditor bullet={bullet} experienceId={experienceId} resumeId={resumeId} onDocumentChange={onDocumentChange} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-label={`Mover para cima o Bullet ${String(bulletNumber)}: ${snippet}`}
              disabled={bulletIndex === 0}
              onClick={(event) => move(bullet, 'up', event.currentTarget)}
              className="rounded-md border border-border-strong px-3 py-1 text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
            >
              Mover para cima
            </button>
            <button
              type="button"
              aria-label={`Mover para baixo o Bullet ${String(bulletNumber)}: ${snippet}`}
              disabled={bulletIndex === ordered.length - 1}
              onClick={(event) => move(bullet, 'down', event.currentTarget)}
              className="rounded-md border border-border-strong px-3 py-1 text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
            >
              Mover para baixo
            </button>
              <button
                ref={(node) => {
                  triggerRefs.current.set(bullet.id, node);
                }}
                type="button"
                aria-label={`Remover o Bullet ${String(bulletNumber)}: ${snippet}`}
                disabled={isBusy || confirmingId !== null}
                onClick={() => setConfirmingId(bullet.id)}
                className="rounded-md border border-border-strong px-3 py-1 text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
              >
                Remover
              </button>
            </div>
            {confirmingId === bullet.id && (
              <div className="flex flex-col gap-2 rounded-md border border-border p-2">
                <p className="font-medium text-text">
                  Tem certeza? O Bullet sai deste currículo. A Evidence de origem continua no Career Profile.
                </p>
                <div className="flex gap-2">
                  <Button type="button" disabled={isBusy} onClick={() => confirmRemove(bullet)}>
                    Confirmar remover Bullet
                  </Button>
                  <button
                    ref={cancelRef}
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? 'Movendo o Bullet.' : notice}</StatusRegion>
    </div>
  );
}
