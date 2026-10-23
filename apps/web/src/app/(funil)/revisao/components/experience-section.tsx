import { X } from 'lucide-react';
import type { EvidenceDraft, ExperienceDraft } from 'schema/contracts/resume-import';
import { LabeledInput } from '../../../../components/labeled-input';
import { Button, IconButton } from '../../../../components/button';

interface ExperienceSectionProps {
  readonly experiences: readonly ExperienceDraft[];
  readonly evidences: readonly EvidenceDraft[];
  readonly onChangeExperience: (index: number, experience: ExperienceDraft) => void;
  readonly onCommitExperience: (index: number, experience: ExperienceDraft) => void;
  readonly onAddExperience: () => void;
  readonly onRemoveExperience: (index: number) => void;
  readonly onChangeEvidence: (index: number, evidence: EvidenceDraft) => void;
  readonly onCommitEvidence: (index: number, evidence: EvidenceDraft) => void;
  readonly onAddEvidenceForExperience: (experienceIndex: number) => void;
  readonly onRemoveEvidence: (index: number) => void;
}

type ExperienceField = 'company' | 'role' | 'startedOn' | 'endedOn';

const EXPERIENCE_FIELDS: ReadonlyArray<{
  readonly field: ExperienceField;
  readonly label: string;
  readonly placeholder: string;
}> = [
  { field: 'company', label: 'Empresa', placeholder: 'Ex.: Acme Tecnologia' },
  { field: 'role', label: 'Cargo', placeholder: 'Ex.: Analista de dados' },
  { field: 'startedOn', label: 'Início', placeholder: 'Ex.: 03/2021' },
  { field: 'endedOn', label: 'Fim (deixe vazio se ainda estiver aí)', placeholder: 'Ex.: 11/2023' },
];

function fieldValue(experience: ExperienceDraft, field: ExperienceField): string {
  if (field === 'company') return experience.company;
  if (field === 'role') return experience.role;
  if (field === 'startedOn') return experience.startedOn;
  return experience.endedOn ?? '';
}

function withField(
  experience: ExperienceDraft,
  field: ExperienceField,
  value: string,
): ExperienceDraft {
  return {
    company: field === 'company' ? value : experience.company,
    role: field === 'role' ? value : experience.role,
    startedOn: field === 'startedOn' ? value : experience.startedOn,
    endedOn:
      field === 'endedOn' ? (value === '' ? null : value) : experience.endedOn,
  };
}

export function ExperienceSection({
  experiences,
  evidences,
  onChangeExperience,
  onCommitExperience,
  onAddExperience,
  onRemoveExperience,
  onChangeEvidence,
  onCommitEvidence,
  onAddEvidenceForExperience,
  onRemoveEvidence,
}: ExperienceSectionProps): React.JSX.Element {
  return (
    <section aria-label="Experiências profissionais" className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-text">Experiências profissionais</h2>
      {experiences.length === 0 && (
        <p className="text-text-2">
          Nenhuma experiência veio do arquivo. Se você trabalhou em algum lugar, acrescente aqui.
        </p>
      )}
      {experiences.map((experience, index) => {
        const linked = evidences
          .map((evidence, evidenceIndex) => ({ evidence, evidenceIndex }))
          .filter(({ evidence }) => evidence.experienceIndex === index);
        return (
          <fieldset
            key={`experience-${String(index)}`}
            className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4 shadow"
          >
            <legend className="px-1 text-[13px] font-semibold text-text-2">
              {`Experiência ${String(index + 1)}`}
            </legend>
            <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              {EXPERIENCE_FIELDS.map((fieldConfig) => (
                <LabeledInput
                  key={`experience-${String(index)}-${fieldConfig.field}`}
                  id={`experience-${String(index)}-${fieldConfig.field}`}
                  label={fieldConfig.label}
                  value={fieldValue(experience, fieldConfig.field)}
                  placeholder={fieldConfig.placeholder}
                  onChange={(value) =>
                    onChangeExperience(index, withField(experience, fieldConfig.field, value))
                  }
                  onBlur={() => onCommitExperience(index, experience)}
                />
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                  Evidences
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-surface-2 px-1.5 text-xs tabular-nums text-text-2">
                    {String(linked.length)}
                  </span>
                </h3>
                <p className="text-xs text-text-3">Fatos desta experiência que a IA pode usar como prova</p>
              </div>
              {linked.length === 0 && (
                <p className="text-sm text-text-2">
                  Nenhuma Evidence ligada a esta experiência. Acrescente o que você fez aqui.
                </p>
              )}
              {linked.map(({ evidence, evidenceIndex }) => (
                <div
                  key={`experience-${String(index)}-evidence-${String(evidenceIndex)}`}
                  className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3"
                >
                  <span aria-hidden="true" className="mt-2 h-4 w-1 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor={`experience-${String(index)}-evidence-${String(evidenceIndex)}-statement`}
                        className="text-[13px] font-medium text-text-2"
                      >
                        O que você fez ou conquistou
                      </label>
                      <textarea
                        id={`experience-${String(index)}-evidence-${String(evidenceIndex)}-statement`}
                        rows={2}
                        value={evidence.statement}
                        placeholder="Ex.: Reduzi o tempo de relatório em 40% automatizando no Python."
                        onChange={(event) =>
                          onChangeEvidence(evidenceIndex, { ...evidence, statement: event.target.value })
                        }
                        onBlur={() => onCommitEvidence(evidenceIndex, evidence)}
                        className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text hover:border-border-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus [field-sizing:content] min-h-[56px] max-h-[160px]"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 pt-6">
                    <IconButton
                      aria-label={`Remover Evidence ${String(evidenceIndex + 1)}`}
                      onClick={() => onRemoveEvidence(evidenceIndex)}
                    >
                      <X size={14} aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              ))}
              <div>
                <Button variant="secondary" onClick={() => onAddEvidenceForExperience(index)}>
                  Acrescentar Evidence
                </Button>
              </div>
            </div>
            <div>
              <Button variant="danger-ghost" size="xs" onClick={() => onRemoveExperience(index)}>
                {`Remover experiência ${String(index + 1)}`}
              </Button>
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button variant="secondary" onClick={onAddExperience}>Acrescentar experiência</Button>
      </div>
    </section>
  );
}
