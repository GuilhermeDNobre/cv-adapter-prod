'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResumeDocumentResponse, ResumeSectionResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, addCustomSectionItem, deleteCustomSectionEntry } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';

const ADDED_ANNOUNCEMENT = 'Item adicionado.';
const REMOVED_ANNOUNCEMENT = 'Item removido.';
const ITEM_LABEL_LIMIT = 40;
const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

function itemSnippet(heading: string | null): string {
  const singleLine = (heading ?? '(sem título)').trim().replace(/\s+/g, ' ');
  if (singleLine.length <= ITEM_LABEL_LIMIT) return singleLine;
  return `${singleLine.slice(0, ITEM_LABEL_LIMIT)}…`;
}

interface CustomSectionItemsProps {
  readonly section: ResumeSectionResponse;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
  readonly onEmptyFocus: () => void;
}

export function CustomSectionItems({ section, onDocumentChange, onEmptyFocus }: CustomSectionItemsProps): React.JSX.Element {
  const [itemText, setItemText] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const previousConfirmingRef = useRef<string | null>(null);
  const skipRestoreRef = useRef(false);
  const inputId = `custom-${section.id}-item`;

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

  const ordered = [...section.entries].sort((a, b) => a.ordinal - b.ordinal);

  function addItem(): void {
    const next = itemText.trim();
    if (next === '' || isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const document = await addCustomSectionItem(section.id, { text: next });
        onDocumentChange(document);
        setItemText('');
        setNotice(ADDED_ANNOUNCEMENT);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function confirmRemove(entryId: string): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        const document = await deleteCustomSectionEntry(entryId);
        const siblings = ordered.filter((entry) => entry.id !== entryId);
        const index = ordered.findIndex((entry) => entry.id === entryId);
        const next = siblings[index] ?? siblings[index - 1];
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
      {ordered.map((entry, entryIndex) => {
        const itemNumber = entryIndex + 1;
        const snippet = itemSnippet(entry.heading);
        return (
        <div key={entry.id} className="flex flex-col gap-2 rounded-md border border-border p-2">
          <p className="font-semibold text-text">{entry.heading ?? '(sem título)'}</p>
          <div>
            <button
              ref={(node) => {
                triggerRefs.current.set(entry.id, node);
              }}
              type="button"
              aria-label={`Remover o item ${String(itemNumber)}: ${snippet}`}
              disabled={isBusy || confirmingId !== null}
              onClick={() => setConfirmingId(entry.id)}
              className="rounded-md border border-border-strong px-3 py-1 text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
            >
              Remover item
            </button>
          </div>
          {confirmingId === entry.id && (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-text">
                Tem certeza? O item sai deste currículo. O Career Profile continua intacto.
              </p>
              <div className="flex gap-2">
                <Button type="button" disabled={isBusy} onClick={() => confirmRemove(entry.id)}>
                  Confirmar remover item
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
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <label htmlFor={inputId} className="font-medium text-text">
          Novo item da Custom Section
        </label>
        <input
          id={inputId}
          value={itemText}
          onChange={(event) => setItemText(event.target.value)}
          className="rounded-md border border-border-strong bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        <div>
          <Button type="button" disabled={itemText.trim() === '' || isBusy} onClick={addItem}>
            Adicionar item
          </Button>
        </div>
      </div>
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? 'Salvando o item.' : notice}</StatusRegion>
    </div>
  );
}
