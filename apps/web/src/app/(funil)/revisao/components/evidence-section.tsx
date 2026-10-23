import { X } from 'lucide-react';
import type { EvidenceDraft } from 'schema/contracts/resume-import';
import { LabeledSelect } from '../../../../components/labeled-select';
import { Button, IconButton } from '../../../../components/button';

interface EvidenceSectionProps {
  readonly evidences: readonly EvidenceDraft[];
  readonly experienceLabels: readonly string[];
  readonly onChangeEvidence: (index: number, evidence: EvidenceDraft) => void;
  readonly onCommitEvidence: (index: number, evidence: EvidenceDraft) => void;
  readonly onAddEvidence: () => void;
  readonly onRemoveEvidence: (index: number) => void;
  readonly globalIndices?: readonly number[];
}

const LINK_NONE_VALUE = '';

function linkOptions(experienceLabels: readonly string[]): ReadonlyArray<{ value: string; label: string }> {
  return [
    { value: LINK_NONE_VALUE, label: 'Nenhuma (fato geral da carreira)' },
    ...experienceLabels.map((label, index) => ({ value: String(index), label })),
  ];
}

function evidenceWithLink(evidence: EvidenceDraft, rawValue: string): EvidenceDraft {
  if (rawValue === LINK_NONE_VALUE) return { statement: evidence.statement };
  return { statement: evidence.statement, experienceIndex: Number(rawValue) };
}

export function EvidenceSection({
  evidences,
  experienceLabels,
  onChangeEvidence,
  onCommitEvidence,
  onAddEvidence,
  onRemoveEvidence,
  globalIndices,
}: EvidenceSectionProps): React.JSX.Element {
  function displayIndex(localIndex: number): number {
    const global = globalIndices?.[localIndex];
    return global ?? localIndex;
  }
  return (
    <section aria-label="Evidences" className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-text">Evidences</h2>
      <p className="text-text-2">
        Cada Evidence é um fato verificável da sua carreira — uma conquista com número, uma
        responsabilidade. São elas que provam o que você sabe fazer.
      </p>
      {evidences.length === 0 && (
        <p className="text-text-2">
          Nenhuma Evidence veio do arquivo. Acrescente aqui o que você fez nos seus trabalhos.
        </p>
      )}
      {evidences.map((evidence, index) => {
        const shown = displayIndex(index);
        return (
          <fieldset
            key={`evidence-${String(shown)}`}
            className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4 shadow"
          >
            <legend className="px-1 text-[13px] font-semibold text-text-2">
              {`Evidence ${String(shown + 1)}`}
            </legend>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`evidence-${String(shown)}-statement`} className="text-[13px] font-medium text-text-2">
                O que você fez ou conquistou
              </label>
              <textarea
                id={`evidence-${String(shown)}-statement`}
                rows={2}
                value={evidence.statement}
                placeholder="Ex.: Reduzi o tempo de relatório em 40% automatizando no Python."
                onChange={(event) => onChangeEvidence(index, { ...evidence, statement: event.target.value })}
                onBlur={() => onCommitEvidence(index, evidence)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text hover:border-border-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus [field-sizing:content] min-h-[56px] max-h-[160px]"
              />
            </div>
            <LabeledSelect
              id={`evidence-${String(shown)}-link`}
              label="Vínculo com experiência"
              value={
                evidence.experienceIndex !== undefined &&
                evidence.experienceIndex < experienceLabels.length
                  ? String(evidence.experienceIndex)
                  : LINK_NONE_VALUE
              }
              options={linkOptions(experienceLabels)}
              onCommit={(rawValue) => onCommitEvidence(index, evidenceWithLink(evidence, rawValue))}
            />
            <div className="flex justify-end">
              <IconButton aria-label={`Remover Evidence ${String(shown + 1)}`} onClick={() => onRemoveEvidence(index)}>
                <X size={14} aria-hidden="true" />
              </IconButton>
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button variant="secondary" onClick={onAddEvidence}>Acrescentar Evidence</Button>
      </div>
    </section>
  );
}
