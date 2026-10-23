'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResumeListItem } from 'schema/contracts/resume';
import { aiErrorCodeOf, deleteResume, downloadResumeExport } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { failureReasonMessage } from '../../lib/ai-error-messages';
import { buildExportFilename } from '../../lib/export-filename';
import { Button, buttonClasses } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';

const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';
const GENERIC_GENERATION_FAILED_MESSAGE =
  'A geração deste currículo falhou e nada foi salvo pela metade.';
const DELETED_ANNOUNCEMENT = 'Currículo apagado.';

const LANGUAGE_LABELS: Record<ResumeListItem['language'], string> = {
  pt: 'Português',
  en: 'Inglês',
};

const TEMPLATE_LABELS: Record<ResumeListItem['template'], string> = {
  comfortable: 'Confortável',
  dense: 'Denso',
};

export const GENERATION_STATUS_LABELS: Record<ResumeListItem['generationStatus'], string> = {
  ready: 'Pronto',
  generating: 'Gerando',
  failed: 'Falha na geração',
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

export function resumeSummaryOf(resume: ResumeListItem): string {
  return `${LANGUAGE_LABELS[resume.language]} · Template ${TEMPLATE_LABELS[resume.template]} · Criado em ${formatDate(resume.createdAt)}`;
}

function resumeHref(resumeId: string): string {
  return `/curriculos/${resumeId}`;
}

function exportsSummary(resume: ResumeListItem): string {
  if (resume.exports.length === 0) return 'Nenhuma exportação ainda.';
  const lastExport = resume.exports[resume.exports.length - 1];
  const countLabel =
    resume.exports.length === 1 ? '1 exportação' : `${String(resume.exports.length)} exportações`;
  if (lastExport === undefined) return countLabel;
  return `${countLabel} · última em ${formatDate(lastExport.createdAt)}`;
}

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

interface ResumeListItemProps {
  readonly resume: ResumeListItem;
  readonly onDeleted: (resumeId: string) => void;
}

export function ResumeListItemView({ resume, onDeleted }: ResumeListItemProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirmingRef = useRef(false);

  useEffect(() => {
    if (confirming && !wasConfirmingRef.current) {
      cancelRef.current?.focus();
    }
    if (!confirming && wasConfirmingRef.current) {
      triggerRef.current?.focus();
    }
    wasConfirmingRef.current = confirming;
  }, [confirming]);

  const lastExport = resume.exports.length === 0 ? null : (resume.exports[resume.exports.length - 1] ?? null);

  function downloadLast(): void {
    if (lastExport === null || isBusy) return;
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        const blob = await downloadResumeExport(lastExport.id);
        downloadBlob(blob, buildExportFilename(resume.name));
        setNotice('Último PDF baixado.');
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function confirmDelete(): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        await deleteResume(resume.id);
        setNotice(DELETED_ANNOUNCEMENT);
        onDeleted(resume.id);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
        setIsBusy(false);
        setConfirming(false);
      }
    })();
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold text-text">{resume.name}</p>
        <p className="text-sm font-medium tabular-nums text-text-2">
          {GENERATION_STATUS_LABELS[resume.generationStatus]}
        </p>
      </div>
      <p className="text-sm tabular-nums text-text-2">{resumeSummaryOf(resume)}</p>
      <p className="text-sm tabular-nums text-text-2">{exportsSummary(resume)}</p>
      {resume.generationStatus === 'failed' && (
        <ErrorMessage
          message={failureReasonMessage(resume.failureReason, GENERIC_GENERATION_FAILED_MESSAGE)}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <a href={resumeHref(resume.id)} className={`${buttonClasses('primary', 'sm')} w-fit`}>
          Abrir
        </a>
        {lastExport !== null && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isBusy}
            onClick={downloadLast}
          >
            Baixar último PDF
          </Button>
        )}
        <button
          ref={triggerRef}
          type="button"
          disabled={isBusy || confirming}
          onClick={() => setConfirming(true)}
          className={`${buttonClasses('danger', 'sm')} w-fit`}
        >
          Apagar
        </button>
      </div>
      {confirming && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-text">
            Tem certeza? O documento e seus PDFs exportados somem. O Career Profile continua intacto. Não há como desfazer.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isBusy}
              onClick={confirmDelete}
            >
              Confirmar apagar currículo
            </Button>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setConfirming(false)}
              className={buttonClasses('secondary', 'sm')}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{notice}</StatusRegion>
    </li>
  );
}
