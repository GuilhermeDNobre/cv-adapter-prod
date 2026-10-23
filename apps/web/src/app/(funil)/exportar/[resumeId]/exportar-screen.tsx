'use client';

import { useCallback, useEffect, useState } from 'react';
import { getResume } from '../../../../lib/api-client';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import { failureReasonMessage } from '../../../../lib/ai-error-messages';
import { Button } from '../../../../components/button';
import { ErrorMessage } from '../../../../components/error-message';
import { ResumePreview } from '../../../../components/resume-preview';
import { StatusRegion } from '../../../../components/status-region';
import { ExportPanel } from '../../../../components/resume-editor/export-panel';
import { toPreviewDocument } from '../../../../components/resume-editor/to-preview-document';
import { AiProgress } from '../../../../components/wizard/ai-progress';
import { ReevaluationSection } from './reevaluation-section';

const POLL_INTERVAL_MS = 1500;

const LOADING_MESSAGE = 'Carregando o currículo.';
const UNREACHABLE_MESSAGE =
  'Não foi possível carregar o currículo. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';
const NOT_FOUND_MESSAGE = 'Não encontramos este currículo. Ele pode ter sido apagado.';
const GENERATION_FAILED_MESSAGE =
  'A geração deste currículo falhou e nada foi salvo pela metade.';

type ExportStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly document: ResumeDocumentResponse };

interface ExportarScreenProps {
  readonly resumeId: string;
}

export function ExportarScreen({ resumeId }: ExportarScreenProps): React.JSX.Element {
  const [stage, setStage] = useState<ExportStage>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function loadOnce(): Promise<void> {
      try {
        const document = await getResume(resumeId);
        if (cancelled) return;
        setStage({ kind: 'ready', document });
        if (document.generationStatus === 'generating') {
          timer = setTimeout(() => void loadOnce(), POLL_INTERVAL_MS);
        }
      } catch (error: unknown) {
        if (cancelled) return;
        const message =
          error instanceof Error && 'status' in error && error.status === 404
            ? NOT_FOUND_MESSAGE
            : UNREACHABLE_MESSAGE;
        setStage({ kind: 'failed', message });
      }
    }
    void loadOnce();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [resumeId, reloadToken]);

  const handleDocumentChange = useCallback((document: ResumeDocumentResponse) => {
    setStage({ kind: 'ready', document });
  }, []);

  if (stage.kind === 'loading') {
    return (
      <div className="flex flex-col gap-6">
        <p className="font-medium text-text">{LOADING_MESSAGE}</p>
        <StatusRegion>{LOADING_MESSAGE}</StatusRegion>
      </div>
    );
  }

  if (stage.kind === 'failed') {
    return (
      <div className="flex flex-col gap-6">
        <ErrorMessage message={stage.message} />
        <div>
          <Button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar de novo
          </Button>
        </div>
        <StatusRegion>{''}</StatusRegion>
      </div>
    );
  }

  const document = stage.document;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-text">{document.name}</h2>
        {document.generationStatus === 'failed' && (
          <ErrorMessage
            message={failureReasonMessage(document.failureReason, GENERATION_FAILED_MESSAGE)}
          />
        )}
      </header>
      {document.generationStatus === 'generating' ? (
        <AiProgress
          generationStatus={document.generationStatus}
          generationStep={document.generationStep}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {document.kind === 'tailored' && document.jobDescriptionId !== null && (
            <ReevaluationSection resumeId={document.id} resumeUpdatedAt={document.updatedAt} />
          )}
          <ResumePreview
            document={toPreviewDocument(document)}
            template={document.template}
            language={document.language}
            onPageCount={setPageCount}
          />
          <ExportPanel
            resume={document}
            pageCount={pageCount}
            onDocumentChange={handleDocumentChange}
          />
        </div>
      )}
      <StatusRegion>
        {document.generationStatus === 'generating' ? 'Gerando o currículo.' : ''}
      </StatusRegion>
    </div>
  );
}
