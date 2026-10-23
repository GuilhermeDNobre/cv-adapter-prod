'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import {
  resumeImportDraftSchema,
  type CertificationDraft,
  type ContactDetailsDraft,
  type EducationDraft,
  type EvidenceDraft,
  type ExperienceDraft,
  type LanguageDraft,
  type ResumeImportDraft,
  type SkillDraft,
} from 'schema/contracts/resume-import';
import {
  ApiError,
  confirmResumeImport,
  getResumeImport,
  saveResumeImportDraft,
} from '../../../lib/api-client';
import { Button, buttonClasses } from '../../../components/button';
import { ErrorMessage } from '../../../components/error-message';
import { StatusRegion } from '../../../components/status-region';
import { resumeStepHref } from '../../../components/wizard/wizard-route';
import { EASE_OUT, STEP_ENTER_MS } from '../../../lib/motion';
import { ContactSection } from './components/contact-section';
import { ExperienceSection } from './components/experience-section';
import { EducationSection } from './components/education-section';
import { EvidenceSection } from './components/evidence-section';
import { SkillsSection } from './components/skills-section';
import { LanguagesSection } from './components/languages-section';
import { CertificationsSection } from './components/certifications-section';
import { ConfirmPanel } from './components/confirm-panel';

const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const IMPORTACAO_ROUTE = '/importacao';
const VAGA_ROUTE = '/vaga';

const LOADING_ANNOUNCEMENT = 'Carregando o rascunho para revisão.';
const SAVING_ANNOUNCEMENT = 'Salvando suas alterações.';
const SAVED_ANNOUNCEMENT = 'Alterações salvas. Você pode sair e voltar quando quiser.';

const MISSING_DRAFT_MESSAGE =
  'Não encontramos esse rascunho para revisão. Ele pode ter sido confirmado ou descartado ' +
  'antes de você chegar aqui. Envie o currículo de novo para gerar um novo rascunho.';
const WRONG_STATE_MESSAGE =
  'Este envio ainda não está pronto para revisão: a leitura pode estar em andamento ou ter ' +
  'terminado com erro. Acompanhe o progresso na tela de envio antes de voltar aqui.';
const UNREACHABLE_MESSAGE =
  'Não foi possível falar com o cv-adapter. Nada do que você já salvou foi perdido — ' +
  'confira se ele está rodando (docker compose ps) e recarregue esta página.';
const SAVE_FAILED_MESSAGE =
  'Não foi possível salvar suas correções agora. O que você digitou continua na tela: tente ' +
  'de novo e, se o problema persistir, não feche esta página.';
const CONFIRM_FAILED_MESSAGE =
  'Não foi possível confirmar agora. Seu Career Profile ainda não foi criado e nada mudou — ' +
  'suas correções continuam salvas aqui. Tente de novo em alguns instantes.';
const INVALID_DATE_MESSAGE =
  'Uma das datas não está num formato que dê para guardar. Use só o ano (2019), mês e ano ' +
  '(03/2019) ou a data completa (2019-03-15), corrija e confirme de novo.';
const PENDING_NEW_ITEM_MESSAGE =
  'Complete o texto dos itens que você acrescentou para que eles sejam salvos junto com o resto.';
const FOREVER_NOTICE =
  'Antes de confirmar, saiba: o que estiver aqui vira seu Career Profile e vale para todos os ' +
  'currículos que você criar daqui para frente. Conferir agora é o que garante que um erro não ' +
  'se repita em todo currículo futuro — e que o que estiver certo nunca precise ser digitado de novo.';

const LINK_CLASSES = `${buttonClasses('primary', 'md')} w-fit`;

type ScreenState =
  | 'loading'
  | 'review'
  | 'missing-draft'
  | 'wrong-state'
  | 'already-confirmed'
  | 'unreachable';

function draftWithContact(draftValue: ResumeImportDraft, contact: ContactDetailsDraft): ResumeImportDraft {
  return { ...draftValue, contactDetails: contact };
}

function draftWithSummary(draftValue: ResumeImportDraft, summary: string): ResumeImportDraft {
  const trimmed = summary.trim();
  return { ...draftValue, summary: trimmed === '' ? null : summary };
}

