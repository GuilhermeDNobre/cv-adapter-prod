'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Upload } from 'lucide-react';
import type { ResumeListItem } from 'schema/contracts/resume';
import { ApiError, getCareerProfile, listResumes } from '../../../lib/api-client';
import { CHEVRON_MS, ms } from '../../../lib/motion';
import { Button, buttonClasses } from '../../../components/button';
import { ErrorMessage } from '../../../components/error-message';
import { StatusRegion } from '../../../components/status-region';
import { Card } from '../../../components/ui/card';
import { WizardFooter } from '../../../components/wizard/wizard-footer';
import { resumeStepHref } from '../../../components/wizard/wizard-route';
import { SourceDocumentForm } from '../importacao/source-document-form';
import { SavedResumeList } from './saved-resume-list';

const HTTP_NOT_FOUND = 404;

const LOADING_MESSAGE = 'Carregando seus currículos.';
const UNREACHABLE_MESSAGE =
  'Não foi possível carregar seus currículos. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';
const NOTHING_SAVED_MESSAGE =
  'Você ainda não tem currículo salvo. Envie o seu abaixo: depois de conferir o que foi lido, ' +
  'você volta para esta vaga sem colar o anúncio de novo.';
const PROFILE_WITHOUT_BASE_MESSAGE =
  'Seu Career Profile está pronto, mas ainda não há Base Resume salvo. Dá para avançar para a ' +
  'Avaliação, que usa o Career Profile, e criar o Base Resume na etapa Adaptar.';
const UPLOAD_HINT =
  'Você manda o arquivo, a IA lê o conteúdo e você confere tudo antes de ele virar seu Career ' +
  'Profile.';

type SavedStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | {
      readonly kind: 'ready';
      readonly hasCareerProfile: boolean;
      readonly baseResumes: readonly ResumeListItem[];
    };

async function hasCareerProfile(): Promise<boolean> {
  try {
    await getCareerProfile();
    return true;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) return false;
    throw error;
  }
}

async function loadSavedResumes(): Promise<SavedStage> {
  const [profileExists, response] = await Promise.all([hasCareerProfile(), listResumes()]);
  const baseResumes = response.resumes.filter((resume) => resume.kind === 'base');
  return { kind: 'ready', hasCareerProfile: profileExists, baseResumes };
}

function selectedBaseOf(
  baseResumes: readonly ResumeListItem[],
  chosenId: string | undefined,
): string | undefined {
  if (baseResumes.some((resume) => resume.id === chosenId)) return chosenId;
  return baseResumes[0]?.id;
}

interface SavedResumesBodyProps {
  readonly stage: SavedStage;
  readonly selectedBaseResumeId: string | undefined;
  readonly onSelect: (baseResumeId: string) => void;
  readonly onRetry: () => void;
}

function SavedResumesBody({
  stage,
  selectedBaseResumeId,
  onSelect,
  onRetry,
}: SavedResumesBodyProps): React.JSX.Element {
  if (stage.kind === 'loading') {
    return <p className="text-sm text-text-2">{LOADING_MESSAGE}</p>;
  }
  if (stage.kind === 'failed') {
    return (
      <div className="flex flex-col gap-3">
        <ErrorMessage message={UNREACHABLE_MESSAGE} />
        <div>
          <Button variant="secondary" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }
  if (stage.baseResumes.length > 0) {
    return (
      <SavedResumeList
        baseResumes={stage.baseResumes}
        selectedBaseResumeId={selectedBaseResumeId}
        onSelect={onSelect}
      />
    );
  }
  const message = stage.hasCareerProfile ? PROFILE_WITHOUT_BASE_MESSAGE : NOTHING_SAVED_MESSAGE;
  return (
    <Card className="p-5">
      <p className="text-sm text-text-2">{message}</p>
    </Card>
  );
}

interface UploadProps {
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
}

function UploadPanel({ jobDescriptionId, evaluationId }: UploadProps): React.JSX.Element {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold tracking-[-0.01em] text-text">
          Envie o currículo que você já tem
        </h2>
        <p className="text-sm text-text-2">{UPLOAD_HINT}</p>
      </div>
      <SourceDocumentForm jobDescriptionId={jobDescriptionId} evaluationId={evaluationId} />
    </section>
  );
}

function UploadDisclosure({ jobDescriptionId, evaluationId }: UploadProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className={`${buttonClasses('secondary', 'md')} pl-3 pr-3`}
        >
          <Upload size={14} strokeWidth={1.6} aria-hidden="true" />
          Enviar um currículo novo
          <ChevronRight
            size={14}
            strokeWidth={1.6}
            aria-hidden="true"
            style={{ transitionDuration: ms(CHEVRON_MS) }}
            className={`transition-transform ease-out-motion motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
        </button>
      </div>
      <div id={panelId} hidden={!open}>
        <SourceDocumentForm jobDescriptionId={jobDescriptionId} evaluationId={evaluationId} />
      </div>
    </div>
  );
}

interface ResumeStepProps {
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
  readonly initialBaseResumeId?: string;
}

export function ResumeStep({
  jobDescriptionId,
  evaluationId,
  initialBaseResumeId,
}: ResumeStepProps): React.JSX.Element {
  const router = useRouter();
  const savedHeadingId = useId();
  const [stage, setStage] = useState<SavedStage>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [chosenBaseResumeId, setChosenBaseResumeId] = useState(initialBaseResumeId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadSavedResumes();
        if (!cancelled) setStage(loaded);
      } catch (error: unknown) {
        if (cancelled) return;
        console.error('resume_step.load_failed', {
          status: error instanceof ApiError ? error.status : null,
        });
        setStage({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const selectedBaseResumeId =
    stage.kind === 'ready' ? selectedBaseOf(stage.baseResumes, chosenBaseResumeId) : chosenBaseResumeId;
  const nothingSaved =
    stage.kind === 'ready' && !stage.hasCareerProfile && stage.baseResumes.length === 0;

  function chooseBaseResume(baseResumeId: string): void {
    setChosenBaseResumeId(baseResumeId);
    router.replace(resumeStepHref({ jobDescriptionId, evaluationId, baseResumeId }), {
      scroll: false,
    });
  }

  function retry(): void {
    setStage({ kind: 'loading' });
    setReloadToken((token) => token + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={savedHeadingId} className="flex flex-col gap-3">
        <h2 id={savedHeadingId} className="text-base font-semibold tracking-[-0.01em] text-text">
          Currículos salvos
        </h2>
        <SavedResumesBody
          stage={stage}
          selectedBaseResumeId={selectedBaseResumeId}
          onSelect={chooseBaseResume}
          onRetry={retry}
        />
      </section>
      {nothingSaved && (
        <UploadPanel jobDescriptionId={jobDescriptionId} evaluationId={evaluationId} />
      )}
      {!nothingSaved && stage.kind !== 'loading' && (
        <UploadDisclosure jobDescriptionId={jobDescriptionId} evaluationId={evaluationId} />
      )}
      <StatusRegion>{stage.kind === 'loading' ? LOADING_MESSAGE : ''}</StatusRegion>
      <WizardFooter
        current="curriculo"
        ids={{ jobDescriptionId, evaluationId, baseResumeId: selectedBaseResumeId }}
      />
    </div>
  );
}
