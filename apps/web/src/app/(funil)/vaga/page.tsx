'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  jobDescriptionResponseSchema,
  MAX_JOB_DESCRIPTION_TEXT_LENGTH,
  type JobDescriptionResponse,
  type RequirementResponse,
} from 'schema/contracts/job-description';
import { ApiError, aiErrorCodeOf, apiRequest, getJobDescription } from '../../../lib/api-client';
import { aiErrorMessageForCode } from '../../../lib/ai-error-messages';
import { Button } from '../../../components/button';
import { ErrorMessage } from '../../../components/error-message';
import { StatusRegion } from '../../../components/status-region';
import { WizardFooter } from '../../../components/wizard/wizard-footer';
import { Card } from '../../../components/ui/card';
import { AiActivity } from '../../../components/ui/ai-activity';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_SERVICE_UNAVAILABLE = 503;

const TEXT_FIELD_ID = 'job-description-text';
const LIMIT_HINT_ID = 'job-description-limit-hint';

const characterCountFormatter = new Intl.NumberFormat('pt-BR');

function formatCount(count: number): string {
  return characterCountFormatter.format(count);
}

const TOO_LONG_MESSAGE = `O texto passou do limite de ${formatCount(MAX_JOB_DESCRIPTION_TEXT_LENGTH)} caracteres. Cole só o anúncio da vaga, sem anexos longos, e tente de novo.`;
const NOT_A_JOB_MESSAGE = 'Não encontramos uma vaga de emprego nesse texto. Cole o anúncio completo de uma vaga real e tente de novo.';
const AI_UNAVAILABLE_MESSAGE = 'A IA não respondeu agora. Tente de novo em alguns minutos.';
const UNREACHABLE_MESSAGE =
  'Não foi possível falar com o cv-adapter. Confira se ele está rodando (docker compose ps) ' +
  'e tente de novo.';
const LOADING_ANNOUNCEMENT = 'Analisando a vaga.';

type FunnelStage =
  | { readonly kind: 'form' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'result'; readonly jobDescription: JobDescriptionResponse };

function describeRejection(error: unknown): string {
  if (error instanceof ApiError) {
    const aiCode = aiErrorCodeOf(error);
    if (aiCode !== null) return aiErrorMessageForCode(aiCode);
    if (error.status === HTTP_BAD_REQUEST) return TOO_LONG_MESSAGE;
    if (error.status === HTTP_UNPROCESSABLE_ENTITY) return NOT_A_JOB_MESSAGE;
    if (error.status === HTTP_SERVICE_UNAVAILABLE) return AI_UNAVAILABLE_MESSAGE;
  }
  return UNREACHABLE_MESSAGE;
}

function requirementsOfKind(
  jobDescription: JobDescriptionResponse,
  kind: RequirementResponse['kind'],
): RequirementResponse[] {
  return jobDescription.requirements.filter((requirement) => requirement.kind === kind);
}

function announcementFor(stage: FunnelStage): string {
  if (stage.kind === 'loading') return LOADING_ANNOUNCEMENT;
  if (stage.kind === 'result') {
    const mandatory = requirementsOfKind(stage.jobDescription, 'mandatory');
    const desirable = requirementsOfKind(stage.jobDescription, 'desirable');
    return `Requirements prontos: ${String(mandatory.length)} obrigatórios e ${String(desirable.length)} desejáveis.`;
  }
  return '';
}

interface RequirementGroupProps {
  readonly heading: string;
  readonly requirements: RequirementResponse[];
  readonly dotClassName: string;
}