function draftWithExperience(draftValue: ResumeImportDraft, index: number, experience: ExperienceDraft): ResumeImportDraft {
  const experiences = draftValue.experiences.map((item, itemIndex) =>
    itemIndex === index ? experience : item,
  );
  return { ...draftValue, experiences };
}

function draftWithEducation(draftValue: ResumeImportDraft, index: number, education: EducationDraft): ResumeImportDraft {
  const entries = draftValue.education.map((item, itemIndex) =>
    itemIndex === index ? education : item,
  );
  return { ...draftValue, education: entries };
}

function draftWithEvidence(draftValue: ResumeImportDraft, index: number, evidence: EvidenceDraft): ResumeImportDraft {
  const evidences = draftValue.evidences.map((item, itemIndex) =>
    itemIndex === index ? evidence : item,
  );
  return { ...draftValue, evidences };
}

function reindexEvidenceLink(evidence: EvidenceDraft, removedIndex: number): EvidenceDraft {
  if (evidence.experienceIndex === undefined) return evidence;
  if (evidence.experienceIndex === removedIndex) return { statement: evidence.statement };
  if (evidence.experienceIndex > removedIndex) {
    return { statement: evidence.statement, experienceIndex: evidence.experienceIndex - 1 };
  }
  return evidence;
}

function draftWithoutExperience(draftValue: ResumeImportDraft, index: number): ResumeImportDraft {
  return {
    ...draftValue,
    experiences: draftValue.experiences.filter((_, itemIndex) => itemIndex !== index),
    evidences: draftValue.evidences.map((evidence) => reindexEvidenceLink(evidence, index)),
  };
}

function draftWithoutEducation(draftValue: ResumeImportDraft, index: number): ResumeImportDraft {
  return {
    ...draftValue,
    education: draftValue.education.filter((_, itemIndex) => itemIndex !== index),
  };
}

function draftWithoutEvidence(draftValue: ResumeImportDraft, index: number): ResumeImportDraft {
  return {
    ...draftValue,
    evidences: draftValue.evidences.filter((_, itemIndex) => itemIndex !== index),
  };
}

function skillsOf(draftValue: ResumeImportDraft): readonly SkillDraft[] {
  return draftValue.skills ?? [];
}

function draftWithSkillMove(
  draftValue: ResumeImportDraft,
  index: number,
  group: string | null,
): ResumeImportDraft {
  const skills = skillsOf(draftValue).map((skill, skillIndex) =>
    skillIndex === index ? { ...skill, group } : skill,
  );
  return { ...draftValue, skills };
}

function languagesOf(draftValue: ResumeImportDraft): readonly LanguageDraft[] {
  return draftValue.languages ?? [];
}

function certificationsOf(draftValue: ResumeImportDraft): readonly CertificationDraft[] {
  return draftValue.certifications ?? [];
}

function normalizeSkill(skill: SkillDraft): SkillDraft {
  return { name: skill.name, group: skill.group === '' ? null : skill.group };
}

function normalizeLanguage(language: LanguageDraft): LanguageDraft {
  return { name: language.name, level: language.level === '' ? null : language.level };
}

function normalizeCertification(certification: CertificationDraft): CertificationDraft {
  return {
    name: certification.name,
    issuer: certification.issuer === '' ? null : certification.issuer,
    year: certification.year === '' ? null : certification.year,
  };
}

function draftWithLanguage(
  draftValue: ResumeImportDraft,
  index: number,
  language: LanguageDraft,
): ResumeImportDraft {
  const languages = languagesOf(draftValue).map((item, itemIndex) =>
    itemIndex === index ? language : item,
  );
  return { ...draftValue, languages: [...languages] };
}

function draftWithCertification(
  draftValue: ResumeImportDraft,
  index: number,
  certification: CertificationDraft,
): ResumeImportDraft {
  const certifications = certificationsOf(draftValue).map((item, itemIndex) =>
    itemIndex === index ? certification : item,
  );
  return { ...draftValue, certifications: [...certifications] };
}

function experienceLabelFor(experience: ExperienceDraft, index: number): string {
  const name = [experience.company, experience.role].filter((part) => part !== '').join(' — ');
  return name === '' ? `Experiência ${String(index + 1)}` : `Experiência ${String(index + 1)}: ${name}`;
}

