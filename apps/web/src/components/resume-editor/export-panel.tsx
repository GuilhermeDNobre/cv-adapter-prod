'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { ResumeDocumentResponse, ResumeExportSummary } from 'schema/contracts/resume';
import {
  ApiError,
  NetworkError,
  aiErrorCodeOf,
  downloadResumeExport,
  exportResume,
  listResumes,
  updateResumeSettings,
} from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { buildExportFilename } from '../../lib/export-filename';
import { Button, buttonClasses } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';
import { Card, CardHeader } from '../ui/card';
import { AiActivity } from '../ui/ai-activity';
import { sectionHeadingOf } from './section-panel';

const EXPORTING_ANNOUNCEMENT = 'Exportando o PDF.';
const EXPORTED_ANNOUNCEMENT = 'PDF exportado.';
const UNREACHABLE_MESSAGE =
  'Não foi possível exportar agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';
const STILL_GENERATING_MESSAGE = 'O currículo ainda está sendo gerado.';
const GENERATION_FAILED_MESSAGE = 'A última geração falhou; gere de novo antes de exportar.';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  if (error instanceof ApiError && error.status === 422) return messageForUnprocessable(error.serverMessage);
  if (error instanceof NetworkError) return UNREACHABLE_MESSAGE;
  if (error instanceof ApiError && error.status >= 500) return UNREACHABLE_MESSAGE;
  if (error instanceof ApiError && error.serverMessage !== undefined) return error.serverMessage;
  return UNREACHABLE_MESSAGE;
}

