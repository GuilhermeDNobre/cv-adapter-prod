'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ResumeListItem } from 'schema/contracts/resume';
import { listResumes } from '../../lib/api-client';
import { Button } from '../../components/button';
import { ErrorMessage } from '../../components/error-message';
import { EmptyResumes, ResumeLists } from '../../components/resume-list/resume-lists';
import { ResumeUploadPanel } from '../../components/resume-list/resume-upload-panel';
import { StatusRegion } from '../../components/status-region';

const POLL_INTERVAL_MS = 1500;

const LOADING_MESSAGE = 'Carregando currículos.';
const UNREACHABLE_MESSAGE =
  'Não foi possível carregar os currículos. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

type ListStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly resumes: readonly ResumeListItem[] };

function baseCountOf(stage: ListStage): number | null {
  if (stage.kind !== 'ready') return null;
  return stage.resumes.filter((resume) => resume.kind === 'base').length;
}

function announcementFor(stage: ListStage): string {
  if (stage.kind === 'loading') return LOADING_MESSAGE;
  if (stage.kind !== 'ready') return '';
  const generating = stage.resumes.filter((resume) => resume.generationStatus === 'generating');
  if (generating.length === 0) return '';
  if (generating.length === 1) return 'Gerando 1 currículo.';
  return `Gerando ${String(generating.length)} currículos.`;
}

export default function CurriculosPage(): React.JSX.Element {
  const [stage, setStage] = useState<ListStage>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function loadOnce(): Promise<void> {
      try {
        const response = await listResumes();
        if (cancelled) return;
        setStage({ kind: 'ready', resumes: response.resumes });
        if (response.resumes.some((resume) => resume.generationStatus === 'generating')) {
          timer = setTimeout(() => void loadOnce(), POLL_INTERVAL_MS);
        }
      } catch {
        if (cancelled) return;
        setStage({ kind: 'failed' });
      }
    }
    void loadOnce();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [reloadToken]);

  const handleDeleted = useCallback((resumeId: string) => {
    setStage((current) => {
      if (current.kind !== 'ready') return current;
      return { kind: 'ready', resumes: current.resumes.filter((resume) => resume.id !== resumeId) };
    });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-[1160px] flex-col gap-7 px-8 pb-8 pt-7">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Meus currículos</h1>
        <p className="text-text-2">
          Seus Base Resumes e, agrupados por vaga, os Tailored Resumes com as exportações de cada
          um.
        </p>
      </header>
      <ResumeUploadPanel baseCount={baseCountOf(stage)} />
      {stage.kind === 'loading' && <p className="font-medium text-text">{LOADING_MESSAGE}</p>}
      {stage.kind === 'failed' && (
        <div className="flex flex-col gap-4">
          <ErrorMessage message={UNREACHABLE_MESSAGE} />
          <Button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar de novo
          </Button>
        </div>
      )}
      {stage.kind === 'ready' &&
        (stage.resumes.length === 0 ? (
          <EmptyResumes />
        ) : (
          <ResumeLists resumes={stage.resumes} onDeleted={handleDeleted} />
        ))}
      <StatusRegion>{announcementFor(stage)}</StatusRegion>
    </main>
  );
}
