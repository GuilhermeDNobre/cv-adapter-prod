import type { CertificationDraft } from 'schema/contracts/resume-import';
import { LabeledInput } from '../../../../components/labeled-input';
import { Button } from '../../../../components/button';

interface CertificationsSectionProps {
  readonly certifications: readonly CertificationDraft[];
  readonly onChangeCertification: (index: number, certification: CertificationDraft) => void;
  readonly onCommitCertification: (index: number, certification: CertificationDraft) => void;
  readonly onAddCertification: () => void;
  readonly onRemoveCertification: (index: number) => void;
}

export function CertificationsSection({
  certifications,
  onChangeCertification,
  onCommitCertification,
  onAddCertification,
  onRemoveCertification,
}: CertificationsSectionProps): React.JSX.Element {
  return (
    <section aria-label="Certificações" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow">
      <h2 className="text-base font-semibold text-text">Certificações</h2>
      {certifications.length === 0 && (
        <p className="text-text-2">
          Nenhuma certificação veio do arquivo. Se você tem alguma, acrescente aqui.
        </p>
      )}
      {certifications.map((certification, index) => (
        <fieldset
          key={`certification-${String(index)}`}
          className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4"
        >
          <legend className="px-1 text-[13px] font-semibold text-text-2">
            {`Certificação ${String(index + 1)}`}
          </legend>
          <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <LabeledInput
              id={`certification-${String(index)}-name`}
              label="Certificação"
              value={certification.name}
              placeholder="Ex.: AWS Solutions Architect"
              onChange={(value) =>
                onChangeCertification(index, { ...certification, name: value })
              }
              onBlur={() => onCommitCertification(index, certification)}
            />
            <LabeledInput
              id={`certification-${String(index)}-issuer`}
              label="Emissor (opcional)"
              value={certification.issuer ?? ''}
              placeholder="Ex.: Amazon"
              onChange={(value) =>
                onChangeCertification(index, { ...certification, issuer: value })
              }
              onBlur={() => onCommitCertification(index, certification)}
            />
            <LabeledInput
              id={`certification-${String(index)}-year`}
              label="Ano (opcional)"
              value={certification.year ?? ''}
              placeholder="Ex.: 2023"
              onChange={(value) =>
                onChangeCertification(index, { ...certification, year: value })
              }
              onBlur={() => onCommitCertification(index, certification)}
            />
          </div>
          <div>
            <Button variant="danger-ghost" size="xs" onClick={() => onRemoveCertification(index)}>
              {`Remover certificação ${String(index + 1)}`}
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button variant="secondary" onClick={onAddCertification}>Acrescentar certificação</Button>
      </div>
    </section>
  );
}