function messageForUnprocessable(serverMessage: string | undefined): string {
  if (serverMessage !== undefined && serverMessage.includes('still generating')) return STILL_GENERATING_MESSAGE;
  if (serverMessage !== undefined && serverMessage.includes('generation failed')) return GENERATION_FAILED_MESSAGE;
  if (serverMessage !== undefined && serverMessage.length > 0) return serverMessage;
  return GENERATION_FAILED_MESSAGE;
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

interface ExportPanelProps {
  readonly resume: ResumeDocumentResponse;
  readonly pageCount: number | null;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
}

export function ExportPanel({ resume, pageCount, onDocumentChange }: ExportPanelProps): React.JSX.Element {
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [exportedPages, setExportedPages] = useState<number | null>(null);
  const [lastExportId, setLastExportId] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly ResumeExportSummary[]>([]);
  const [isSwitchingTemplate, setIsSwitchingTemplate] = useState(false);
  const [confirmingReviewExport, setConfirmingReviewExport] = useState(false);
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const reviewCancelRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirmingReviewRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await listResumes();
        if (cancelled) return;
        const own = response.resumes.find((entry) => entry.id === resume.id);
        setHistory(own?.exports ?? []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resume.id, exportedPages]);

  const overTarget = pageCount !== null && pageCount > resume.lengthTarget;
  const pageLabel =
    pageCount === null
      ? 'Contando as páginas da pré-visualização.'
      : `Pré-visualização: ${String(pageCount)} página${pageCount === 1 ? '' : 's'} para um Length Target de ${String(resume.lengthTarget)}.`;

  const reviewSections = resume.sections
    .map((section) => ({
      heading: sectionHeadingOf(section),
      count: section.entries.reduce(
        (total, entry) => total + entry.bullets.filter((bullet) => bullet.needsReview).length,
        0,
      ),
    }))
    .filter((entry) => entry.count > 0);
  const reviewCount = reviewSections.reduce((total, entry) => total + entry.count, 0);
  const reviewDetail =
    reviewSections.length === 0
      ? ''
      : ` (${reviewSections.map((entry) => `${String(entry.count)} em ${entry.heading}`).join(', ')})`;

  useEffect(() => {
    if (confirmingReviewExport && !wasConfirmingReviewRef.current) {
      reviewCancelRef.current?.focus();
    }
    if (!confirmingReviewExport && wasConfirmingReviewRef.current) {
      exportTriggerRef.current?.focus();
    }
    wasConfirmingReviewRef.current = confirmingReviewExport;
  }, [confirmingReviewExport]);

  useEffect(() => {
    setConfirmingReviewExport(false);
  }, [resume.id]);

  function performExport(): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        const result = await exportResume(resume.id);
        setExportedPages(result.pageCount);
        setLastExportId(result.exportId);
        setConfirmingReviewExport(false);
        if (result.exceedsLengthTarget) {
          setFailure(
            `O conteúdo passa do Length Target de ${String(resume.lengthTarget)} página${resume.lengthTarget === 1 ? '' : 's'}: são ${String(result.pageCount)}. Troque para o Template denso ou remova conteúdo no painel da Section antes de enviar.`,
          );
        }
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function exportNow(): void {
    if (isBusy) return;
    if (reviewCount > 0 && !confirmingReviewExport) {
      setConfirmingReviewExport(true);
      return;
    }
    performExport();
  }

  function download(exportId: string): void {
    setFailure(null);
    void (async () => {
      try {
        const blob = await downloadResumeExport(exportId);
        downloadBlob(blob, buildExportFilename(resume.name));
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      }
    })();
  }

  function switchToDenseTemplate(): void {
    if (isSwitchingTemplate || resume.template === 'dense') return;
    setIsSwitchingTemplate(true);
    setFailure(null);
    void (async () => {
      try {
        const document = await updateResumeSettings(resume.id, { template: 'dense' });
        onDocumentChange(document);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsSwitchingTemplate(false);
      }
    })();
  }

  const fileName = buildExportFilename(resume.name);
  const isReady = exportedPages !== null && !isBusy;

  return (
    <section aria-label="Exportar PDF" className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text">Exportar PDF</h3>
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <FileText size={36} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-text-2" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate font-mono text-[13px] font-medium tabular-nums text-text">
              {fileName}
            </p>
            <p className="text-[13px] text-text-2">{pageLabel}</p>
          </div>
        </div>
        {isBusy && <AiActivity message={EXPORTING_ANNOUNCEMENT} />}
        {overTarget && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-warn-soft p-4">
            <p className="font-medium text-text">
              Aviso de estouro: o conteúdo passa do Length Target. O PDF nunca é cortado nem
              reescrito sozinho.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {resume.template !== 'dense' && (
                <Button type="button" disabled={isSwitchingTemplate} onClick={switchToDenseTemplate}>
                  Usar Template denso
                </Button>
              )}
              <p className="text-sm text-text-2">
                Ou remova conteúdo no painel da Section e exporte de novo.
              </p>
            </div>
          </div>
        )}
        {reviewCount > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-warn-soft p-4">
            <p className="font-medium text-text">
              {`Atenção: ${String(reviewCount)} Bullet${reviewCount === 1 ? '' : 's'} precisa${reviewCount === 1 ? '' : 'm'} de revisão${reviewDetail}. Nada será reescrito sozinho.`}
            </p>
            {!confirmingReviewExport && (
              <p className="text-sm text-text-2">
                Exportar com revisão pendente exige confirmação.
              </p>
            )}
            {confirmingReviewExport && (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-text">
                  Tem certeza? O PDF vai sair com o texto atual desses Bullets.
                </p>
                <div className="flex gap-2">
                  <Button type="button" disabled={isBusy} onClick={performExport}>
                    Confirmar exportação
                  </Button>
                  <button
                    ref={reviewCancelRef}
                    type="button"
                    onClick={() => setConfirmingReviewExport(false)}
                    className={buttonClasses('secondary', 'md')}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            ref={exportTriggerRef}
            type="button"
            disabled={isBusy || (reviewCount > 0 && confirmingReviewExport)}
            onClick={exportNow}
            className={buttonClasses('primary', 'md')}
          >
            <span aria-hidden="true" className="flex">
              <Download size={14} strokeWidth={1.6} aria-hidden="true" />
            </span>
            Exportar PDF
          </button>
          {lastExportId !== null && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => download(lastExportId)}
              iconLeft={<Download size={14} strokeWidth={1.6} aria-hidden="true" />}
            >
              Baixar PDF exportado
            </Button>
          )}
        </div>
        {failure !== null && <ErrorMessage message={failure} />}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <h4 className="text-sm font-semibold text-text">Exportações anteriores</h4>
        </CardHeader>
        {history.length === 0 ? (
          <p className="px-4 py-[10px] text-sm text-text-2">Nenhuma exportação ainda.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <th
                  scope="col"
                  className="px-4 py-[10px] text-xs font-medium text-text-3"
                >
                  Arquivo
                </th>
                <th
                  scope="col"
                  className="px-4 py-[10px] text-right text-xs font-medium tabular-nums text-text-3"
                >
                  Data
                </th>
                <th
                  scope="col"
                  className="px-4 py-[10px] text-right text-xs font-medium tabular-nums text-text-3"
                >
                  Páginas
                </th>
                <th scope="col" className="px-4 py-[10px] text-right">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((entry) => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="px-4 py-[10px] font-mono text-xs text-text">{fileName}</td>
                  <td className="px-4 py-[10px] text-right tabular-nums text-text-2">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-4 py-[10px] text-right tabular-nums text-text-2">
                    {`${String(entry.pageCount)} página${entry.pageCount === 1 ? '' : 's'}`}
                  </td>
                  <td className="px-4 py-[10px] text-right">
                    <Button type="button" variant="secondary" size="xs" onClick={() => download(entry.id)}>
                      Baixar de novo
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className={isReady ? 'text-sm font-medium text-ok' : ''}>
        <StatusRegion>{isBusy ? EXPORTING_ANNOUNCEMENT : exportedPages !== null ? EXPORTED_ANNOUNCEMENT : ''}</StatusRegion>
      </div>
    </section>
  );
}
