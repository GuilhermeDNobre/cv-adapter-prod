'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BaseResumeSectionSelection,
  CreateBaseResumeRequest,
} from 'schema/contracts/resume';
import {
  ApiError,
  aiErrorCodeOf,
  createBaseResume,
  getCareerProfile,
  type BaseResumeSectionInput,
  type CareerProfileResponse,
  type CreateBaseResumeInput,
} from '../../../lib/api-client';
import { aiErrorMessageForCode } from '../../../lib/ai-error-messages';
import { Button, buttonClasses } from '../../../components/button';
import { ErrorMessage } from '../../../components/error-message';
import { LabeledInput } from '../../../components/labeled-input';
import { LabeledSelect } from '../../../components/labeled-select';
import {
  CareerProfilePicker,
  type ProfileSelection,
} from '../../../components/resume-editor/career-profile-picker';
import { Checkbox } from '../../../components/ui/checkbox';
import { StatusRegion } from '../../../components/status-region';

const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const IMPORTACAO_ROUTE = '/importacao';
const REVISAR_ROUTE_PREFIX = '/revisar';

const NAME_FIELD_ID = 'base-resume-name';
const LANGUAGE_FIELD_ID = 'base-resume-language';
const TEMPLATE_FIELD_ID = 'base-resume-template';
const LENGTH_FIELD_ID = 'base-resume-length-target';
const METHOD_FIELD_ID = 'base-resume-writing-method';
const METHOD_HELP_ID = 'base-resume-writing-method-help';
const TONE_FIELD_ID = 'base-resume-tone';
const CUSTOM_TITLE_FIELD_ID = 'custom-section-title';

const CREATING_ANNOUNCEMENT = 'Criando o Base Resume.';
const LOADING_PROFILE_ANNOUNCEMENT = 'Carregando seu Career Profile.';
const PROFILE_FAILED_MESSAGE =
  'Não foi possível carregar seu Career Profile agora. Dá para criar o currículo sem a ' +
  'seleção de itens e ajustar depois no editor.';
const UNREACHABLE_MESSAGE =
  'Não foi possível criar o Base Resume. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';
const NO_CAREER_PROFILE_HEADING = 'Seu Career Profile ainda não está pronto';
const NO_CAREER_PROFILE_MESSAGE =
  'O Base Resume nasce da seleção do seu Career Profile, e ele ainda não está pronto. ' +
  'Envie seu currículo e confirme a revisão para liberar a criação.';

type LengthChoice = 'auto' | '1' | '2';
type SectionKind = BaseResumeSectionSelection['kind'];

const DEFAULT_SECTIONS: readonly SectionKind[] = ['summary', 'experience', 'education', 'skills'];

const SECTION_LABELS: Readonly<Record<SectionKind, string>> = {
  summary: 'Summary — resumo do perfil',
  experience: 'Experience — experiências',
  education: 'Education — formação',
  skills: 'Skills — competências',
  languages: 'Languages — idiomas',
  certifications: 'Certifications — certificações',
  custom: 'Custom Section — seção livre',
};

const WRITING_METHOD_EXPLANATIONS = [
  { value: 'star', label: 'STAR', explanation: 'Conta a situação, a tarefa, a ação e o resultado.' },
  {
    value: 'xyz',
    label: 'XYZ',
    explanation: 'Abre com a conquista medida: alcancei Y ao fazer X.',
  },
  { value: 'car', label: 'CAR', explanation: 'Apresenta o desafio, a ação e o resultado.' },
  {
    value: 'apr',
    label: 'APR',
    explanation: 'Começa pela ação, mostra o problema e fecha no resultado.',
  },
  { value: 'free', label: 'Livre', explanation: 'Sem formato fixo: mantém o jeito do texto.' },
] as const;

type CreationStage =
  | { readonly kind: 'form' }
  | { readonly kind: 'creating' }
  | { readonly kind: 'no-career-profile' }
  | { readonly kind: 'failed'; readonly message: string };

type ProfileStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly profile: CareerProfileResponse }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' };

function creationStageFor(error: unknown): CreationStage {
  if (error instanceof ApiError) {
    const aiCode = aiErrorCodeOf(error);
    if (aiCode !== null) return { kind: 'failed', message: aiErrorMessageForCode(aiCode) };
    if (error.status === HTTP_UNPROCESSABLE_ENTITY) return { kind: 'no-career-profile' };
  }
  return { kind: 'failed', message: UNREACHABLE_MESSAGE };
}

function MethodExplanations(): React.JSX.Element {
  return (
    <ul id={METHOD_HELP_ID} className="flex flex-col gap-1 text-sm text-text-2">
      {WRITING_METHOD_EXPLANATIONS.map((method) => (
        <li key={method.value}>
          <span className="font-semibold text-text">{method.label}</span>
          {`: ${method.explanation}`}
        </li>
      ))}
    </ul>
  );
}

