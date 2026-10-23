'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import type { ResumeListItem } from 'schema/contracts/resume';
import {
  aiErrorCodeOf,
  createTailoredResume,
  getJobDescription,
  listResumes,
} from '../../../lib/api-client';
import { aiErrorMessageForCode } from '../../../lib/ai-error-messages';
import { Button, buttonClasses } from '../../../components/button';
import { ErrorMessage } from '../../../components/error-message';
import { LabeledSelect } from '../../../components/labeled-select';
import { StatusRegion } from '../../../components/status-region';
import { AiProgress } from '../../../components/wizard/ai-progress';

const GENERATING_ANNOUNCEMENT = 'Gerando o currículo para esta vaga.';
const LOADING_ANNOUNCEMENT = 'Carregando seus Base Resumes.';
const UNREACHABLE_MESSAGE =
  'Não foi possível falar com o cv-adapter. Confira se ele está rodando (docker compose ps) ' +
  'e tente de novo.';

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

function resumeLanguageOf(jobLanguage: string): 'pt' | 'en' {
  return jobLanguage.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

type LoadStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly baseResumes: readonly ResumeListItem[] };

interface AdaptarScreenProps {
  readonly jobDescriptionId: string | null;
  readonly evaluationId: string | null;
  readonly preferredBaseResumeId?: string;
}

export function AdaptarScreen({
  jobDescriptionId,
  evaluationId,
  preferredBaseResumeId,
}: AdaptarScreenProps): React.JSX.Element {
  const router = useRouter();
  const [stage, setStage] = useState<LoadStage>({ kind: 'loading' });
  const [baseResumeId, setBaseResumeId] = useState('');
  const [resumeLanguage, setResumeLanguage] = useState<'pt' | 'en'>('pt');
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [generatedStep, setGeneratedStep] = useState(false);

  useEffect(() => {
    if (jobDescriptionId === null || evaluationId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const [response, job] = await Promise.all([
          listResumes(),
          getJobDescription(jobDescriptionId),
        ]);
        if (cancelled) return;
        const bases = response.resumes.filter((resume) => resume.kind === 'base');
        setStage({ kind: 'ready', baseResumes: bases });
        const starting = bases.find((resume) => resume.id === preferredBaseResumeId) ?? bases[0];
        if (starting !== undefined) setBaseResumeId(starting.id);
        setResumeLanguage(resumeLanguageOf(job.language));
      } catch {
        if (!cancelled) setStage({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobDescriptionId, evaluationId, preferredBaseResumeId]);

  if (jobDescriptionId === null) {
    return (
      <section aria-label="Adaptar" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-text">Adaptar</h2>
        <p className="text-text-2">Informe a vaga para escolher o Base Resume e gerar.</p>
        <a href="/vaga" className={`${buttonClasses('primary', 'md')} w-fit`}>
          Colar uma vaga
        </a>
      </section>
    );
  }

  if (evaluationId === null) {
    return (
      <section aria-label="Adaptar" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-text">Adaptar</h2>
        <p className="text-text-2">Conclua a avaliação antes de gerar o Tailored Resume.</p>
        <a
          href={`/avaliacao?vaga=${encodeURIComponent(jobDescriptionId)}`}
          className={`${buttonClasses('primary', 'md')} w-fit`}
        >
          Voltar para avaliação
        </a>
      </section>
    );
  }

  if (stage.kind === 'loading') {
    return (
      <section aria-label="Gerar currículo para esta vaga" className="flex flex-col gap-2">
        <p className="font-medium text-text">{LOADING_ANNOUNCEMENT}</p>
        <StatusRegion>{LOADING_ANNOUNCEMENT}</StatusRegion>
      </section>
    );
  }

  if (stage.kind === 'failed') {
    return (
      <section aria-label="Gerar currículo para esta vaga" className="flex flex-col gap-2">
        <ErrorMessage message={UNREACHABLE_MESSAGE} />
      </section>
    );
  }

  if (stage.baseResumes.length === 0) {
    return (
      <section aria-label="Gerar currículo para esta vaga" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-text">
          Gerar currículo para esta vaga
        </h2>
        <p className="text-text-2">
          O Tailored Resume nasce de um Base Resume. Crie o primeiro abaixo para gerar o currículo
          desta vaga.
        </p>
      </section>
    );
  }

  function generate(): void {
    if (baseResumeId === '' || isBusy || jobDescriptionId === null) return;
    setIsBusy(true);
    setFailure(null);
    setGeneratedStep(true);
    void (async () => {
      try {
        const created = await createTailoredResume({
          baseResumeId,
          jobDescriptionId,
          language: resumeLanguage,
        });
        const query = `vaga=${encodeURIComponent(jobDescriptionId)}&avaliacao=${encodeURIComponent(evaluationId ?? '')}`;
        router.replace(`/revisar/${created.id}?${query}`);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
        setIsBusy(false);
      }
    })();
  }

  return (
    <section aria-label="Gerar currículo para esta vaga" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-text">
        Gerar currículo para esta vaga
      </h2>
      <div className="max-w-[420px]">
        <LabeledSelect
          id="adaptar-base-select"
          label="Base Resume de partida"
          value={baseResumeId}
          options={stage.baseResumes.map((resume) => ({ value: resume.id, label: resume.name }))}
          onCommit={setBaseResumeId}
        />
      </div>
      <div className="max-w-[420px]">
        <LabeledSelect
          id="adaptar-language"
          label="Idioma do currículo"
          value={resumeLanguage}
          options={[
            { value: 'pt', label: 'Português' },
            { value: 'en', label: 'Inglês' },
          ]}
          onCommit={(value) => setResumeLanguage(value === 'en' ? 'en' : 'pt')}
        />
      </div>
      <div>
        <Button
          type="button"
          disabled={baseResumeId === '' || isBusy}
          onClick={generate}
          iconLeft={<Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />}
        >
          Gerar currículo para esta vaga
        </Button>
      </div>
      {failure !== null && <ErrorMessage message={failure} />}
      {generatedStep && isBusy && (
        <AiProgress generationStatus="generating" generationStep={null} />
      )}
      <StatusRegion>{isBusy ? GENERATING_ANNOUNCEMENT : ''}</StatusRegion>
    </section>
  );
}
