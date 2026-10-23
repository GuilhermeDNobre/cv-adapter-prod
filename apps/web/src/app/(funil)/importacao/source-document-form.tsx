'use client';

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { FileText, Upload } from 'lucide-react';
import {
  MAX_SOURCE_DOCUMENT_SIZE_BYTES,
  SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS,
  SUPPORTED_SOURCE_DOCUMENT_MIME_TYPES,
  type ResumeImportResponse,
} from 'schema/contracts/resume-import';
import { ApiError, uploadSourceDocument } from '../../../lib/api-client';
import { AI_ERROR_MESSAGES } from '../../../lib/ai-error-messages';
import {
  useResumeImportStatus,
  type ResumeImportPollErrorKind,
} from '../../../hooks/use-resume-import-status';
import { Button, buttonClasses } from '../../../components/button';
import { ErrorMessage } from '../../../components/error-message';
import { StatusRegion } from '../../../components/status-region';
import { AiProgress } from '../../../components/wizard/ai-progress';
import { CHEVRON_MS, PROGRESS_BAR_MS, ms } from '../../../lib/motion';

const HTTP_BAD_REQUEST = 400;
const BYTES_PER_MEGABYTE = 1024 * 1024;

const FILE_FIELD_ID = 'source-document-file';
const FORMATS_HINT_ID = 'source-document-formats-hint';
const REVIEW_ROUTE = '/revisao';
const RESUME_IMPORT_ID_PARAM = 'resumeImportId';

const SIZE_LIMIT_LABEL = `${String(MAX_SOURCE_DOCUMENT_SIZE_BYTES / BYTES_PER_MEGABYTE)} MB`;
const FORMATS_HINT = `Formatos aceitos: ${SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS.join(', ')}. Tamanho máximo: ${SIZE_LIMIT_LABEL}.`;
const ACCEPT_ATTRIBUTE = [
  ...SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS,
  ...SUPPORTED_SOURCE_DOCUMENT_MIME_TYPES,
].join(',');

const UPLOADING_ANNOUNCEMENT = 'Enviando o arquivo.';
const CHECKING_ANNOUNCEMENT = 'Envio aceito. Verificando o andamento do processamento.';
const REVIEW_ANNOUNCEMENT = 'Leitura concluída. O rascunho está pronto para revisão.';

type IntermediateStatus = Extract<ResumeImportResponse['status'], 'queued' | 'extracting' | 'structuring'>;

const STAGE_ANNOUNCEMENTS: Readonly<Record<IntermediateStatus, string>> = {
  queued: 'Currículo recebido. Ele está na fila para o processamento.',
  extracting: 'Lendo o texto do arquivo.',
  structuring: 'Organizando as experiências do currículo.',
};

const READING_POSITION: Readonly<
  Record<IntermediateStatus, { readonly current: number; readonly total: number }>
> = {
  queued: { current: 1, total: 3 },
  extracting: { current: 2, total: 3 },
  structuring: { current: 3, total: 3 },
};

type FailureReason = NonNullable<ResumeImportResponse['failureReason']>;

const FAILURE_MESSAGES: Readonly<Record<FailureReason, string>> = {
  no_text_layer:
    'Seu PDF é uma digitalização: cada página é uma foto, e por isso ele não tem camada de ' +
    'texto — não há caracteres para extrair, apenas letras desenhadas. Ainda não existe caminho ' +
    'para importar um currículo escaneado assim, e não vamos prometer um que não existe. O que ' +
    'dá para fazer agora: exportar o PDF a partir do arquivo editável do currículo (Word, Google ' +
    'Docs) ou enviar um arquivo LaTeX ou HTML.',
  unsupported_format:
    'Não reconhecemos esse arquivo como PDF, LaTeX ou HTML. Envie o currículo em um desses três ' +
    'formatos e tente de novo.',
  too_large: `O arquivo passou do limite de ${SIZE_LIMIT_LABEL}. Um currículo em texto quase nunca pesa isso: provavelmente há imagens embutidas. Reexporte o arquivo sem elas e tente de novo.`,
  not_a_resume:
    'O arquivo não parece um currículo: não encontramos experiências, formação ou qualificações ' +
    'para extrair. Envie o arquivo do seu currículo — vagas e outros documentos não funcionam aqui.',
  extraction_empty:
    'O arquivo abriu, mas quase nenhum texto veio dele. Isso costuma acontecer com PDFs ' +
    'corrompidos ou arquivos vazios. Gere um novo PDF, LaTeX ou HTML a partir do original e ' +
    'tente de novo.',
  ai_key_rejected: AI_ERROR_MESSAGES['ai_key_rejected'],
  ai_balance_exhausted: AI_ERROR_MESSAGES['ai_balance_exhausted'],
  ai_unavailable: AI_ERROR_MESSAGES['ai_unavailable'],
};

