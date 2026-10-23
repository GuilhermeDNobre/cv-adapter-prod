'use client';

import { useState } from 'react';
import type {
  ResumeDocumentResponse,
  ResumeEntryResponse,
  ResumeSectionResponse,
} from 'schema/contracts/resume';
import { addCustomSectionItem, aiErrorCodeOf } from '../../lib/api-client';
import { refineSectionItem } from '../../lib/api-client-adapt';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { LabeledSelect } from '../labeled-select';
import { StatusRegion } from '../status-region';

const REFINING_ANNOUNCEMENT = 'Refinando o item com a IA.';
const SAVING_ANNOUNCEMENT = 'Salvando o item.';
const ADDED_ANNOUNCEMENT = 'Item adicionado.';
const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

function entryLabelOf(entry: ResumeEntryResponse, index: number): string {
  const role = entry.role?.trim() ?? '';
  const company = entry.company?.trim() ?? '';
  if (role !== '' || company !== '') {
    const base = [role, company].filter((part) => part !== '').join(' na ');
    return entry.period !== null ? `${base} (${entry.period})` : base;
  }
  const heading = entry.heading?.trim() ?? '';
  if (heading !== '') return heading;
  return `Entrada ${String(index + 1)}`;
}

type ReviewStage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'review'; readonly original: string; readonly refined: string }
  | { readonly kind: 'editing'; readonly original: string; readonly refined: string };

interface AddRefinedItemFormProps {
  readonly section: ResumeSectionResponse;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
}

export function AddRefinedItemForm({
  section,
  onDocumentChange,
}: AddRefinedItemFormProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [edited, setEdited] = useState('');
  const [entryId, setEntryId] = useState('');
  const [stage, setStage] = useState<ReviewStage>({ kind: 'idle' });
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const inputId = `refined-${section.id}-input`;
  const editId = `refined-${section.id}-edit`;
  const entrySelectId = `refined-${section.id}-entry`;

  const selectableEntries = section.kind === 'custom' ? [] : [...section.entries].sort((a, b) => a.ordinal - b.ordinal);
  const activeEntryId =
    selectableEntries.length === 0
      ? undefined
      : selectableEntries.length === 1
        ? selectableEntries[0]?.id
        : entryId !== ''
          ? entryId
          : selectableEntries[0]?.id;

  function refine(): void {
    const next = draft.trim();
    if (next === '' || isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const result = await refineSectionItem(section.id, { text: next });
        setStage({ kind: 'review', original: next, refined: result.refined });
        setEdited(result.refined);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function save(finalText: string): void {
    const next = finalText.trim();
    if (next === '' || isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const document = await addCustomSectionItem(section.id, {
          text: next,
          ...(activeEntryId !== undefined ? { entryId: activeEntryId } : {}),
          createEvidence: true,
        });
        onDocumentChange(document);
        setDraft('');
        setEdited('');
        setStage({ kind: 'idle' });
        setNotice(ADDED_ANNOUNCEMENT);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function discard(): void {
    setStage({ kind: 'idle' });
    setFailure(null);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="font-medium text-text">
          Novo item da Section
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Escreva do seu jeito, a IA deixa no padrão"
          className="rounded-md border border-border-strong bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        {selectableEntries.length > 1 && (
          <div className="max-w-[420px]">
            <LabeledSelect
              id={entrySelectId}
              label="Entrada do item"
              value={activeEntryId ?? ''}
              options={selectableEntries.map((entry, index) => ({
                value: entry.id,
                label: entryLabelOf(entry, index),
              }))}
              onCommit={setEntryId}
            />
          </div>
        )}
        <div>
          <Button type="button" disabled={draft.trim() === '' || isBusy} onClick={refine}>
            Refinar com a IA
          </Button>
        </div>
      </div>
      {stage.kind === 'review' && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-md bg-surface p-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-2">
                Original
              </span>
              <p className="text-sm text-text-2">{stage.original}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-border bg-accent-soft p-2">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-2">
                Refinada pela IA
                <span className="rounded bg-warn-soft px-2 py-0.5 text-xs font-bold normal-case tracking-normal text-warn">
                  Não confirmado
                </span>
              </span>
              <p className="text-sm text-text">{stage.refined}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={isBusy} onClick={() => save(stage.refined)}>
              Usar refinado
            </Button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setStage({ kind: 'editing', original: stage.original, refined: stage.refined })}
              className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
            >
              Editar
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={discard}
              className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
      {stage.kind === 'editing' && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-md bg-surface p-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-2">
                Original
              </span>
              <p className="text-sm text-text-2">{stage.original}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-border bg-accent-soft p-2">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-2">
                Refinada pela IA
                <span className="rounded bg-warn-soft px-2 py-0.5 text-xs font-bold normal-case tracking-normal text-warn">
                  Não confirmado
                </span>
              </span>
              <label htmlFor={editId} className="sr-only">
                Editar o texto refinado
              </label>
              <textarea
                id={editId}
                value={edited}
                onChange={(event) => setEdited(event.target.value)}
                rows={3}
                className="rounded-md border border-border-strong bg-surface p-2 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={edited.trim() === '' || isBusy} onClick={() => save(edited)}>
              Usar refinado
            </Button>
            <button
              type="button"
              onClick={() => {
                setEdited(stage.refined);
                setStage({ kind: 'review', original: stage.original, refined: stage.refined });
              }}
              className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={discard}
              className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
            >
              Descartar
            </button>
          </div>
          <p className="text-xs text-text-3">Sua versão substitui a refinada e conta como confirmada.</p>
        </div>
      )}
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? (stage.kind === 'idle' ? REFINING_ANNOUNCEMENT : SAVING_ANNOUNCEMENT) : notice}</StatusRegion>
    </div>
  );
}
