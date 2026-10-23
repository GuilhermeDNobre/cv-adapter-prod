'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  acceptSkillProposal,
  getResume,
  reviewAdaptationChange,
} from '../../../../lib/api-client';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import { failureReasonMessage } from '../../../../lib/ai-error-messages';
import { Button } from '../../../../components/button';
import { ErrorMessage } from '../../../../components/error-message';
import { StatusRegion } from '../../../../components/status-region';
import { resolveSectionLabel } from 'resume-templates';
import {
  computeChangeHighlights,
  findHighlightBullet,
} from '../../../../components/review/change-highlights';
import { AddCustomSectionForm } from '../../../../components/resume-editor/add-custom-section-form';
import { DocumentSettingsPanel } from '../../../../components/resume-editor/document-settings-panel';
import { SectionPanel } from '../../../../components/resume-editor/section-panel';
import { SectionDrawer } from '../../../../components/review/section-drawer';
import { AiProgress } from '../../../../components/wizard/ai-progress';
import { ReviewHighlights } from './review-highlights';

const POLL_INTERVAL_MS = 1500;

const LOADING_MESSAGE = 'Carregando o currículo.';
const GENERATING_MESSAGE = 'Gerando o currículo. Isso pode levar até 2 minutos.';
const UNREACHABLE_MESSAGE =
  'Não foi possível carregar o currículo. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';
const NOT_FOUND_MESSAGE = 'Não encontramos este currículo. Ele pode ter sido apagado.';
const GENERATION_FAILED_MESSAGE =
  'A geração deste currículo falhou e nada foi salvo pela metade.';
const REWRITE_COMPLETED_MESSAGE = 'Reescrita concluída. O documento está pronto.';
const SETTINGS_TITLE = 'Configurações do documento';
const ACCEPT_ALL_MESSAGE = 'Todas as mudanças aceitas.';
const ACCEPT_ALL_ERROR_MESSAGE = 'Não foi possível aceitar todas as mudanças. Tente de novo.';
const TOAST_DURATION_MS = 4000;

const KIND_LABELS: Record<ResumeDocumentResponse['kind'], string> = {
  base: 'Base Resume',
  tailored: 'Tailored Resume',
};

const GENERATION_STATUS_LABELS: Record<ResumeDocumentResponse['generationStatus'], string> = {
  ready: 'Pronto',
  generating: 'Gerando',
  failed: 'Falha na geração',
};

type EditorStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly document: ResumeDocumentResponse };

type DrawerState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'section'; readonly sectionId: string }
  | { readonly kind: 'settings' };

function announcementFor(stage: EditorStage, completionNotice: string): string {
  if (stage.kind === 'loading') return LOADING_MESSAGE;
  if (stage.kind !== 'ready') return '';
  if (stage.document.generationStatus === 'generating') return GENERATING_MESSAGE;
  if (stage.document.generationStatus === 'failed') return GENERATION_FAILED_MESSAGE;
  return completionNotice;
}

function focusPreviewSection(sectionId: string): void {
  const frame = document.querySelector('iframe[title="Pré-visualização do currículo"]');
  const target = (frame as HTMLIFrameElement | null)?.contentWindow as
    | { readonly postMessage?: unknown }
    | null
    | undefined;
  if (target === undefined || target === null) return;
  if (typeof target.postMessage !== 'function') return;
  const post = target.postMessage as (message: unknown, targetOrigin: string) => void;
  post.call(target, { type: 'focus-section', sectionId }, '*');
}

interface RevisarScreenProps {
  readonly params: Promise<{ readonly resumeId: string }>;
}