const GENERIC_FAILURE_MESSAGE =
  'A importação falhou por um motivo que ainda não sabemos descrever. Envie o arquivo de novo ' +
  'e, se persistir, tente outro formato.';
const GENERIC_REJECTION_MESSAGE =
  'Não foi possível aceitar esse arquivo. Confira o formato e o tamanho e tente de novo.';
const SERVER_UNAVAILABLE_MESSAGE =
  'Não foi possível falar com o cv-adapter, e o arquivo não foi enviado. Confira se ele está ' +
  'rodando (docker compose ps) e tente de novo.';
const POLL_NOT_FOUND_MESSAGE =
  'Não encontramos esse envio. Envie o arquivo de novo para acompanhar o processamento aqui.';

function describeUploadRejection(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === HTTP_BAD_REQUEST) return describeBadRequest(error.serverMessage ?? '');
  }
  return SERVER_UNAVAILABLE_MESSAGE;
}

function describeBadRequest(serverMessage: string): string {
  if (serverMessage.includes('format')) return FAILURE_MESSAGES.unsupported_format;
  if (serverMessage.includes('size')) return FAILURE_MESSAGES.too_large;
  return GENERIC_REJECTION_MESSAGE;
}

function failureMessageFor(resumeImport: ResumeImportResponse): string {
  if (resumeImport.failureReason === null) return GENERIC_FAILURE_MESSAGE;
  return FAILURE_MESSAGES[resumeImport.failureReason];
}

function selectedFileOf(target: EventTarget & HTMLInputElement): File | null {
  const files = target.files;
  if (files === null || files.length === 0) return null;
  const [file] = files;
  return file ?? null;
}

export function SourceDocumentForm({
  jobDescriptionId,
  evaluationId,
}: {
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
}): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [resumeImportId, setResumeImportId] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const dragDepth = useRef(0);
  const { resumeImport, pollErrorKind } = useResumeImportStatus(resumeImportId);

  const overLimit = file !== null && file.size > MAX_SOURCE_DOCUMENT_SIZE_BYTES;
  const submitDisabled = file === null || overLimit || isUploading;

  function pickFile(event: ChangeEvent<HTMLInputElement>): void {
    setFile(selectedFileOf(event.target));
    setRejection(null);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const [dropped] = Array.from(event.dataTransfer.files);
    if (dropped !== undefined) {
      setFile(dropped);
      setRejection(null);
    }
  }

  function submitFile(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (file === null || submitDisabled) return;
    setIsUploading(true);
    setRejection(null);
    void (async () => {
      try {
        const accepted = await uploadSourceDocument(file);
        setResumeImportId(accepted.id);
      } catch (error: unknown) {
        setRejection(describeUploadRejection(error));
      } finally {
        setIsUploading(false);
      }
    })();
  }

  function restart(): void {
    setResumeImportId(null);
    setFile(null);
    setRejection(null);
    setFileInputKey(fileInputKey + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      {resumeImportId === null && (
        <form onSubmit={submitFile} className="flex flex-col gap-4">
          <div
            data-testid="source-document-dropzone"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              transitionProperty: 'border-color, background-color',
              transitionDuration: ms(CHEVRON_MS),
              transitionTimingFunction: 'ease-out',
            }}
            className={[
              'flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed px-6 py-12 text-center',
              isDragging ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 shadow"
            >
              <Upload size={20} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <label htmlFor={FILE_FIELD_ID} className="font-medium text-text">
              Arquivo do currículo
            </label>
            <input
              key={fileInputKey}
              id={FILE_FIELD_ID}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              aria-describedby={FORMATS_HINT_ID}
              onChange={pickFile}
              className="w-full max-w-full rounded-lg border border-border-strong bg-surface p-2 text-sm text-text file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-accent-fg hover:file:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <p
              id={FORMATS_HINT_ID}
              className={
                overLimit ? 'text-sm font-semibold text-danger-text' : 'text-[13px] text-text-2'
              }
            >
              {overLimit
                ? `Limite de ${SIZE_LIMIT_LABEL} excedido: ${file?.name} tem mais de ${SIZE_LIMIT_LABEL}. Escolha um arquivo menor antes de enviar.`
                : FORMATS_HINT}
            </p>
            {file !== null && !overLimit && (
              <p className="font-mono text-[13px] tabular-nums text-text-2">{file.name}</p>
            )}
          </div>
          {rejection !== null && <ErrorMessage message={rejection} />}
          <Button type="submit" disabled={submitDisabled}>
            Enviar currículo
          </Button>
        </form>
      )}
      {resumeImportId !== null && (
        <ImportProgress
          resumeImport={resumeImport}
          pollErrorKind={pollErrorKind}
          isUploading={isUploading}
          fileName={file?.name ?? null}
          onRestart={restart}
          jobDescriptionId={jobDescriptionId}
          evaluationId={evaluationId}
        />
      )}
      <StatusRegion>{announcementFor(resumeImportId, resumeImport, isUploading)}</StatusRegion>
    </div>
  );
}

