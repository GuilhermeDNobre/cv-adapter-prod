'use client';

import { useState } from 'react';
import type { ResumeBulletResponse, ResumeDocumentResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, approveSuggestion, denySuggestion, updateBullet } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';

const WORKING_ANNOUNCEMENT = 'Registrando sua decisão sobre o rascunho.';
const DECIDED_ANNOUNCEMENT = 'Decisão sobre o rascunho registrada.';
const UNREACHABLE_MESSAGE =
  'Não foi possível registrar agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

interface SuggestionCardProps {
  readonly bullet: ResumeBulletResponse;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
}

export function SuggestionCard({ bullet, onDocumentChange }: SuggestionCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(bullet.text);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [decided, setDecided] = useState(false);
  const textAreaId = `suggestion-${bullet.id}-text`;

  function failureMessageOf(error: unknown): string {
    const code = aiErrorCodeOf(error);
    if (code !== null) return aiErrorMessageForCode(code);
    return UNREACHABLE_MESSAGE;
  }

  function runDecision(action: () => Promise<ResumeDocumentResponse>): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setDecided(false);
    void (async () => {
      try {
        const document = await action();
        onDocumentChange(document);
        setEditing(false);
        setDecided(true);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function saveEdit(): void {
    const next = text.trim();
    if (next === '') return;
    runDecision(async () => {
      await updateBullet(bullet.id, { text: next });
      return approveSuggestion(bullet.id);
    });
  }

  const originMessage =
    bullet.gapKind === 'detail'
      ? 'A IA escreveu isto a partir da sua Evidence, mas o texto afirma algo que ela não comprova. Ele não vai para o PDF enquanto você não aprovar ou editar.'
      : 'A IA escreveu este rascunho a partir de experiência adjacente. Ele não vai para o PDF enquanto você não aprovar ou editar.';

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-dashed border-warn bg-warn-soft p-3">
      <p className="w-fit rounded bg-warn-soft px-2 py-0.5 text-sm font-bold text-warn">
        Rascunho não confirmado
      </p>
      {bullet.suggestionQuestion !== null && (
        <p className="font-medium text-text">{bullet.suggestionQuestion}</p>
      )}
      <p className="text-text">{bullet.text}</p>
      <p className="text-sm text-text-2">{originMessage}</p>
      {!editing && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={isBusy} onClick={() => runDecision(() => approveSuggestion(bullet.id))}>
            Aprovar
          </Button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setText(bullet.text);
              setFailure(null);
              setEditing(true);
            }}
            className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => runDecision(() => denySuggestion(bullet.id))}
            className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
          >
            Não tenho isso
          </button>
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-2">
          <label htmlFor={textAreaId} className="font-medium text-text">
            Assuma o texto com suas palavras
          </label>
          <textarea
            id={textAreaId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            className="rounded-md border border-border-strong bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          <div className="flex gap-2">
            <Button type="button" disabled={text.trim() === '' || isBusy} onClick={saveEdit}>
              Salvar edição
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? WORKING_ANNOUNCEMENT : decided ? DECIDED_ANNOUNCEMENT : ''}</StatusRegion>
    </div>
  );
}
