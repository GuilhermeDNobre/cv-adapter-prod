'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type {
  BaseResumeProposal,
  BaseResumeProposalResponse,
} from 'schema/contracts/resume-import';
import type { CareerProfileResponse } from 'schema/contracts/career-profile';
import {
  ApiError,
  createBaseResume,
  getBaseResumeProposal,
  getCareerProfile,
  type CreateBaseResumeInput,
} from '../../../../lib/api-client';
import { Button, buttonClasses } from '../../../../components/button';
import { ErrorMessage } from '../../../../components/error-message';
import { StatusRegion } from '../../../../components/status-region';
import { LabeledInput } from '../../../../components/labeled-input';
import { resumeStepHref } from '../../../../components/wizard/wizard-route';

const POLL_INTERVAL_MS = 1500;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const MISSING_MESSAGE =
  'Não encontramos esse envio para montar o Base Resume. Volte à revisão e confirme de novo para gerar a proposta.';
const WRONG_STATE_MESSAGE =
  'Este envio ainda não foi confirmado: confirme a revisão antes de conferir o Base Resume.';
const UNREACHABLE_MESSAGE =
  'Não foi possível falar com o cv-adapter. Confira se ele está rodando (docker compose ps) e recarregue esta página.';
const PROPOSAL_FAILED_MESSAGE =
  'A IA não conseguiu montar o Base Resume agora. Volte à revisão e confirme de novo para tentar outra vez.';
const APPROVE_FAILED_MESSAGE =
  'Não foi possível aprovar agora. Nada foi salvo — tente de novo em alguns instantes.';
const EMPTY_NAME_MESSAGE = 'Dê um nome ao Base Resume antes de aprovar.';
const PENDING_BULLETS_MESSAGE = 'bullets ainda não confirmados.';
const WAIT_READY_MESSAGE = 'Aguarde o Base Resume ficar pronto para conferir.';

const LINK_CLASSES = `${buttonClasses('primary', 'md')} w-fit`;

const SECTION_TITLES: Record<string, Record<'pt' | 'en', string>> = {
  summary: { pt: 'Resumo', en: 'Summary' },
  experience: { pt: 'Experiências', en: 'Experience' },
  education: { pt: 'Formação', en: 'Education' },
  skills: { pt: 'Habilidades', en: 'Skills' },
  languages: { pt: 'Idiomas', en: 'Languages' },
  certifications: { pt: 'Certificações', en: 'Certifications' },
  custom: { pt: 'Informações Adicionais', en: 'Additional Information' },
};

function sectionLabel(
  section: BaseResumeProposal['sections'][number],
  language: 'pt' | 'en',
): string {
  if (section.kind === 'custom') {
    if (section.title !== null && section.title.trim() !== '') {
      return section.title;
    }
    return SECTION_TITLES['custom']?.[language] ?? section.kind;
  }
  return SECTION_TITLES[section.kind]?.[language] ?? section.title ?? section.kind;
}

function formatEducationPeriod(startedOn: string, endedOn: string | null): string {
  if (endedOn === null || endedOn.trim() === '') {
    return `${startedOn} – atual`;
  }
  return `${startedOn} – ${endedOn}`;
}

function bulletKey(sectionIndex: number, entryIndex: number, bulletIndex: number): string {
  return `${String(sectionIndex)}-${String(entryIndex)}-${String(bulletIndex)}`;
}

interface ExperienceBulletRef {
  readonly key: string;
  readonly sectionIndex: number;
  readonly entryIndex: number;
  readonly bulletIndex: number;
  readonly original: string;
  readonly rewritten: string;
  readonly evidenceId: string | null;
  readonly experienceId: string | null;
}

function collectExperienceBullets(proposal: BaseResumeProposal): ExperienceBulletRef[] {
  const refs: ExperienceBulletRef[] = [];
  proposal.sections.forEach((section, sectionIndex) => {
    if (section.kind !== 'experience') return;
    section.entries.forEach((entry, entryIndex) => {
      entry.bullets.forEach((bullet, bulletIndex) => {
        refs.push({
          key: bulletKey(sectionIndex, entryIndex, bulletIndex),
          sectionIndex,
          entryIndex,
          bulletIndex,
          original: bullet.original,
          rewritten: bullet.text,
          evidenceId: bullet.evidenceId,
          experienceId: entry.experienceId ?? null,
        });
      });
    });
  });
  return refs;
}

