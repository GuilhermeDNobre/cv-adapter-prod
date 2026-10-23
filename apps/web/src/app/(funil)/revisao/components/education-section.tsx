import type { EducationDraft } from 'schema/contracts/resume-import';
import { LabeledInput } from '../../../../components/labeled-input';
import { Button } from '../../../../components/button';

interface EducationSectionProps {
  readonly education: readonly EducationDraft[];
  readonly onChangeEducation: (index: number, education: EducationDraft) => void;
  readonly onCommitEducation: (index: number, education: EducationDraft) => void;
  readonly onAddEducation: () => void;
  readonly onRemoveEducation: (index: number) => void;
}

type EducationField = 'institution' | 'degree' | 'startedOn' | 'endedOn';

const EDUCATION_FIELDS: ReadonlyArray<{
  readonly field: EducationField;
  readonly label: string;
  readonly placeholder: string;
}> = [
  { field: 'institution', label: 'Instituição', placeholder: 'Ex.: USP' },
  { field: 'degree', label: 'Curso', placeholder: 'Ex.: Bacharelado em Estatística' },
  { field: 'startedOn', label: 'Início', placeholder: 'Ex.: 2018' },
  { field: 'endedOn', label: 'Fim (deixe vazio se estiver em andamento)', placeholder: 'Ex.: 2022' },
];

function fieldValue(education: EducationDraft, field: EducationField): string {
  if (field === 'institution') return education.institution;
  if (field === 'degree') return education.degree;
  if (field === 'startedOn') return education.startedOn;
  return education.endedOn ?? '';
}

function withField(
  education: EducationDraft,
  field: EducationField,
  value: string,
): EducationDraft {
  return {
    institution: field === 'institution' ? value : education.institution,
    degree: field === 'degree' ? value : education.degree,
    startedOn: field === 'startedOn' ? value : education.startedOn,
    endedOn: field === 'endedOn' ? (value === '' ? null : value) : education.endedOn,
  };
}

export function EducationSection({
  education,
  onChangeEducation,
  onCommitEducation,
  onAddEducation,
  onRemoveEducation,
}: EducationSectionProps): React.JSX.Element {
  return (
    <section aria-label="Formação" className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-text">Formação</h2>
      {education.length === 0 && (
        <p className="text-text-2">
          Nenhuma formação veio do arquivo. Se você estudou algo que quer no currículo, acrescente aqui.
        </p>
      )}
      {education.map((entry, index) => (
        <fieldset
          key={`education-${String(index)}`}
          className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4 shadow"
        >
          <legend className="px-1 text-[13px] font-semibold text-text-2">
            {`Formação ${String(index + 1)}`}
          </legend>
          <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            {EDUCATION_FIELDS.map((fieldConfig) => (
              <LabeledInput
                key={`education-${String(index)}-${fieldConfig.field}`}
                id={`education-${String(index)}-${fieldConfig.field}`}
                label={fieldConfig.label}
                value={fieldValue(entry, fieldConfig.field)}
                placeholder={fieldConfig.placeholder}
                onChange={(value) =>
                  onChangeEducation(index, withField(entry, fieldConfig.field, value))
                }
                onBlur={() => onCommitEducation(index, entry)}
              />
            ))}
          </div>
          <div>
            <Button variant="danger-ghost" size="xs" onClick={() => onRemoveEducation(index)}>
              {`Remover formação ${String(index + 1)}`}
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button variant="secondary" onClick={onAddEducation}>Acrescentar formação</Button>
      </div>
    </section>
  );
}
