'use client';

import { useEffect, useState } from 'react';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, getCareerProfile, updateEvidence, updateExperience } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { LabeledInput } from '../labeled-input';
import { StatusRegion } from '../status-region';

const SAVING_ANNOUNCEMENT = 'Salvando a correção do fato.';
const LOADING_ANNOUNCEMENT = 'Carregando o fato atual.';
const UNREACHABLE_MESSAGE =
  'Não foi possível corrigir o fato. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

interface EvidenceCorrectionProps {
  readonly evidenceId: string;
  readonly experienceId: string | null;
  readonly resumeId: string;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
  readonly onClose: () => void;
}

export function EvidenceCorrection({
  evidenceId,
  experienceId,
  resumeId,
  onDocumentChange,
  onClose,
}: EvidenceCorrectionProps): React.JSX.Element {
  const [statement, setStatement] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [endedOn, setEndedOn] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingFact, setIsLoadingFact] = useState(true);
  const [linkedExperienceId, setLinkedExperienceId] = useState<string | null>(experienceId);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getCareerProfile();
        if (cancelled) return;
        const evidence = profile.evidences.find((entry) => entry.id === evidenceId);
        if (evidence !== undefined) {
          setStatement(evidence.statement);
          const effectiveId = evidence.experienceId ?? experienceId;
          setLinkedExperienceId(effectiveId);
          if (effectiveId !== null) {
            const experience = profile.experiences.find((entry) => entry.id === effectiveId);
            if (experience !== undefined) {
              setCompany(experience.company);
              setRole(experience.role);
              setStartedOn(experience.startedOn);
              setEndedOn(experience.endedOn ?? '');
            }
          }
        }
      } catch {
        if (!cancelled) setLinkedExperienceId(experienceId);
      } finally {
        if (!cancelled) setIsLoadingFact(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evidenceId, experienceId]);

  const statementFilled = statement.trim() !== '';
  const experienceFilled =
    company.trim() !== '' || role.trim() !== '' || startedOn.trim() !== '' || endedOn.trim() !== '';
  const submitDisabled = !statementFilled || isBusy;

  function failureMessageOf(error: unknown): string {
    const code = aiErrorCodeOf(error);
    if (code !== null) return aiErrorMessageForCode(code);
    return UNREACHABLE_MESSAGE;
  }

  function save(): void {
    if (submitDisabled) return;
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        const afterEvidence = await updateEvidence(evidenceId, { statement: statement.trim() }, resumeId);
        if (linkedExperienceId !== null && experienceFilled) {
          const correction: Record<string, string> = {};
          if (company.trim() !== '') correction['company'] = company.trim();
          if (role.trim() !== '') correction['role'] = role.trim();
          if (startedOn.trim() !== '') correction['startedOn'] = startedOn.trim();
          if (endedOn.trim() !== '') correction['endedOn'] = endedOn.trim();
          const afterExperience = await updateExperience(linkedExperienceId, correction, resumeId);
          onDocumentChange(afterExperience);
        } else {
          onDocumentChange(afterEvidence);
        }
        onClose();
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  return (
    <section
      aria-label="Corrigir fato de origem"
      className="flex flex-col gap-3 rounded-md border-2 border-border-strong bg-surface p-4"
    >
      <h4 className="font-semibold text-text">Corrigir fato de origem</h4>
      <p className="font-medium text-text">
        Esta correção vale para todos os currículos, porque o fato é compartilhado. Reescrever o
        Bullet, ao contrário, não sai deste documento.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={`evidence-${evidenceId}-statement`} className="font-medium text-text">
          Fato corrigido
        </label>
        <textarea
          id={`evidence-${evidenceId}-statement`}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          rows={3}
          placeholder="Ex.: Saí da empresa em 2023, não em 2022."
          className="rounded-md border border-border-strong bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </div>
      {linkedExperienceId !== null && (
        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-text">
            Experiência ligada
          </legend>
          <LabeledInput
            id={`experience-${linkedExperienceId}-company`}
            label="Empresa"
            value={company}
            onChange={setCompany}
          />
          <LabeledInput
            id={`experience-${linkedExperienceId}-role`}
            label="Cargo"
            value={role}
            onChange={setRole}
          />
          <LabeledInput
            id={`experience-${linkedExperienceId}-started`}
            label="Início"
            value={startedOn}
            placeholder="Ex.: 2020-01"
            onChange={setStartedOn}
          />
          <LabeledInput
            id={`experience-${linkedExperienceId}-ended`}
            label="Fim"
            value={endedOn}
            placeholder="Ex.: 2023-06"
            onChange={setEndedOn}
          />
        </fieldset>
      )}
      {failure !== null && <ErrorMessage message={failure} />}
      <div className="flex gap-2">
        <Button type="button" disabled={submitDisabled} onClick={save}>
          Salvar correção
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Fechar
        </button>
      </div>
      <StatusRegion>{isBusy ? SAVING_ANNOUNCEMENT : isLoadingFact ? LOADING_ANNOUNCEMENT : ''}</StatusRegion>
    </section>
  );
}
