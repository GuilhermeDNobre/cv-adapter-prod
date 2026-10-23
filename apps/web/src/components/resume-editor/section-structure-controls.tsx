'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResumeDocumentResponse, ResumeSectionResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, deleteResumeSection, updateResumeStructure } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';

const MOVED_ANNOUNCEMENT = 'Section movida.';
const REMOVED_ANNOUNCEMENT = 'Section removida.';
const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

interface SectionStructureControlsProps {
  readonly section: ResumeSectionResponse;
  readonly sections: readonly ResumeSectionResponse[];
  readonly resumeId: string;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
  readonly onSectionRemoved: () => void;
}

export function SectionStructureControls({
  section,
  sections,
  resumeId,
  onDocumentChange,
  onSectionRemoved,
}: SectionStructureControlsProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const lastMoveRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirmingRef = useRef(false);

  useEffect(() => {
    if (confirming && !wasConfirmingRef.current) {
      cancelRef.current?.focus();
    }
    if (!confirming && wasConfirmingRef.current) {
      triggerRef.current?.focus();
    }
    wasConfirmingRef.current = confirming;
  }, [confirming]);

  const ordered = [...sections].sort((a, b) => a.ordinal - b.ordinal);
  const index = ordered.findIndex((item) => item.id === section.id);
  const isFirst = index <= 0;
  const isLast = index < 0 || index >= ordered.length - 1;

  function move(direction: 'up' | 'down'): void {
    if (isBusy || index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= ordered.length) return;
    const swapped = [...ordered];
    const current = swapped[index]!;
    const neighbor = swapped[target]!;
    swapped[index] = neighbor;
    swapped[target] = current;
    const payload = { sections: swapped.map((item, ordinal) => ({ id: item.id, ordinal })) };
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const document = await updateResumeStructure(resumeId, payload);
        onDocumentChange(document);
        setNotice(MOVED_ANNOUNCEMENT);
        lastMoveRef.current?.focus();
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function confirmRemove(): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        const document = await deleteResumeSection(section.id);
        onDocumentChange(document);
        setNotice(REMOVED_ANNOUNCEMENT);
        setConfirming(false);
        onSectionRemoved();
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
        setIsBusy(false);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <h4 className="font-semibold text-text">Estrutura da Section</h4>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isFirst}
          onClick={(event) => {
            lastMoveRef.current = event.currentTarget;
            move('up');
          }}
          className="rounded-md border border-border-strong px-3 py-1 text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
        >
          Mover Section para cima
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={(event) => {
            lastMoveRef.current = event.currentTarget;
            move('down');
          }}
          className="rounded-md border border-border-strong px-3 py-1 text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
        >
          Mover Section para baixo
        </button>
      </div>
      <div>
        <button
          ref={triggerRef}
          type="button"
          disabled={isBusy || confirming}
          onClick={() => setConfirming(true)}
          className="rounded-md border border-border-strong px-3 py-1 text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
        >
          Remover Section
        </button>
      </div>
      {confirming && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-text">
            Tem certeza? A Section e seus Bullets somem deste currículo. O Career Profile continua intacto.
          </p>
          <div className="flex gap-2">
            <Button type="button" disabled={isBusy} onClick={confirmRemove}>
              Confirmar remover Section
            </Button>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? 'Movendo a Section.' : notice}</StatusRegion>
    </div>
  );
}