interface UnlinkedEvidenceSectionProps {
  readonly evidences: readonly EvidenceDraft[];
  readonly experienceLabels: readonly string[];
  readonly onChangeEvidence: (index: number, evidence: EvidenceDraft) => void;
  readonly onCommitEvidence: (index: number, evidence: EvidenceDraft) => void;
  readonly onAddEvidence: () => void;
  readonly onRemoveEvidence: (index: number) => void;
}

function UnlinkedEvidenceSection({
  evidences,
  experienceLabels,
  onChangeEvidence,
  onCommitEvidence,
  onAddEvidence,
  onRemoveEvidence,
}: UnlinkedEvidenceSectionProps): React.JSX.Element {
  const unlinked = evidences
    .map((evidence, evidenceIndex) => ({ evidence, evidenceIndex }))
    .filter(
      ({ evidence }) =>
        evidence.experienceIndex === undefined ||
        evidence.experienceIndex < 0 ||
        evidence.experienceIndex >= experienceLabels.length,
    );
  if (unlinked.length === 0) return <></>;
  return (
    <EvidenceSection
      evidences={unlinked.map(({ evidence }) => evidence)}
      experienceLabels={experienceLabels}
      globalIndices={unlinked.map(({ evidenceIndex }) => evidenceIndex)}
      onChangeEvidence={(localIndex, evidence) => {
        const global = unlinked[localIndex]?.evidenceIndex;
        if (global !== undefined) onChangeEvidence(global, evidence);
      }}
      onCommitEvidence={(localIndex, evidence) => {
        const global = unlinked[localIndex]?.evidenceIndex;
        if (global !== undefined) onCommitEvidence(global, evidence);
      }}
      onAddEvidence={onAddEvidence}
      onRemoveEvidence={(localIndex) => {
        const global = unlinked[localIndex]?.evidenceIndex;
        if (global !== undefined) onRemoveEvidence(global);
      }}
    />
  );
}

interface ConfirmedPanelProps {
  readonly alreadyConfirmed: boolean;
  readonly resumeImportId: string | null;
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
}

function proposalHrefFor(
  resumeImportId: string | null,
  jobDescriptionId?: string,
  evaluationId?: string,
): string {
  const params = new URLSearchParams();
  if (resumeImportId !== null) params.set('resumeImportId', resumeImportId);
  if (jobDescriptionId !== undefined && jobDescriptionId !== '') params.set('vaga', jobDescriptionId);
  if (evaluationId !== undefined && evaluationId !== '') params.set('avaliacao', evaluationId);
  const query = params.toString();
  return query === '' ? '/revisao/base-resume' : `/revisao/base-resume?${query}`;
}

function isInFlow(jobDescriptionId?: string): jobDescriptionId is string {
  return jobDescriptionId !== undefined && jobDescriptionId !== '';
}

function uploadHrefFor(jobDescriptionId?: string, evaluationId?: string): string {
  if (!isInFlow(jobDescriptionId)) return IMPORTACAO_ROUTE;
  return resumeStepHref({ jobDescriptionId, evaluationId });
}

function ConfirmedPanel({
  alreadyConfirmed,
  resumeImportId,
  jobDescriptionId,
  evaluationId,
}: ConfirmedPanelProps): React.JSX.Element {
  const inFlow = isInFlow(jobDescriptionId);
  const continueHref = inFlow ? resumeStepHref({ jobDescriptionId, evaluationId }) : VAGA_ROUTE;
  const proposalHref = proposalHrefFor(resumeImportId, jobDescriptionId, evaluationId);
  return (
    <section
      aria-label="Revisão confirmada"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow"
    >
      <p className="inline-flex w-fit items-center gap-2 rounded-full bg-ok-soft px-3 py-1 text-[13px] font-semibold text-ok">
        <motion.span
          aria-hidden="true"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: STEP_ENTER_MS / 1000, ease: EASE_OUT }}
          className="flex"
        >
          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
        </motion.span>
        Dados confirmados
      </p>
      <h2 className="text-base font-semibold text-text">Seu Career Profile está pronto</h2>
      <p className="text-sm text-text">
        {alreadyConfirmed
          ? 'Esta revisão já tinha sido confirmada antes. O que você confirmou ali vale para todos ' +
            'os currículos que você criar daqui para frente.'
          : 'Suas Evidences foram confirmadas e viraram seu Career Profile — elas valem para todos ' +
            'os currículos que você criar daqui para frente. O arquivo que você enviou foi apagado, ' +
            'e o que fica é o que você acabou de conferir aqui.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={proposalHref} className={LINK_CLASSES}>
          Conferir o Base Resume
        </a>
        <a href={continueHref} className={`${buttonClasses('secondary', 'md')} w-fit`}>
          {inFlow ? 'Continuar a adaptação' : 'Continuar para a vaga'}
        </a>
      </div>
    </section>
  );
}