function methodLabel(method: string): string {
  if (method === 'star') return 'STAR';
  if (method === 'xyz') return 'XYZ';
  if (method === 'car') return 'CAR';
  if (method === 'apr') return 'APR';
  return 'livre';
}

function toneLabel(tone: string): string {
  if (tone === 'formal') return 'formal';
  if (tone === 'technical') return 'técnico';
  return 'direto';
}

function lengthLabel(averageBulletWords: number): string {
  return averageBulletWords <= 15 ? 'Bullets curtos' : 'Bullets longos';
}

function revisaoHref(resumeImportId: string | null, jobDescriptionId?: string, evaluationId?: string): string {
  const params = new URLSearchParams();
  if (resumeImportId !== null) params.set('resumeImportId', resumeImportId);
  if (jobDescriptionId !== undefined && jobDescriptionId !== '') params.set('vaga', jobDescriptionId);
  if (evaluationId !== undefined && evaluationId !== '') params.set('avaliacao', evaluationId);
  const query = params.toString();
  return query === '' ? '/revisao' : `/revisao?${query}`;
}

function uploadHref(jobDescriptionId?: string, evaluationId?: string): string {
  if (jobDescriptionId === undefined || jobDescriptionId === '') return '/importacao';
  return resumeStepHref({ jobDescriptionId, evaluationId });
}

function prontoHref(resumeId: string, jobDescriptionId?: string, resumeImportId?: string | null): string {
  const params = new URLSearchParams();
  params.set('resumeId', resumeId);
  if (resumeImportId !== null && resumeImportId !== undefined) params.set('resumeImportId', resumeImportId);
  if (jobDescriptionId !== undefined && jobDescriptionId !== '') params.set('vaga', jobDescriptionId);
  return `/pronto?${params.toString()}`;
}

function buildCreateInput(
  proposal: BaseResumeProposal,
  name: string,
  decisions: Record<string, { readonly choice: 'original' | 'rewritten'; readonly text: string }>,
): CreateBaseResumeInput {
  return {
    name,
    language: proposal.language,
    writingMethod: proposal.style.writingMethod,
    tone: proposal.style.tone,
    sections: proposal.sections.map((section, sectionIndex) => {
      if (section.kind === 'skills') {
        return { kind: section.kind, title: section.title, skillIds: section.skillIds ?? [] };
      }
      if (section.kind === 'custom') {
        return {
          kind: section.kind,
          title: section.title,
          items: section.entries.flatMap((entry) =>
            entry.bullets.map((bullet, bulletIndex) => {
              const key = bulletKey(sectionIndex, 0, bulletIndex);
              return decisions[key]?.text ?? bullet.text;
            }),
          ),
        };
      }
      return {
        kind: section.kind,
        title: section.title,
        entries: section.entries.map((entry, entryIndex) => ({
          experienceId: entry.experienceId ?? null,
          educationEntryId: entry.educationEntryId ?? null,
          bullets: entry.bullets.map((bullet, bulletIndex) => {
            const key = bulletKey(sectionIndex, entryIndex, bulletIndex);
            const decided = decisions[key];
            return { evidenceId: bullet.evidenceId, text: decided?.text ?? bullet.text };
          }),
        })),
      };
    }),
  };
}

type FetchState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'generating' }
  | { readonly kind: 'ready'; readonly proposal: BaseResumeProposal }
  | { readonly kind: 'failed' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'wrong-state' }
  | { readonly kind: 'unreachable' };

interface ProposalScreenProps {
  readonly resumeImportId: string | null;
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
}

