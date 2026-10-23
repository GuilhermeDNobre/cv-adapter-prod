'use client';

import { useRef, useState } from 'react';
import type { ResumeBulletResponse, ResumeDocumentResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, updateBullet } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';
import { EvidenceCorrection } from './evidence-correction';

const SAVED_ANNOUNCEMENT = 'Bullet salvo.';
const SAVING_ANNOUNCEMENT = 'Salvando o Bullet.';
const UNREACHABLE_MESSAGE =
  'Não foi possível salvar o Bullet. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

interface BulletEditorProps {
  readonly bullet: ResumeBulletResponse;
  readonly experienceId: string | null;
  readonly resumeId: string;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
}

export function BulletEditor({
  bullet,
  experienceId,
  resumeId,
  onDocumentChange,
}: BulletEditorProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(bullet.text);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const correctButtonRef = useRef<HTMLButtonElement | null>(null);
  const textAreaId = `bullet-${bullet.id}-text`;

  function failureMessageOf(error: unknown): string {
    const code = aiErrorCodeOf(error);
    if (code !== null) return aiErrorMessageForCode(code);
    return UNREACHABLE_MESSAGE;
  }

  function startEditing(): void {
    setText(bullet.text);
    setFailure(null);
    setSaved(false);
    setEditing(true);
  }

  function save(): void {
    const next = text.trim();
    if (next === '' || isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setSaved(false);
    void (async () => {
      try {
        const document = await updateBullet(bullet.id, { text: next });
        onDocumentChange(document);
        setEditing(false);
        setSaved(true);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function closeCorrection(): void {
    setCorrecting(false);
    correctButtonRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3">
      <p className="text-text">{bullet.text}</p>
      {bullet.needsReview && (
        <p className="font-medium text-warn">
          Este Bullet precisa de revisão: a Evidence de origem mudou e o texto pode afirmar o que
          ela não comprova.
        </p>
      )}
      {bullet.editedByPerson && (
        <p className="text-sm text-text-2">Editado por você neste currículo.</p>
      )}
      {!editing && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={isBusy} onClick={startEditing}>
            Editar
          </Button>
          {bullet.evidenceId !== null && (
            <button
              ref={correctButtonRef}
              type="button"
              onClick={() => setCorrecting(true)}
              className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Corrigir fato de origem
            </button>
          )}
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-2">
          <label htmlFor={textAreaId} className="font-medium text-text">
            Texto do Bullet
          </label>
          <textarea
            id={textAreaId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            className="rounded-md border border-border-strong bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          <div className="flex gap-2">
            <Button type="button" disabled={text.trim() === '' || isBusy} onClick={save}>
              Salvar
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
      {correcting && bullet.evidenceId !== null && (
        <EvidenceCorrection
          evidenceId={bullet.evidenceId}
          experienceId={experienceId}
          resumeId={resumeId}
          onDocumentChange={onDocumentChange}
          onClose={closeCorrection}
        />
      )}
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? SAVING_ANNOUNCEMENT : saved ? SAVED_ANNOUNCEMENT : ''}</StatusRegion>
    </div>
  );
}