interface ReviewScreenProps {
  readonly resumeImportId: string | null;
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
}

export function ReviewScreen({
  resumeImportId,
  jobDescriptionId,
  evaluationId,
}: ReviewScreenProps): React.JSX.Element {
  const [screen, setScreen] = useState<ScreenState>('loading');
  const [draft, setDraft] = useState<ResumeImportDraft | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [everSaved, setEverSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [isConfirmPanelOpen, setIsConfirmPanelOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (resumeImportId === null) {
      setScreen('missing-draft');
      return;
    }
    const id = resumeImportId;
    let cancelled = false;
    void (async () => {
      try {
        const current = await getResumeImport(id);
        if (cancelled) return;
        if (current.status === 'confirmed') {
          setScreen('already-confirmed');
          return;
        }
        if (current.status === 'ready_for_review' && current.draft !== null) {
          setDraft(current.draft);
          setSavedJson(JSON.stringify(current.draft));
          setScreen('review');
          return;
        }
        setScreen('wrong-state');
      } catch (error: unknown) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) {
          setScreen('missing-draft');
          return;
        }
        setScreen('unreachable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeImportId]);

  async function persist(next: ResumeImportDraft): Promise<boolean> {
    if (resumeImportId === null) return false;
    const json = JSON.stringify(next);
    setIsSaving(true);
    setSaveFailed(false);
    try {
      await saveResumeImportDraft(resumeImportId, next);
      setSavedJson(json);
      setEverSaved(true);
      return true;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function commitDraft(next: ResumeImportDraft): void {
    setDraft(next);
    if (JSON.stringify(next) !== savedJson && resumeImportDraftSchema.safeParse(next).success) {
      void persist(next);
    }
  }

  async function openConfirmPanel(): Promise<void> {
    if (draft === null) return;
    if (JSON.stringify(draft) !== savedJson) {
      await persist(draft);
    }
    setIsConfirmPanelOpen(true);
  }

  async function runFinalConfirm(): Promise<void> {
    if (resumeImportId === null || draft === null) return;
    setIsConfirming(true);
    setConfirmationError(null);
    try {
      if (JSON.stringify(draft) !== savedJson) {
        const saved = await persist(draft);
        if (!saved) return;
      }
      await confirmResumeImport(resumeImportId);
      setIsConfirmed(true);
      setIsConfirmPanelOpen(false);
    } catch (error: unknown) {
      if (
        error instanceof ApiError &&
        error.status === HTTP_UNPROCESSABLE_ENTITY &&
        typeof error.payload === 'object' &&
        error.payload !== null &&
        (error.payload as { code?: unknown }).code === 'invalid_draft_date'
      ) {
        setConfirmationError(INVALID_DATE_MESSAGE);
      } else {
        setConfirmationError(CONFIRM_FAILED_MESSAGE);
      }
    } finally {
      setIsConfirming(false);
    }
  }

  function retrySave(): void {
    if (draft !== null && resumeImportDraftSchema.safeParse(draft).success) {
      void persist(draft);
    }
  }

  const draftJson = draft === null ? '' : JSON.stringify(draft);
  const isDirty = draftJson !== savedJson;
  const isDraftValid = draft !== null && resumeImportDraftSchema.safeParse(draft).success;

  function announcement(): string {
    if (screen === 'loading') return LOADING_ANNOUNCEMENT;
    if (isSaving) return SAVING_ANNOUNCEMENT;
    if (screen === 'review' && everSaved && !isDirty) return SAVED_ANNOUNCEMENT;
    return '';
  }

  return (
    <div className="flex flex-col gap-6">
      <StatusRegion>{announcement()}</StatusRegion>
      {screen === 'loading' && <p className="text-text-2">{LOADING_ANNOUNCEMENT}</p>}
      {screen === 'missing-draft' && (
        <div className="flex flex-col gap-4">
          <ErrorMessage message={MISSING_DRAFT_MESSAGE} />
          <a href={uploadHrefFor(jobDescriptionId, evaluationId)} className={LINK_CLASSES}>
            Voltar ao envio
          </a>
        </div>
      )}
      {screen === 'wrong-state' && (
        <div className="flex flex-col gap-4">
          <ErrorMessage message={WRONG_STATE_MESSAGE} />
          <a href={uploadHrefFor(jobDescriptionId, evaluationId)} className={LINK_CLASSES}>
            Acompanhar na tela de envio
          </a>
        </div>
      )}
      {screen === 'unreachable' && <ErrorMessage message={UNREACHABLE_MESSAGE} />}
      {(screen === 'already-confirmed' || isConfirmed) && (
        <ConfirmedPanel
          alreadyConfirmed={screen === 'already-confirmed'}
          resumeImportId={resumeImportId}
          jobDescriptionId={jobDescriptionId}
          evaluationId={evaluationId}
        />
      )}
      {screen === 'review' && draft !== null && !isConfirmed && (
        <>
          <div className="flex items-center gap-2 rounded-[10px] bg-accent-soft px-[14px] py-[10px]">
            <Check size={16} strokeWidth={2} aria-hidden="true" className="shrink-0 text-accent-text" />
            <p className="text-[13px] text-text">
              Leitura concluída a partir de arquivo. Confira os campos; tudo pode ser editado.
            </p>
          </div>
          {saveFailed && (
            <div className="flex flex-col gap-3">
              <ErrorMessage message={SAVE_FAILED_MESSAGE} />
              <div>
                <Button onClick={retrySave}>Salvar as alterações agora</Button>
              </div>
            </div>
          )}
          <ContactSection
            contact={draft.contactDetails}
            onChange={(contactDetails) => setDraft(draftWithContact(draft, contactDetails))}
            onCommit={(contactDetails) => commitDraft(draftWithContact(draft, contactDetails))}
          />
          <section
            aria-label="Resumo"
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="draft-summary" className="text-[13px] font-medium text-text-2">
                Resumo
              </label>
              <textarea
                id="draft-summary"
                rows={4}
                value={draft.summary ?? ''}
                placeholder="Ex.: Estudante de Engenharia de Software buscando estágio Fullstack."
                onChange={(event) => setDraft(draftWithSummary(draft, event.target.value))}
                onBlur={() => commitDraft(draft)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text hover:border-border-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              />
            </div>
            <p className="text-[13px] text-text-2">
              O objetivo ou perfil do currículo, quando houver. Nunca vira Evidence.
            </p>
          </section>
          <ExperienceSection
            experiences={draft.experiences}
            evidences={draft.evidences}
            onChangeExperience={(index, experience) =>
              setDraft(draftWithExperience(draft, index, experience))
            }
            onCommitExperience={(index, experience) =>
              commitDraft(draftWithExperience(draft, index, experience))
            }
            onAddExperience={() =>
              setDraft({
                ...draft,
                experiences: [
                  ...draft.experiences,
                  { company: '', role: '', startedOn: '', endedOn: null },
                ],
              })
            }
            onRemoveExperience={(index) => commitDraft(draftWithoutExperience(draft, index))}
            onChangeEvidence={(index, evidence) =>
              setDraft(draftWithEvidence(draft, index, evidence))
            }
            onCommitEvidence={(index, evidence) =>
              commitDraft(draftWithEvidence(draft, index, evidence))
            }
            onAddEvidenceForExperience={(experienceIndex) =>
              setDraft({
                ...draft,
                evidences: [...draft.evidences, { statement: '', experienceIndex }],
              })
            }
            onRemoveEvidence={(index) => commitDraft(draftWithoutEvidence(draft, index))}
          />
          <EducationSection
            education={draft.education}
            onChangeEducation={(index, education) =>
              setDraft(draftWithEducation(draft, index, education))
            }
            onCommitEducation={(index, education) =>
              commitDraft(draftWithEducation(draft, index, education))
            }
            onAddEducation={() =>
              setDraft({
                ...draft,
                education: [
                  ...draft.education,
                  { institution: '', degree: '', startedOn: '', endedOn: null },
                ],
              })
            }
            onRemoveEducation={(index) => commitDraft(draftWithoutEducation(draft, index))}
          />
          <SkillsSection
            skills={skillsOf(draft)}
            onAddSkill={(skill) =>
              commitDraft({ ...draft, skills: [...skillsOf(draft), normalizeSkill(skill)] })
            }
            onRemoveSkill={(index) =>
              commitDraft({
                ...draft,
                skills: skillsOf(draft).filter((_, itemIndex) => itemIndex !== index),
              })
            }
            onMoveSkill={(index, group) =>
              commitDraft(draftWithSkillMove(draft, index, group))
            }
          />
          <LanguagesSection
            languages={languagesOf(draft)}
            onChangeLanguage={(index, language) =>
              setDraft(draftWithLanguage(draft, index, language))
            }
            onCommitLanguage={(index, language) =>
              commitDraft(draftWithLanguage(draft, index, normalizeLanguage(language)))
            }
            onAddLanguage={() =>
              setDraft({
                ...draft,
                languages: [...languagesOf(draft), { name: '', level: null }],
              })
            }
            onRemoveLanguage={(index) =>
              commitDraft({
                ...draft,
                languages: languagesOf(draft).filter((_, itemIndex) => itemIndex !== index),
              })
            }
          />
          <CertificationsSection
            certifications={certificationsOf(draft)}
            onChangeCertification={(index, certification) =>
              setDraft(draftWithCertification(draft, index, certification))
            }
            onCommitCertification={(index, certification) =>
              commitDraft(draftWithCertification(draft, index, normalizeCertification(certification)))
            }
            onAddCertification={() =>
              setDraft({
                ...draft,
                certifications: [
                  ...certificationsOf(draft),
                  { name: '', issuer: null, year: null },
                ],
              })
            }
            onRemoveCertification={(index) =>
              commitDraft({
                ...draft,
                certifications: certificationsOf(draft).filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
              })
            }
          />
          <UnlinkedEvidenceSection
            evidences={draft.evidences}
            experienceLabels={draft.experiences.map(experienceLabelFor)}
            onChangeEvidence={(index, evidence) =>
              setDraft(draftWithEvidence(draft, index, evidence))
            }
            onCommitEvidence={(index, evidence) =>
              commitDraft(draftWithEvidence(draft, index, evidence))
            }
            onAddEvidence={() =>
              setDraft({ ...draft, evidences: [...draft.evidences, { statement: '' }] })
            }
            onRemoveEvidence={(index) => commitDraft(draftWithoutEvidence(draft, index))}
          />
          {isDirty && !isDraftValid && (
            <p className="text-sm font-semibold text-danger-text">{PENDING_NEW_ITEM_MESSAGE}</p>
          )}
          <section
            aria-label="O que acontece quando você confirma"
            className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow"
          >
            <h2 className="text-base font-semibold text-text">O que acontece quando você confirma</h2>
            <p className="text-sm text-text">{FOREVER_NOTICE}</p>
            {!isConfirmPanelOpen && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <a
                  href={uploadHrefFor(jobDescriptionId, evaluationId)}
                  className={`${buttonClasses('ghost', 'md')} w-fit`}
                >
                  Enviar outro arquivo
                </a>
                <div className="flex flex-col items-end gap-1.5">
                  <Button onClick={() => void openConfirmPanel()} disabled={isSaving}>
                    Confirmar revisão
                  </Button>
                  <p className="text-xs text-text-2">
                    Depois de confirmar, você confere o Base Resume montado.
                  </p>
                </div>
              </div>
            )}
          </section>
          {isConfirmPanelOpen && (
            <ConfirmPanel
              isConfirming={isConfirming}
              confirmationError={confirmationError}
              onGoBack={() => setIsConfirmPanelOpen(false)}
              onConfirm={() => void runFinalConfirm()}
            />
          )}
        </>
      )}
    </div>
  );
}