export default function RevisarScreen({ params }: RevisarScreenProps): React.JSX.Element {
  const { resumeId } = use(params);
  const [stage, setStage] = useState<EditorStage>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [drawer, setDrawer] = useState<DrawerState>({ kind: 'closed' });
  const [completionNotice, setCompletionNotice] = useState('');
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [acceptAllError, setAcceptAllError] = useState<string | null>(null);
  const wasGeneratingRef = useRef(false);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function loadOnce(): Promise<void> {
      try {
        const document = await getResume(resumeId);
        if (cancelled) return;
        setStage({ kind: 'ready', document });
        if (document.generationStatus === 'generating') {
          wasGeneratingRef.current = true;
          setCompletionNotice('');
          timer = setTimeout(() => void loadOnce(), POLL_INTERVAL_MS);
        } else if (wasGeneratingRef.current) {
          wasGeneratingRef.current = false;
          if (document.generationStatus === 'ready' && document.failureReason === null) {
            setCompletionNotice(REWRITE_COMPLETED_MESSAGE);
          }
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
    if (document.generationStatus === 'generating') {
      wasGeneratingRef.current = true;
      setCompletionNotice('');
      setReloadToken((token) => token + 1);
    }
  }, []);

  const handleSectionSelect = useCallback((sectionId: string) => {
    setDrawer({ kind: 'section', sectionId });
  }, []);

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      if (drawer.kind === 'section') focusPreviewSection(drawer.sectionId);
      setDrawer({ kind: 'closed' });
    },
    [drawer],
  );

  const handleSectionRemoved = useCallback(() => {
    setDrawer({ kind: 'closed' });
  }, []);

  function handleRequestFocus(): void {
    settingsTriggerRef.current?.focus();
  }

  if (stage.kind === 'loading') {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <p className="font-medium text-text">{LOADING_MESSAGE}</p>
        <StatusRegion>{LOADING_MESSAGE}</StatusRegion>
      </main>
    );
  }

  if (stage.kind === 'failed') {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Editar currículo</h1>
        <ErrorMessage message={stage.message} />
        <div>
          <Button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar de novo
          </Button>
        </div>
        <StatusRegion>{''}</StatusRegion>
      </main>
    );
  }

  const document = stage.document;
  const pendingHighlights = computeChangeHighlights({
    sections: document.sections,
    adaptationChanges: document.adaptationChanges,
    adaptationReview: document.adaptationReview,
  });
  const pendingSkillProposals = document.skillProposals.filter(
    (proposal) => proposal.status === 'pending',
  );
  const pendingCount = pendingHighlights.highlightedBulletIds.length + pendingSkillProposals.length;

  async function handleAcceptAll(): Promise<void> {
    if (
      isAcceptingAll ||
      (pendingHighlights.highlightedBulletIds.length === 0 && pendingSkillProposals.length === 0)
    )
      return;
    const evidenceIds = pendingHighlights.highlightedBulletIds.flatMap((bulletId) => {
      const found = findHighlightBullet(document.sections, bulletId);
      return found === null ? [] : [found.evidenceId];
    });
    const skillProposalIds = [...pendingSkillProposals]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((proposal) => proposal.id);
    if (evidenceIds.length === 0 && skillProposalIds.length === 0) return;
    setIsAcceptingAll(true);
    setAcceptAllError(null);
    try {
      for (const evidenceId of evidenceIds) {
        const next = await reviewAdaptationChange(document.id, {
          evidenceId,
          decision: 'accepted',
        });
        handleDocumentChange(next);
      }
      for (const proposalId of skillProposalIds) {
        const next = await acceptSkillProposal(document.id, proposalId);
        handleDocumentChange(next);
      }
      toast.success(ACCEPT_ALL_MESSAGE, { duration: TOAST_DURATION_MS });
    } catch {
      setAcceptAllError(ACCEPT_ALL_ERROR_MESSAGE);
    } finally {
      setIsAcceptingAll(false);
    }
  }

  const selectedSection =
    drawer.kind === 'section'
      ? (document.sections.find((section) => section.id === drawer.sectionId) ?? null)
      : null;
  const drawerOpen =
    drawer.kind === 'settings' || (drawer.kind === 'section' && selectedSection !== null);
  const drawerTitle =
    drawer.kind === 'settings'
      ? SETTINGS_TITLE
      : selectedSection === null
        ? SETTINGS_TITLE
        : resolveSectionLabel(
            selectedSection.kind,
            selectedSection.title ?? undefined,
            document.language,
          );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">{document.name}</h1>
          <p className="text-text-2">
            {KIND_LABELS[document.kind]} · {GENERATION_STATUS_LABELS[document.generationStatus]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] tabular-nums text-text-3">
            {pendingCount > 0
              ? `${String(pendingCount)} ${pendingCount === 1 ? 'pendente' : 'pendentes'}`
              : 'Tudo revisado'}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pendingCount === 0 || isAcceptingAll}
            onClick={() => void handleAcceptAll()}
          >
            Aceitar todas
          </Button>
        </div>
      </header>
      {document.generationStatus === 'generating' && (
        <AiProgress
          generationStatus={document.generationStatus}
          generationStep={document.generationStep}
        />
      )}
      {document.generationStatus === 'failed' && (
        <ErrorMessage
          message={failureReasonMessage(document.failureReason, GENERATION_FAILED_MESSAGE)}
        />
      )}
      {acceptAllError !== null && <ErrorMessage message={acceptAllError} />}
      <div className="flex flex-col gap-4">
        <div>
          <button
            ref={settingsTriggerRef}
            type="button"
            onClick={() => setDrawer({ kind: 'settings' })}
            className="rounded-lg border border-border-strong bg-surface px-4 py-2 font-semibold text-text shadow transition-[background-color,transform] duration-press ease-out-motion hover:bg-surface-2 motion-safe:active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {SETTINGS_TITLE}
          </button>
        </div>
        <div className="flex-1">
          <ReviewHighlights
            document={document}
            onDocumentChange={handleDocumentChange}
            onSectionSelect={handleSectionSelect}
          />
        </div>
      </div>
      <SectionDrawer
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        title={drawerTitle}
        kicker={drawer.kind === 'settings' ? null : undefined}
        onRequestFocus={drawer.kind === 'settings' ? handleRequestFocus : undefined}
      >
        {drawer.kind === 'settings' ? (
          <DocumentSettingsPanel resume={document} onDocumentChange={handleDocumentChange} />
        ) : selectedSection !== null ? (
          <div className="flex flex-col gap-4">
            <SectionPanel
              key={selectedSection.id}
              section={selectedSection}
              sections={document.sections}
              resumeId={document.id}
              language={document.language}
              onDocumentChange={handleDocumentChange}
              onSectionRemoved={handleSectionRemoved}
              failureReason={document.failureReason}
            />
            <AddCustomSectionForm
              resumeId={document.id}
              sections={document.sections}
              onDocumentChange={handleDocumentChange}
            />
          </div>
        ) : null}
      </SectionDrawer>
      <StatusRegion>{announcementFor(stage, completionNotice)}</StatusRegion>
    </main>
  );
}