interface SectionPickerProps {
  readonly selected: readonly SectionKind[];
  readonly onToggle: (kind: SectionKind) => void;
}

function SectionPicker({ selected, onToggle }: SectionPickerProps): React.JSX.Element {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-[13px] font-semibold text-text">Sections do documento</legend>
      {(Object.keys(SECTION_LABELS) as SectionKind[]).map((kind) => (
        <Checkbox
          key={kind}
          checked={selected.includes(kind)}
          label={SECTION_LABELS[kind]}
          onChange={() => onToggle(kind)}
        />
      ))}
    </fieldset>
  );
}

export default function BaseResumeForm(): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('pt');
  const [template, setTemplate] = useState('comfortable');
  const [lengthChoice, setLengthChoice] = useState<LengthChoice>('auto');
  const [writingMethod, setWritingMethod] = useState('xyz');
  const [tone, setTone] = useState('direct');
  const [selectedSections, setSelectedSections] =
    useState<readonly SectionKind[]>(DEFAULT_SECTIONS);
  const [customTitle, setCustomTitle] = useState('');
  const [stage, setStage] = useState<CreationStage>({ kind: 'form' });
  const [profileStage, setProfileStage] = useState<ProfileStage>({ kind: 'loading' });
  const [selection, setSelection] = useState<ProfileSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getCareerProfile();
        if (!cancelled) setProfileStage({ kind: 'ready', profile });
      } catch (error: unknown) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) {
          setProfileStage({ kind: 'unavailable' });
        } else {
          setProfileStage({ kind: 'failed' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectionChange = useCallback((next: ProfileSelection) => {
    setSelection(next);
  }, []);

  const customSelected = selectedSections.includes('custom');
  const submitDisabled =
    name.trim() === '' ||
    (customSelected && customTitle.trim() === '') ||
    stage.kind === 'creating';

  function toggleSection(kind: SectionKind): void {
    setSelectedSections((selected) =>
      selected.includes(kind) ? selected.filter((entry) => entry !== kind) : [...selected, kind],
    );
  }

  function buildRequest(): CreateBaseResumeInput {
    const profileSelection = profileStage.kind === 'ready' ? selection : null;
    const profile = profileStage.kind === 'ready' ? profileStage.profile : null;
    const sections: BaseResumeSectionInput[] = [];
    for (const kind of selectedSections) {
      if (kind === 'custom') {
        if (profileSelection !== null) {
          const items = profileSelection.customItems
            .map((item) => item.trim())
            .filter((item) => item !== '');
          if (items.length === 0) continue;
          sections.push({ kind, title: customTitle.trim(), items });
        } else {
          sections.push({ kind, title: customTitle.trim() });
        }
      } else if (kind === 'summary' && profileSelection !== null) {
        sections.push({ kind, evidenceIds: profileSelection.summaryEvidenceIds });
      } else if (kind === 'experience' && profileSelection !== null) {
        const experienceEvidenceIds = profileSelection.experienceEvidenceIds.filter((id) => {
          const evidence = profile?.evidences.find((entry) => entry.id === id);
          if (evidence === undefined) return false;
          if (evidence.experienceId === null) return false;
          return profileSelection.experienceIds.includes(evidence.experienceId);
        });
        sections.push({
          kind,
          experienceIds: profileSelection.experienceIds,
          evidenceIds: experienceEvidenceIds,
        });
      } else if (kind === 'education' && profileSelection !== null) {
        sections.push({ kind, educationEntryIds: profileSelection.educationEntryIds });
      } else if (kind === 'skills' && profileSelection !== null) {
        sections.push({ kind, evidenceIds: profileSelection.skillsEvidenceIds });
      } else {
        sections.push({ kind });
      }
    }
    return {
      name: name.trim(),
      language: language as CreateBaseResumeRequest['language'],
      template: template as CreateBaseResumeRequest['template'],
      ...(lengthChoice === 'auto'
        ? {}
        : { lengthTarget: (lengthChoice === '1' ? 1 : 2) as 1 | 2 }),
      writingMethod: writingMethod as CreateBaseResumeRequest['writingMethod'],
      tone: tone as CreateBaseResumeRequest['tone'],
      sections,
    };
  }

  function submitForm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitDisabled) return;
    setStage({ kind: 'creating' });
    const request = buildRequest();
    void (async () => {
      try {
        const created = await createBaseResume(request);
        router.replace(`${REVISAR_ROUTE_PREFIX}/${created.id}`);
      } catch (error: unknown) {
        setStage(creationStageFor(error));
      }
    })();
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-base font-semibold tracking-[-0.01em] text-text">Criar Base Resume</h1>
        <p className="text-text-2">
          Um Base Resume é a seleção curada do seu Career Profile de onde cada candidatura parte.
          Escolha as configurações e as Sections; a IA redige os Bullets a partir das suas
          Evidences.
        </p>
      </header>
      <form onSubmit={submitForm} className="flex flex-col gap-4">
        <LabeledInput
          id={NAME_FIELD_ID}
          label="Nome do Base Resume"
          value={name}
          placeholder="Ex.: Foco em backend"
          onChange={setName}
        />
        <LabeledSelect
          id={LANGUAGE_FIELD_ID}
          label="Idioma"
          value={language}
          options={[
            { value: 'pt', label: 'Português (padrão)' },
            { value: 'en', label: 'Inglês' },
          ]}
          onCommit={setLanguage}
        />
        <LabeledSelect
          id={TEMPLATE_FIELD_ID}
          label="Template"
          value={template}
          options={[
            { value: 'comfortable', label: 'Confortável (padrão)' },
            { value: 'dense', label: 'Denso' },
          ]}
          onCommit={setTemplate}
        />
        <LabeledSelect
          id={LENGTH_FIELD_ID}
          label="Length Target"
          value={lengthChoice}
          options={[
            {
              value: 'auto',
              label: 'Automático — 2 páginas acima de 5 anos de experiência, senão 1 (padrão)',
            },
            { value: '1', label: '1 página' },
            { value: '2', label: '2 páginas' },
          ]}
          onCommit={(value) => setLengthChoice(value as LengthChoice)}
        />
        <div className="flex flex-col gap-1">
          <LabeledSelect
            id={METHOD_FIELD_ID}
            label="Writing Method"
            value={writingMethod}
            options={[
              { value: 'star', label: 'STAR' },
              { value: 'xyz', label: 'XYZ (padrão)' },
              { value: 'car', label: 'CAR' },
              { value: 'apr', label: 'APR' },
              { value: 'free', label: 'Livre' },
            ]}
            onCommit={setWritingMethod}
          />
          <MethodExplanations />
        </div>
        <LabeledSelect
          id={TONE_FIELD_ID}
          label="Tone"
          value={tone}
          options={[
            { value: 'formal', label: 'Formal' },
            { value: 'direct', label: 'Direto (padrão)' },
            { value: 'technical', label: 'Técnico' },
          ]}
          onCommit={setTone}
        />
        <SectionPicker selected={selectedSections} onToggle={toggleSection} />
        {profileStage.kind === 'loading' && (
          <p className="text-text-2">{LOADING_PROFILE_ANNOUNCEMENT}</p>
        )}
        {profileStage.kind === 'failed' && <ErrorMessage message={PROFILE_FAILED_MESSAGE} />}
        {profileStage.kind === 'ready' && (
          <CareerProfilePicker
            profile={profileStage.profile}
            showExperience={selectedSections.includes('experience')}
            showEducation={selectedSections.includes('education')}
            showSummary={selectedSections.includes('summary')}
            showSkills={selectedSections.includes('skills')}
            showCustom={customSelected}
            onChange={handleSelectionChange}
          />
        )}
        {customSelected && (
          <div className="flex flex-col gap-1">
            <LabeledInput
              id={CUSTOM_TITLE_FIELD_ID}
              label="Título da Custom Section"
              value={customTitle}
              placeholder="Ex.: Publicações"
              onChange={setCustomTitle}
            />
            {profileStage.kind !== 'ready' && (
              <p className="text-sm text-text-2">
                Os itens da seção livre são escritos no editor, depois da criação.
              </p>
            )}
          </div>
        )}
        {stage.kind === 'no-career-profile' && (
          <section
            aria-label={NO_CAREER_PROFILE_HEADING}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow"
          >
            <h2 className="text-base font-semibold text-text">{NO_CAREER_PROFILE_HEADING}</h2>
            <p className="text-text-2">{NO_CAREER_PROFILE_MESSAGE}</p>
            <a href={IMPORTACAO_ROUTE} className={`${buttonClasses('primary', 'md')} w-fit`}>
              Enviar currículo
            </a>
          </section>
        )}
        {stage.kind === 'failed' && <ErrorMessage message={stage.message} />}
        <Button type="submit" disabled={submitDisabled}>
          Criar Base Resume
        </Button>
      </form>
      <StatusRegion>
        {stage.kind === 'creating'
          ? CREATING_ANNOUNCEMENT
          : profileStage.kind === 'loading'
            ? LOADING_PROFILE_ANNOUNCEMENT
            : ''}
      </StatusRegion>
    </div>
  );
}
