'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ResumeListItem } from 'schema/contracts/resume';
import { aiErrorCodeOf, createTailoredResume, listResumes } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { LabeledSelect } from '../labeled-select';
import { StatusRegion } from '../status-region';

const GENERATING_ANNOUNCEMENT = 'Gerando o currículo para esta vaga.';
const LOADING_ANNOUNCEMENT = 'Carregando seus Base Resumes.';
const UNREACHABLE_MESSAGE =
  'Não foi possível falar com o cv-adapter. Confira se ele está rodando (docker compose ps) ' +
  'e tente de novo.';

const LINK_CLASSES = [
  'w-fit rounded-md bg-blue-700 px-4 py-2 font-semibold text-white transition-colors',
  'hover:bg-blue-800',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700',
].join(' ');

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

type LoadStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly baseResumes: readonly ResumeListItem[] };

interface GenerateResumeButtonProps {
  readonly jobDescriptionId: string | null;
}

export function GenerateResumeButton({
  jobDescriptionId,
}: GenerateResumeButtonProps): React.JSX.Element {
  const router = useRouter();
  const [stage, setStage] = useState<LoadStage>({ kind: 'loading' });
  const [baseResumeId, setBaseResumeId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (jobDescriptionId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await listResumes();
        if (cancelled) return;
        const bases = response.resumes.filter((resume) => resume.kind === 'base');
        setStage({ kind: 'ready', baseResumes: bases });
        const [first] = bases;
        if (first !== undefined) setBaseResumeId(first.id);
      } catch {
        if (!cancelled) setStage({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobDescriptionId]);

  if (jobDescriptionId === null) {
    return (
      <section aria-label="Gerar currículo para esta vaga" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-gray-900">Gerar currículo para esta vaga</h2>
        <p className="text-gray-700">Cole o anúncio de uma vaga para começar.</p>
        <a href="/vaga" className={LINK_CLASSES}>
          Colar uma vaga
        </a>
      </section>
    );
  }

  if (stage.kind === 'loading') {
    return (
      <section aria-label="Gerar currículo para esta vaga" className="flex flex-col gap-2">
        <p className="font-medium text-gray-900">{LOADING_ANNOUNCEMENT}</p>
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
        <h2 className="text-xl font-bold text-gray-900">Gerar currículo para esta vaga</h2>
        <p className="text-gray-700">
          O Tailored Resume nasce de um Base Resume. Crie o primeiro para gerar o currículo desta
          vaga.
        </p>
        <a href="/curriculos/novo" className={LINK_CLASSES}>
          Criar primeiro Base Resume
        </a>
      </section>
    );
  }

  function generate(): void {
    if (baseResumeId === '' || isBusy || jobDescriptionId === null) return;
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        const created = await createTailoredResume({ baseResumeId, jobDescriptionId });
        router.replace(`/curriculos/${created.id}`);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
        setIsBusy(false);
      }
    })();
  }

  return (
    <section aria-label="Gerar currículo para esta vaga" className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-gray-900">Gerar currículo para esta vaga</h2>
      <LabeledSelect
        id={`generate-resume-base-${jobDescriptionId.slice(0, 8)}`}
        label="Base Resume de partida"
        value={baseResumeId}
        options={stage.baseResumes.map((resume) => ({ value: resume.id, label: resume.name }))}
        onCommit={setBaseResumeId}
      />
      <div>
        <Button type="button" disabled={baseResumeId === '' || isBusy} onClick={generate}>
          Gerar currículo para esta vaga
        </Button>
      </div>
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? GENERATING_ANNOUNCEMENT : ''}</StatusRegion>
    </section>
  );
}
