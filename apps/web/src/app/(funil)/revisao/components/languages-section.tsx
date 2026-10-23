import type { LanguageDraft } from 'schema/contracts/resume-import';
import { LabeledInput } from '../../../../components/labeled-input';
import { Button } from '../../../../components/button';

interface LanguagesSectionProps {
  readonly languages: readonly LanguageDraft[];
  readonly onChangeLanguage: (index: number, language: LanguageDraft) => void;
  readonly onCommitLanguage: (index: number, language: LanguageDraft) => void;
  readonly onAddLanguage: () => void;
  readonly onRemoveLanguage: (index: number) => void;
}

export function LanguagesSection({
  languages,
  onChangeLanguage,
  onCommitLanguage,
  onAddLanguage,
  onRemoveLanguage,
}: LanguagesSectionProps): React.JSX.Element {
  return (
    <section aria-label="Idiomas" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow">
      <h2 className="text-base font-semibold text-text">Idiomas</h2>
      {languages.length === 0 && (
        <p className="text-text-2">
          Nenhum idioma veio do arquivo. Se você fala outro idioma, acrescente aqui.
        </p>
      )}
      {languages.map((language, index) => (
        <fieldset
          key={`language-${String(index)}`}
          className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4"
        >
          <legend className="px-1 text-[13px] font-semibold text-text-2">
            {`Idioma ${String(index + 1)}`}
          </legend>
          <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <LabeledInput
              id={`language-${String(index)}-name`}
              label="Idioma"
              value={language.name}
              placeholder="Ex.: Inglês"
              onChange={(value) => onChangeLanguage(index, { ...language, name: value })}
              onBlur={() => onCommitLanguage(index, language)}
            />
            <LabeledInput
              id={`language-${String(index)}-level`}
              label="Nível (opcional)"
              value={language.level ?? ''}
              placeholder="Ex.: Fluente"
              onChange={(value) =>
                onChangeLanguage(index, { ...language, level: value })
              }
              onBlur={() => onCommitLanguage(index, language)}
            />
          </div>
          <div>
            <Button variant="danger-ghost" size="xs" onClick={() => onRemoveLanguage(index)}>
              {`Remover idioma ${String(index + 1)}`}
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button variant="secondary" onClick={onAddLanguage}>Acrescentar idioma</Button>
      </div>
    </section>
  );
}