function announcementFor(
  resumeImportId: string | null,
  resumeImport: ResumeImportResponse | null,
  isUploading: boolean,
): string {
  if (resumeImportId === null) return isUploading ? UPLOADING_ANNOUNCEMENT : '';
  if (resumeImport === null) return CHECKING_ANNOUNCEMENT;
  if (resumeImport.status === 'ready_for_review' || resumeImport.status === 'confirmed') {
    return REVIEW_ANNOUNCEMENT;
  }
  if (resumeImport.status === 'failed') return '';
  return STAGE_ANNOUNCEMENTS[resumeImport.status];
}

interface ImportProgressProps {
  readonly resumeImport: ResumeImportResponse | null;
  readonly pollErrorKind: ResumeImportPollErrorKind | null;
  readonly isUploading: boolean;
  readonly fileName: string | null;
  readonly onRestart: () => void;
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
}

function ImportProgress({
  resumeImport,
  pollErrorKind,
  isUploading,
  fileName,
  onRestart,
  jobDescriptionId,
  evaluationId,
}: ImportProgressProps): React.JSX.Element {
  if (pollErrorKind !== null) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage message={POLL_NOT_FOUND_MESSAGE} />
        <Button type="button" onClick={onRestart}>
          Voltar ao envio
        </Button>
      </div>
    );
  }
  if (isUploading || resumeImport === null) {
    return <p className="font-medium text-text">{CHECKING_ANNOUNCEMENT}</p>;
  }
  if (resumeImport.status === 'failed') {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage message={failureMessageFor(resumeImport)} />
        <Button type="button" onClick={onRestart}>
          Enviar outro arquivo
        </Button>
      </div>
    );
  }
  if (resumeImport.status === 'ready_for_review' || resumeImport.status === 'confirmed') {
    return (
      <ReviewReady
        resumeImportId={resumeImport.id}
        jobDescriptionId={jobDescriptionId}
        evaluationId={evaluationId}
      />
    );
  }
  return <ReadingCard fileName={fileName} status={resumeImport.status} />;
}

function ReadingCard({
  fileName,
  status,
}: {
  readonly fileName: string | null;
  readonly status: IntermediateStatus;
}): React.JSX.Element {
  const position = READING_POSITION[status];
  const progress = Math.round((position.current / position.total) * 100);
  return (
    <section
      aria-label="Leitura do arquivo"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow"
    >
      <div className="flex items-center gap-3">
        <FileText size={32} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-text-2" />
        <div className="flex min-w-0 flex-col gap-1">
          {fileName !== null && (
            <p className="truncate font-mono text-[13px] font-medium tabular-nums text-text">
              {fileName}
            </p>
          )}
          <p className="text-[13px] text-text-2">Leitura pela IA</p>
        </div>
      </div>
      <AiProgress importStatus={status} />
      <div
        role="progressbar"
        aria-label="Progresso da leitura"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-[3px] w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${String(progress)}%`, transition: `width ${ms(PROGRESS_BAR_MS)} ease-out` }}
        />
      </div>
    </section>
  );
}

function ReviewReady({
  resumeImportId,
  jobDescriptionId,
  evaluationId,
}: {
  readonly resumeImportId: string;
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
}): React.JSX.Element {
  const params = new URLSearchParams();
  params.set(RESUME_IMPORT_ID_PARAM, resumeImportId);
  if (jobDescriptionId !== undefined && jobDescriptionId !== '') params.set('vaga', jobDescriptionId);
  if (evaluationId !== undefined && evaluationId !== '') params.set('avaliacao', evaluationId);
  const reviewHref = `${REVIEW_ROUTE}?${params.toString()}`;
  return (
    <section
      aria-label="Leitura concluída"
      className="flex flex-col gap-3 rounded-[10px] bg-accent-soft px-[14px] py-[10px]"
    >
      <h2 className="text-base font-semibold text-text">Currículo lido</h2>
      <p className="text-sm text-text">
        A extração terminou e o rascunho com o que foi lido do seu arquivo está pronto para
        conferência. Revise antes de confirmar: o que você confirmar vira seu Career Profile e vale
        para todos os currículos futuros.
      </p>
      <a href={reviewHref} className={`${buttonClasses('primary', 'md')} w-fit`}>
        Revisar o rascunho
      </a>
    </section>
  );
}
