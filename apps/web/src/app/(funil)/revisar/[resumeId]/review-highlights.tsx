'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import { resolveSectionLabel } from 'resume-templates';
import { ResumePreview, type PreviewChangeSelection } from '../../../../components/resume-preview';
import { toPreviewDocument } from '../../../../components/resume-editor/to-preview-document';
import { ErrorMessage } from '../../../../components/error-message';
import { StatusRegion } from '../../../../components/status-region';
import {
  computeChangeHighlights,
  findHighlightBullet,
} from '../../../../components/review/change-highlights';
import { toHostRect, type ChangeRect } from '../../../../components/review/to-host-rect';
import { ChangePopover } from '../../../../components/review/change-popover';
import { ReviewBar, type ReviewChangeItem } from '../../../../components/review/review-bar';
import {
  reviewAdaptationChange,
  undoAdaptationChange,
} from '../../../../lib/api-client';
import { useSkillProposalPopover } from './use-skill-proposal-popover';
import { ReviewSectionsList } from './review-sections-list';

const REVIEW_ERROR_MESSAGE = 'Não foi possível salvar a decisão. Tente de novo.';
const ACCEPTED_MESSAGE = 'Alteração aceita.';
const REJECTED_MESSAGE = 'Alteração rejeitada.';
const RESTORED_MESSAGE = 'Evidence restaurada.';
const UNDONE_MESSAGE = 'Ação desfeita.';
const UNDO_LABEL = 'Desfazer';
const PENDING_STATUS_LABEL = 'Pendente';
const TOAST_DURATION_MS = 4000;
const ITEM_LABEL_LIMIT = 40;
const FALLBACK_RECT: ChangeRect = { top: 0, left: 0, width: 0, height: 0 };

const TOAST_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  boxShadow: 'var(--shadow-lg)',
  fontSize: '13px',
  minWidth: '260px',
  maxWidth: '380px',
} as const;

function truncateLabel(text: string): string {
  const singleLine = text.trim().replace(/\s+/g, ' ');
  if (singleLine.length <= ITEM_LABEL_LIMIT) return singleLine;
  return `${singleLine.slice(0, ITEM_LABEL_LIMIT)}…`;
}

interface ReviewHighlightsProps {
  readonly document: ResumeDocumentResponse;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
  readonly onSectionSelect: (sectionId: string) => void;
  readonly onPageCount?: (pageCount: number) => void;
}