export function ProposalScreen({
  resumeImportId,
  jobDescriptionId,
  evaluationId,
}: ProposalScreenProps): React.JSX.Element {
  const [fetch, setFetch] = useState<FetchState>({ kind: 'loading' });
  const [proposalName, setProposalName] = useState('');
  const [decisions, setDecisions] = useState<Record<string, { readonly choice: 'original' | 'rewritten'; readonly text: string }>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approvedId, setApprovedId] = useState<string | null>(null);
  const [career, setCareer] = useState<CareerProfileResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getCareerProfile();
        if (!cancelled) setCareer(profile);
      } catch {
        if (!cancelled) setCareer(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resumeImportId === null) {
      setFetch({ kind: 'missing' });
      return;
    }
    const id = resumeImportId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function pollOnce(): Promise<void> {
      let response: BaseResumeProposalResponse;
      try {
        response = await getBaseResumeProposal(id);
      } catch (error: unknown) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) {
          setFetch({ kind: 'missing' });
          return;
        }
        if (error instanceof ApiError && error.status === HTTP_UNPROCESSABLE_ENTITY) {
          setFetch({ kind: 'wrong-state' });
          return;
        }
        setFetch({ kind: 'unreachable' });
        return;
      }
      if (cancelled) return;
      if (response.status === 'ready' && response.proposal !== null) {
        setFetch({ kind: 'ready', proposal: response.proposal });
        setProposalName((current) => (current === '' ? response.proposal?.name ?? '' : current));
        return;
      }
      if (response.status === 'failed') {
        setFetch({ kind: 'failed' });
        return;
      }
      setFetch({ kind: 'generating' });
      timer = setTimeout(() => void pollOnce(), POLL_INTERVAL_MS);
    }
    void pollOnce();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [resumeImportId]);

  if (fetch.kind === 'loading' || fetch.kind === 'generating') {
    return (
      <ProposalProgress
        announcement={fetch.kind === 'loading' ? 'Carregando a proposta do Base Resume.' : 'Montando o Base Resume.'}
        resumeImportId={resumeImportId}
        jobDescriptionId={jobDescriptionId}
        evaluationId={evaluationId}
      />
    );
  }
  if (fetch.kind === 'missing') {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage message={MISSING_MESSAGE} />
        <a href={uploadHref(jobDescriptionId, evaluationId)} className={LINK_CLASSES}>
          Voltar ao envio
        </a>
      </div>
    );
  }
  if (fetch.kind === 'wrong-state') {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage message={WRONG_STATE_MESSAGE} />
        <a href={revisaoHref(resumeImportId, jobDescriptionId, evaluationId)} className={LINK_CLASSES}>
          Voltar à revisão
        </a>
      </div>
    );
  }
  if (fetch.kind === 'unreachable') {
    return <ErrorMessage message={UNREACHABLE_MESSAGE} />;
  }
  if (fetch.kind === 'failed') {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage message={PROPOSAL_FAILED_MESSAGE} />
        <a href={revisaoHref(resumeImportId, jobDescriptionId, evaluationId)} className={LINK_CLASSES}>
          Voltar à revisão
        </a>
      </div>
    );
  }
  const proposal = fetch.proposal;
  const bullets = collectExperienceBullets(proposal);
  const decidedCount = bullets.filter((ref) => decisions[ref.key] !== undefined).length;
  const pendingCount = bullets.length - decidedCount;
  const trimmedName = proposalName.trim();
  const approveDisabled = pendingCount > 0 || trimmedName === '' || isApproving;
  const approveReasonId = 'approve-base-resume-reason';
  const approveReason =
    trimmedName === ''
      ? EMPTY_NAME_MESSAGE
      : pendingCount > 0
        ? `${String(pendingCount)} ${PENDING_BULLETS_MESSAGE}`
        : null;

  async function approve(): Promise<void> {
    if (approveDisabled) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      const created = await createBaseResume(buildCreateInput(proposal, trimmedName, decisions));
      setApprovedId(created.id);
    } catch {
      setApproveError(APPROVE_FAILED_MESSAGE);
    } finally {
      setIsApproving(false);
    }
  }

  if (approvedId !== null) {
    return (
      <section aria-label="Base Resume aprovado" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-ok-soft px-3 py-1 text-[13px] font-semibold text-ok">
          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
          Aprovado
        </p>
        <h2 className="text-base font-semibold text-text">Base Resume salvo</h2>
        <p className="text-sm text-text-2">
          Sua escolha por bullet foi salva. Agora é só colar vagas para avaliar e adaptar.
        </p>
        <a href={prontoHref(approvedId, jobDescriptionId, resumeImportId)} className={LINK_CLASSES}>
          Continuar
        </a>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StatusRegion>
        {pendingCount === 0 ? 'Todos os bullets decididos. Pronto para aprovar.' : ''}
      </StatusRegion>
      <section aria-label="Nome e estilo" className="grid gap-4 rounded-xl border border-border bg-surface p-5 shadow [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <div className="flex flex-col gap-2">
          <LabeledInput
            id="proposal-name"
            label="Nome do Base Resume"
            value={proposalName}
            placeholder="Ex.: Analista de dados"
            onChange={setProposalName}
            describedBy="proposal-name-help"
          />
          <p id="proposal-name-help" className="text-xs text-text-2">
            Só você vê esse nome, para achar o currículo depois.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium text-text-2">Estilo de escrita detectado</h2>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex h-[22px] items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-xs text-text-2">
              Método: <strong className="font-semibold text-text">{methodLabel(proposal.style.writingMethod)}</strong>
            </span>
            <span className="inline-flex h-[22px] items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-xs text-text-2">
              Tom: <strong className="font-semibold text-text">{toneLabel(proposal.style.tone)}</strong>
            </span>
            <span className="inline-flex h-[22px] items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-xs text-text-2">
              <strong className="font-semibold text-text">{lengthLabel(proposal.style.averageBulletWords)}</strong>
            </span>
          </div>
          <p className="text-xs text-text-2">
            A reescrita segue esse estilo. Se ele não for o seu, mantenha os originais.
          </p>
        </div>
      </section>
      <section aria-label="Bullets para decidir" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">Experiências</h2>
            <p className="text-sm text-text-2">Escolha por bullet o texto que fica no Base Resume.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="text-sm tabular-nums text-text-2">
              {String(decidedCount)} de {String(bullets.length)} bullets decididos
            </p>
            <div
              role="progressbar"
              aria-label="Progresso das decisões"
              aria-valuenow={bullets.length === 0 ? 100 : Math.round((decidedCount / bullets.length) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-[3px] w-32 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${bullets.length === 0 ? 100 : Math.round((decidedCount / bullets.length) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>
      {proposal.sections.map((section, sectionIndex) => (
        <ProposalSectionBlock
          key={`proposal-section-${String(sectionIndex)}`}
          section={section}
          sectionIndex={sectionIndex}
          language={proposal.language}
          career={career}
          decisions={decisions}
          editingKey={editingKey}
          editText={editText}
          onEditText={setEditText}
          onStartEdit={(key, current) => {
            setEditingKey(key);
            setEditText(current);
          }}
          onCancelEdit={() => {
            setEditingKey(null);
            setEditText('');
          }}
          onSaveEdit={(key) => {
            const text = editText.trim();
            if (text === '') return;
            setDecisions((current) => ({ ...current, [key]: { choice: 'rewritten', text } }));
            setEditingKey(null);
            setEditText('');
          }}
          onKeepOriginal={(key, original) => {
            setDecisions((current) => ({ ...current, [key]: { choice: 'original', text: original } }));
          }}
          onUseRewritten={(key, rewritten) => {
            setDecisions((current) => ({ ...current, [key]: { choice: 'rewritten', text: rewritten } }));
          }}
          onReset={(key) => {
            setDecisions((current) => {
              const next = { ...current };
              delete next[key];
              return next;
            });
          }}
        />
      ))}
      {approveError !== null && <ErrorMessage message={approveError} />}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={revisaoHref(resumeImportId, jobDescriptionId, evaluationId)}
          className={buttonClasses('ghost', 'md')}
        >
          × Descartar
        </a>
        <div className="flex flex-col items-end gap-1.5">
          <Button onClick={() => void approve()} disabled={approveDisabled} aria-describedby={approveReason === null ? undefined : approveReasonId}>
            {isApproving ? 'Aprovando…' : 'Aprovar Base Resume'}
          </Button>
          {approveReason !== null && (
            <p id={approveReasonId} className="text-xs tabular-nums text-text-2">
              {approveReason}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

function ProposalProgress({
  announcement,
  resumeImportId,
  jobDescriptionId,
  evaluationId,
}: {
  readonly announcement: string;
  readonly resumeImportId: string | null;
  readonly jobDescriptionId?: string;
  readonly evaluationId?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text">Montando o Base Resume</h2>
        <p className="text-sm text-text-2">
          A IA está lendo o seu envio e reescrevendo os bullets no estilo detectado. Você confere
          tudo antes de aprovar.
        </p>
      </header>
      <section
        aria-label="Progresso da montagem"
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow"
      >
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 shadow">
            📄
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate font-mono text-[13px] font-medium tabular-nums text-text">
              Base Resume pela IA
            </p>
            <p className="text-[13px] text-text-2">Reescrevendo bullets…</p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso da montagem"
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-[3px] w-full overflow-hidden rounded-full bg-surface-3"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
      </section>
      <StatusRegion>{announcement}</StatusRegion>
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={revisaoHref(resumeImportId, jobDescriptionId, evaluationId)}
          className={buttonClasses('ghost', 'md')}
        >
          × Descartar
        </a>
        <div className="flex flex-col items-end gap-1.5">
          <Button disabled aria-describedby="approve-wait-reason">
            Aprovar Base Resume
          </Button>
          <p id="approve-wait-reason" className="text-xs text-text-2">
            {WAIT_READY_MESSAGE}
          </p>
        </div>
      </footer>
    </div>
  );
}

interface ProposalSectionBlockProps {
  readonly section: BaseResumeProposal['sections'][number];
  readonly sectionIndex: number;
  readonly language: 'pt' | 'en';
  readonly career: CareerProfileResponse | null;
  readonly decisions: Record<string, { readonly choice: 'original' | 'rewritten'; readonly text: string }>;
  readonly editingKey: string | null;
  readonly editText: string;
  readonly onEditText: (value: string) => void;
  readonly onStartEdit: (key: string, current: string) => void;
  readonly onCancelEdit: () => void;
  readonly onSaveEdit: (key: string) => void;
  readonly onKeepOriginal: (key: string, original: string) => void;
  readonly onUseRewritten: (key: string, rewritten: string) => void;
  readonly onReset: (key: string) => void;
}

function groupProposalSkills(
  skills: ReadonlyArray<{ readonly id: string; readonly name: string; readonly group: string | null }>,
): Array<{ readonly group: string | null; readonly names: string[] }> {
  const byGroup = new Map<string | null, string[]>();
  for (const skill of skills) {
    const key = skill.group ?? null;
    const existing = byGroup.get(key) ?? [];
    existing.push(skill.name);
    byGroup.set(key, existing);
  }
  const grouped: Array<{ readonly group: string | null; readonly names: string[] }> = [];
  for (const [group, names] of byGroup) {
    if (group !== null) {
      grouped.push({ group, names });
    }
  }
  const ungrouped = byGroup.get(null);
  if (ungrouped !== undefined) {
    grouped.push({ group: null, names: ungrouped });
  }
  return grouped;
}

function ProposalSectionBlock({
  section,
  sectionIndex,
  language,
  career,
  decisions,
  editingKey,
  editText,
  onEditText,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onKeepOriginal,
  onUseRewritten,
  onReset,
}: ProposalSectionBlockProps): React.JSX.Element {
  const title = sectionLabel(section, language);
  if (section.kind === 'skills') {
    const byId = new Map((career?.skills ?? []).map((skill) => [skill.id, skill]));
    const resolved = (section.skillIds ?? [])
      .map((id) => byId.get(id))
      .filter((skill): skill is NonNullable<typeof skill> => skill !== undefined);
    const fallback = (section.skillIds ?? []).map((id) => ({ id, name: id, group: null }));
    const grouped = groupProposalSkills(resolved.length > 0 ? resolved : fallback);
    return (
      <section aria-label={title} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {grouped.map((group) => (
          <div key={group.group ?? 'outras'} className="flex flex-col gap-2">
            <h4 className="text-[13px] font-medium text-text-2">
              {group.group ?? 'Outras'}
            </h4>
            <ul className="flex flex-wrap gap-2">
              {group.names.map((name) => (
                <li
                  key={name}
                  className="inline-flex h-[26px] items-center rounded-md border border-border bg-surface-2 px-2 text-xs font-medium text-text"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    );
  }
  if (section.kind === 'education') {
    const byId = new Map((career?.educationEntries ?? []).map((entry) => [entry.id, entry]));
    return (
      <section aria-label={title} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {section.entries.map((entry, entryIndex) => {
          const resolved = entry.educationEntryId !== null && entry.educationEntryId !== undefined
            ? byId.get(entry.educationEntryId)
            : undefined;
          if (resolved === undefined) {
            return (
              <div key={`education-${String(entryIndex)}`} className="flex flex-col gap-1">
                {entry.bullets.map((bullet, bulletIndex) => (
                  <p key={`education-${String(entryIndex)}-${String(bulletIndex)}`} className="text-sm text-text-2">
                    {bullet.text}
                  </p>
                ))}
              </div>
            );
          }
          return (
            <div key={resolved.id} className="flex flex-col gap-1">
              <p className="text-sm font-medium text-text">{resolved.degree}</p>
              <p className="text-sm text-text-2">
                {`${resolved.institution} (${formatEducationPeriod(resolved.startedOn, resolved.endedOn)})`}
              </p>
            </div>
          );
        })}
      </section>
    );
  }
  if (section.kind !== 'experience') {
    return (
      <section aria-label={title} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {section.entries.flatMap((entry, entryIndex) =>
          entry.bullets.map((bullet, bulletIndex) => (
            <p key={`other-${String(entryIndex)}-${String(bulletIndex)}`} className="text-sm text-text-2">
              {bullet.text}
            </p>
          )),
        )}
      </section>
    );
  }
  return (
    <section aria-label="Experiência da proposta" className="flex flex-col gap-4">
      {section.entries.map((entry, entryIndex) => {
        const entryBullets = entry.bullets.map((_, bulletIndex) =>
          bulletKey(sectionIndex, entryIndex, bulletIndex),
        );
        const decidedInEntry = entryBullets.filter((key) => decisions[key] !== undefined).length;
        return (
          <div key={`entry-${String(entryIndex)}`} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text">
                {`Experiência ${String(entryIndex + 1)}`}
              </h3>
              <p className="text-xs tabular-nums text-text-2">
                {String(decidedInEntry)} de {String(entryBullets.length)} decididos
              </p>
            </div>
            {entry.bullets.map((bullet, bulletIndex) => (
              <BulletRow
                key={bulletKey(sectionIndex, entryIndex, bulletIndex)}
                bulletKey={bulletKey(sectionIndex, entryIndex, bulletIndex)}
                original={bullet.original}
                rewritten={bullet.text}
                decision={decisions[bulletKey(sectionIndex, entryIndex, bulletIndex)]}
                isEditing={editingKey === bulletKey(sectionIndex, entryIndex, bulletIndex)}
                editText={editText}
                onEditText={onEditText}
                onStartEdit={onStartEdit}
                onCancelEdit={onCancelEdit}
                onSaveEdit={onSaveEdit}
                onKeepOriginal={onKeepOriginal}
                onUseRewritten={onUseRewritten}
                onReset={onReset}
              />
            ))}
          </div>
        );
      })}
    </section>
  );
}

interface BulletRowProps {
  readonly bulletKey: string;
  readonly original: string;
  readonly rewritten: string;
  readonly decision: { readonly choice: 'original' | 'rewritten'; readonly text: string } | undefined;
  readonly isEditing: boolean;
  readonly editText: string;
  readonly onEditText: (value: string) => void;
  readonly onStartEdit: (key: string, current: string) => void;
  readonly onCancelEdit: () => void;
  readonly onSaveEdit: (key: string) => void;
  readonly onKeepOriginal: (key: string, original: string) => void;
  readonly onUseRewritten: (key: string, rewritten: string) => void;
  readonly onReset: (key: string) => void;
}

function BulletRow({
  bulletKey,
  original,
  rewritten,
  decision,
  isEditing,
  editText,
  onEditText,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onKeepOriginal,
  onUseRewritten,
  onReset,
}: BulletRowProps): React.JSX.Element {
  if (decision !== undefined) {
    const choseRewritten = decision.choice === 'rewritten';
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-accent bg-surface p-3">
        <p className="inline-flex w-fit items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">
          <Check size={12} strokeWidth={2.2} aria-hidden="true" />
          {choseRewritten ? 'Reescrita escolhida' : 'Original mantido'}
        </p>
        <p className="text-sm text-text">{decision.text}</p>
        <p className="text-xs text-text-2">
          {choseRewritten ? 'Você escolheu a reescrita.' : 'Você manteve o original.'}
        </p>
        <div>
          <Button variant="ghost" size="sm" onClick={() => onReset(bulletKey)}>
            Alterar escolha
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      <div className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-2">Original</p>
        <p className="text-sm text-text-2">{original}</p>
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-accent-soft p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-2">
          Reescrita pela IA
        </p>
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={`edit-${bulletKey}`} className="text-[13px] font-medium text-text-2">
              Sua versão
            </label>
            <textarea
              id={`edit-${bulletKey}`}
              value={editText}
              onChange={(event) => onEditText(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            />
            <p className="text-xs text-text-2">
              Sua versão substitui a reescrita e conta como confirmada.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button size="xs" onClick={() => onSaveEdit(bulletKey)}>
                Salvar bullet
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-text">{rewritten}</p>
            <p className="inline-flex w-fit items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
              Não confirmado
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => onStartEdit(bulletKey, rewritten)}>
                Editar
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onKeepOriginal(bulletKey, original)}>
                Manter original
              </Button>
              <Button size="sm" onClick={() => onUseRewritten(bulletKey, rewritten)}>
                Usar reescrita
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