function RequirementGroup({ heading, requirements, dotClassName }: RequirementGroupProps): React.JSX.Element {
  return (
    <section aria-label={heading}>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text">{heading}</h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-surface-2 px-1.5 text-xs tabular-nums text-text-2">
            {String(requirements.length)}
          </span>
        </div>
        {requirements.length === 0 ? (
          <p className="px-4 py-2 text-sm text-text-2">Nenhum requirement nesse grupo.</p>
        ) : (
          <ul className="flex flex-col">
            {requirements.map((requirement) => (
              <li key={requirement.id} className="flex items-start gap-2 px-4 py-2">
                <span aria-hidden="true" className={`mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full ${dotClassName}`} />
                <div className="text-sm">
                  <span className="font-semibold text-text">{requirement.literalTerm}</span>
                  <span className="text-text-2">: {requirement.concept}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

interface RequirementsResultProps {
  readonly jobDescription: JobDescriptionResponse;
  readonly onPasteAnother: () => void;
}

function RequirementsResult({ jobDescription, onPasteAnother }: RequirementsResultProps): React.JSX.Element {
  const mandatory = requirementsOfKind(jobDescription, 'mandatory');
  const desirable = requirementsOfKind(jobDescription, 'desirable');
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-text">Requirements da vaga</h2>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <RequirementGroup heading="Obrigatórios" requirements={mandatory} dotClassName="bg-accent" />
        <RequirementGroup heading="Desejáveis" requirements={desirable} dotClassName="bg-text-3" />
      </div>
      <div>
        <Button type="button" onClick={onPasteAnother}>
          Colar outra vaga
        </Button>
      </div>
    </section>
  );
}

interface PasteJobFormProps {
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly submitDisabled: boolean;
  readonly overLimit: boolean;
  readonly rejection: string | null;
}

const TEXTAREA_CLASSES = [
  'w-full rounded-[10px] border border-border-strong bg-surface px-[14px] py-3 text-sm leading-[1.6] text-text resize-y',
  'hover:border-border-hover',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
].join(' ');

function PasteJobForm({
  text,
  onTextChange,
  onSubmit,
  submitDisabled,
  overLimit,
  rejection,
}: PasteJobFormProps): React.JSX.Element {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={TEXT_FIELD_ID} className="text-[13px] font-medium text-text-2">
          Anúncio da vaga
        </label>
        <textarea
          id={TEXT_FIELD_ID}
          rows={9}
          value={text}
          placeholder="Cole aqui o texto completo do anúncio."
          aria-describedby={LIMIT_HINT_ID}
          onChange={(event) => onTextChange(event.target.value)}
          className={TEXTAREA_CLASSES}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          id={LIMIT_HINT_ID}
          className={
            overLimit
              ? 'text-xs tabular-nums font-semibold text-danger-text'
              : 'text-xs tabular-nums text-text-2'
          }
        >
          {overLimit
            ? `Limite de ${formatCount(MAX_JOB_DESCRIPTION_TEXT_LENGTH)} caracteres excedido em ${formatCount(text.length - MAX_JOB_DESCRIPTION_TEXT_LENGTH)}. Ajuste o texto antes de enviar.`
            : `${formatCount(text.length)} de ${formatCount(MAX_JOB_DESCRIPTION_TEXT_LENGTH)} caracteres.`}
        </p>
        <Button type="submit" disabled={submitDisabled}>
          Ver Requirements
        </Button>
      </div>
      {rejection !== null && <ErrorMessage message={rejection} />}
    </form>
  );
}

export default function PasteJobDescriptionPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryVagaId = searchParams.get('vaga');
  const queryBaseResumeId = searchParams.get('base') ?? undefined;
  const [text, setText] = useState('');
  const [stage, setStage] = useState<FunnelStage>({ kind: 'form' });
  const overLimit = text.length > MAX_JOB_DESCRIPTION_TEXT_LENGTH;
  const submitDisabled = overLimit || text.trim().length === 0 || stage.kind === 'loading';

  useEffect(() => {
    if (queryVagaId === null || queryVagaId === '') return;
    setStage({ kind: 'loading' });
    let cancelled = false;
    void getJobDescription(queryVagaId).then(
      (jobDescription) => {
        if (!cancelled) setStage({ kind: 'result', jobDescription });
      },
      () => {
        if (!cancelled) setStage({ kind: 'form' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [queryVagaId]);

  function submitJobDescription(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitDisabled) return;
    setStage({ kind: 'loading' });
    void (async () => {
      try {
        const jobDescription = await apiRequest({
          path: '/job-descriptions',
          method: 'POST',
          body: { text },
          responseSchema: jobDescriptionResponseSchema,
        });
        setStage({ kind: 'result', jobDescription });
        router.replace(`/vaga?vaga=${encodeURIComponent(jobDescription.id)}`);
      } catch (error: unknown) {
        setStage({ kind: 'rejected', message: describeRejection(error) });
      }
    })();
  }

  function pasteAnother(): void {
    setText('');
    setStage({ kind: 'form' });
    router.replace('/vaga');
  }

  const jobDescriptionId =
    stage.kind === 'result' ? stage.jobDescription.id : (queryVagaId ?? undefined);

  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Colar a vaga</h1>
        <p className="text-text-2">
          Cole o anúncio de uma vaga e veja na hora os Requirements que ela pede.
        </p>
      </header>
      {stage.kind === 'result' ? (
        <RequirementsResult jobDescription={stage.jobDescription} onPasteAnother={pasteAnother} />
      ) : (
        <PasteJobForm
          text={text}
          onTextChange={setText}
          onSubmit={submitJobDescription}
          submitDisabled={submitDisabled}
          overLimit={overLimit}
          rejection={stage.kind === 'rejected' ? stage.message : null}
        />
      )}
      {stage.kind === 'loading' && (
        <Card className="p-4">
          <AiActivity message={LOADING_ANNOUNCEMENT} />
        </Card>
      )}
      <StatusRegion>{announcementFor(stage)}</StatusRegion>
      <WizardFooter current="vaga" ids={{ jobDescriptionId, baseResumeId: queryBaseResumeId }} />
    </main>
  );
}