export function ReviewHighlights({
  document,
  onDocumentChange,
  onSectionSelect,
  onPageCount,
}: ReviewHighlightsProps): React.JSX.Element {
  const highlights = useMemo(
    () =>
      computeChangeHighlights({
        sections: document.sections,
        adaptationChanges: document.adaptationChanges,
        adaptationReview: document.adaptationReview,
      }),
    [document],
  );
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [selectedBulletId, setSelectedBulletId] = useState<string | null>(null);
  const [hostRect, setHostRect] = useState<ChangeRect>(FALLBACK_RECT);
  const [focusBulletId, setFocusBulletId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const skill = useSkillProposalPopover({ document, onDocumentChange });

  useEffect(() => {
    if (highlights.highlightedBulletIds.length === 0) {
      setCurrentIndex(null);
      setSelectedBulletId(null);
      return;
    }
    setCurrentIndex((current) => {
      if (current === null) return 0;
      if (current >= highlights.highlightedBulletIds.length) {
        return highlights.highlightedBulletIds.length - 1;
      }
      return current;
    });
    setSelectedBulletId((selected) => {
      if (selected === null) return selected;
      return highlights.highlightedBulletIds.includes(selected) ? selected : null;
    });
  }, [highlights]);

  const selectedBullet =
    selectedBulletId === null ? null : findHighlightBullet(document.sections, selectedBulletId);
  const selectedBeforeText =
    selectedBullet === null
      ? null
      : (document.adaptationChanges?.addedEvidences.find(
          (item) => item.id === selectedBullet.evidenceId,
        )?.statement ?? null);
  const selectedCoverages =
    selectedBulletId === null
      ? []
      : document.requirementCoverages
          .filter((coverage) => coverage.bulletId === selectedBulletId)
          .map((coverage) => ({
            requirementId: coverage.requirementId,
            literalTerm: coverage.literalTerm,
          }));

  function openForBullet(bulletId: string, rect: ChangeRect): void {
    const index = highlights.highlightedBulletIds.indexOf(bulletId);
    if (index >= 0) setCurrentIndex(index);
    setSelectedBulletId(bulletId);
    setHostRect(rect);
  }

  function handleChangeSelect(selection: PreviewChangeSelection): void {
    const converted = toHostRect(selection.rect, selection.frameRect);
    if (selection.skillProposalId !== null && selection.skillProposalId !== '') {
      setSelectedBulletId(null);
      setReviewError(null);
      skill.openForSkillProposal(selection.skillProposalId, converted);
      return;
    }
    if (selection.bulletId === null || selection.bulletId === '') return;
    setReviewError(null);
    skill.clearSkillSelection();
    openForBullet(selection.bulletId, converted);
  }

  function focusBullet(bulletId: string): void {
    setFocusBulletId(bulletId);
    setFocusToken((token) => token + 1);
  }

  function handlePrevious(): void {
    if (currentIndex === null || currentIndex <= 0) return;
    const target = highlights.highlightedBulletIds[currentIndex - 1];
    if (target === undefined) return;
    setCurrentIndex(currentIndex - 1);
    setSelectedBulletId(target);
    setHostRect((current) => current);
    focusBullet(target);
    setAnnouncement(`Alteração ${String(currentIndex)} de ${String(highlights.highlightedBulletIds.length)}.`);
  }

  function handleNext(): void {
    if (currentIndex === null || currentIndex >= highlights.highlightedBulletIds.length - 1) {
      if (highlights.highlightedBulletIds.length > 0 && currentIndex === null) {
        const first = highlights.highlightedBulletIds[0];
        if (first !== undefined) {
          setCurrentIndex(0);
          setSelectedBulletId(first);
          focusBullet(first);
        }
      }
      return;
    }
    const target = highlights.highlightedBulletIds[currentIndex + 1];
    if (target === undefined) return;
    setCurrentIndex(currentIndex + 1);
    setSelectedBulletId(target);
    focusBullet(target);
    setAnnouncement(`Alteração ${String(currentIndex + 2)} de ${String(highlights.highlightedBulletIds.length)}.`);
  }

  function handlePopoverOpenChange(open: boolean): void {
    if (open) return;
    setSelectedBulletId(null);
  }

  async function handleUndo(evidenceId: string): Promise<void> {
    try {
      const next = await undoAdaptationChange(document.id, { evidenceId });
      onDocumentChange(next);
      setReviewError(null);
      setAnnouncement(UNDONE_MESSAGE);
    } catch {
      setReviewError(REVIEW_ERROR_MESSAGE);
    }
  }

  function showUndoToast(message: string, evidenceId: string): void {
    toast.success(message, {
      duration: TOAST_DURATION_MS,
      style: { ...TOAST_STYLE },
      action: { label: UNDO_LABEL, onClick: () => void handleUndo(evidenceId) },
    });
  }

  async function decide(evidenceId: string, decision: 'accepted' | 'rejected' | 'restored', successMessage: string): Promise<void> {
    try {
      const next = await reviewAdaptationChange(document.id, { evidenceId, decision });
      onDocumentChange(next);
      setReviewError(null);
      setAnnouncement(successMessage);
      showUndoToast(successMessage, evidenceId);
      if (decision !== 'restored') setSelectedBulletId(null);
    } catch {
      setReviewError(REVIEW_ERROR_MESSAGE);
    }
  }

  async function handleAccept(): Promise<void> {
    if (selectedBullet === null) return;
    await decide(selectedBullet.evidenceId, 'accepted', ACCEPTED_MESSAGE);
  }

  async function handleReject(): Promise<void> {
    if (selectedBullet === null) return;
    await decide(selectedBullet.evidenceId, 'rejected', REJECTED_MESSAGE);
  }

  async function handleRestore(evidenceId: string): Promise<void> {
    await decide(evidenceId, 'restored', RESTORED_MESSAGE);
  }

  const previewDocument = useMemo(
    () => toPreviewDocument(document, highlights.highlightedBulletIds),
    [document, highlights],
  );
  const isTailored = document.kind === 'tailored';

  const changeItems: readonly ReviewChangeItem[] = useMemo(
    () =>
      highlights.highlightedBulletIds.flatMap((bulletId) => {
        const found = findHighlightBullet(document.sections, bulletId);
        if (found === null) return [];
        let context: string | null = null;
        for (const section of document.sections) {
          const entry = section.entries.find((candidate) =>
            candidate.bullets.some((bullet) => bullet.id === bulletId),
          );
          if (entry === undefined) continue;
          const sectionLabel = resolveSectionLabel(
            section.kind,
            section.title ?? undefined,
            document.language,
          );
          const entryContext =
            entry.company ?? entry.institution ?? entry.heading ?? entry.role ?? null;
          context = entryContext === null ? sectionLabel : `${sectionLabel} · ${entryContext}`;
          break;
        }
        return [
          {
            bulletId,
            label: truncateLabel(found.text),
            title: context ?? undefined,
            status: PENDING_STATUS_LABEL,
          },
        ];
      }),
    [document, highlights],
  );

  function handleChangeItemSelect(bulletId: string): void {
    setReviewError(null);
    focusBullet(bulletId);
  }

  return (
    <div className="grid items-start gap-5 [grid-template-columns:minmax(0,1fr)_272px] max-lg:[grid-template-columns:minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex justify-center overflow-auto rounded-xl border border-border bg-sheet-bg px-6 py-8">
          <div className="w-full min-w-0 max-w-[595px]">
            <ResumePreview
              document={previewDocument}
              template={document.template}
              language={document.language}
              highlightedBulletIds={highlights.highlightedBulletIds}
              focusBulletId={focusBulletId}
              focusSkillProposalId={skill.skillFocusId}
              focusToken={focusToken + skill.skillFocusToken}
              onSectionSelect={onSectionSelect}
              onPageCount={onPageCount}
              onChangeSelect={handleChangeSelect}
            />
          </div>
        </div>
        {reviewError !== null && <ErrorMessage message={reviewError} />}
        {skill.skillError !== null && <ErrorMessage message={skill.skillError} />}
        {selectedBullet !== null && (
          <ChangePopover
            bulletText={selectedBullet.text}
            beforeText={selectedBeforeText}
            coverages={selectedCoverages}
            hostRect={hostRect}
            open
            onOpenChange={handlePopoverOpenChange}
            onAccept={() => void handleAccept()}
            onReject={() => void handleReject()}
            onRequestFocus={() => focusBullet(selectedBullet.bulletId)}
          />
        )}
        {skill.selectedSkillProposal !== null && (
          <ChangePopover
            bulletText={skill.selectedSkillProposal.name}
            beforeText={skill.selectedSkillBeforeText}
            coverages={skill.selectedSkillCoverages}
            hostRect={skill.skillHostRect}
            open
            onOpenChange={skill.handleSkillPopoverOpenChange}
            onAccept={() => void skill.handleSkillAccept()}
            onReject={() => void skill.handleSkillReject()}
            onRequestFocus={() => skill.focusSkillProposal(skill.selectedSkillProposal?.id ?? '')}
          />
        )}
        <StatusRegion>{announcement}</StatusRegion>
        <StatusRegion>{skill.skillAnnouncement}</StatusRegion>
      </div>
      <aside className="sticky top-[76px] flex min-w-0 flex-col gap-5">
        {isTailored && (
          <ReviewBar
            total={highlights.highlightedBulletIds.length}
            currentIndex={currentIndex}
            removed={highlights.pendingRemoved}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onRestore={(evidenceId) => void handleRestore(evidenceId)}
            coverage={{
              matchScore: document.matchScore,
              coverages: document.requirementCoverages,
              sections: document.sections,
              languageFallback: document.languageFallback,
            }}
            onCoverageSectionSelect={onSectionSelect}
            items={changeItems}
            onItemSelect={handleChangeItemSelect}
          />
        )}
        <ReviewSectionsList document={document} onSectionSelect={onSectionSelect} />
      </aside>
    </div>
  );
}
