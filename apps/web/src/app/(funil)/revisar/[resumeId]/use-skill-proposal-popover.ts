'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import type { ChangeRect } from '../../../../components/review/to-host-rect';
import { acceptSkillProposal, rejectSkillProposal } from '../../../../lib/api-client';

const REVIEW_ERROR_MESSAGE = 'Não foi possível salvar a decisão. Tente de novo.';
const ACCEPTED_MESSAGE = 'Alteração aceita.';
const REJECTED_MESSAGE = 'Alteração rejeitada.';
const TOAST_DURATION_MS = 4000;
const FALLBACK_RECT: ChangeRect = { top: 0, left: 0, width: 0, height: 0 };

interface UseSkillProposalPopoverOptions {
  readonly document: ResumeDocumentResponse;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
}

export function useSkillProposalPopover({
  document,
  onDocumentChange,
}: UseSkillProposalPopoverOptions): {
  readonly pendingSkillProposals: readonly ResumeDocumentResponse['skillProposals'][number][];
  readonly selectedSkillProposal: ResumeDocumentResponse['skillProposals'][number] | null;
  readonly selectedSkillBeforeText: string | null;
  readonly selectedSkillCoverages: readonly { requirementId: string; literalTerm: string }[];
  readonly skillHostRect: ChangeRect;
  readonly skillFocusId: string | null;
  readonly skillFocusToken: number;
  readonly skillError: string | null;
  readonly skillAnnouncement: string;
  readonly openForSkillProposal: (proposalId: string, rect: ChangeRect) => void;
  readonly clearSkillSelection: () => void;
  readonly handleSkillAccept: () => Promise<void>;
  readonly handleSkillReject: () => Promise<void>;
  readonly handleSkillPopoverOpenChange: (open: boolean) => void;
  readonly focusSkillProposal: (proposalId: string) => void;
} {
  const pendingSkillProposals = useMemo(
    () => document.skillProposals.filter((proposal) => proposal.status === 'pending'),
    [document],
  );
  const [selectedSkillProposalId, setSelectedSkillProposalId] = useState<string | null>(null);
  const [skillHostRect, setSkillHostRect] = useState<ChangeRect>(FALLBACK_RECT);
  const [skillFocusId, setSkillFocusId] = useState<string | null>(null);
  const [skillFocusToken, setSkillFocusToken] = useState(0);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [skillAnnouncement, setSkillAnnouncement] = useState('');

  const selectedSkillProposal =
    selectedSkillProposalId === null
      ? null
      : (pendingSkillProposals.find((proposal) => proposal.id === selectedSkillProposalId) ??
        document.skillProposals.find((proposal) => proposal.id === selectedSkillProposalId) ??
        null);

  const selectedSkillBeforeText =
    selectedSkillProposal === null || selectedSkillProposal.kind !== 'swap'
      ? null
      : selectedSkillProposal.replacesSkillName;

  const selectedSkillCoverages =
    selectedSkillProposal === null ||
    selectedSkillProposal.requirementId === null ||
    selectedSkillProposal.literalTerm === null
      ? []
      : [
          {
            requirementId: selectedSkillProposal.requirementId,
            literalTerm: selectedSkillProposal.literalTerm,
          },
        ];

  function openForSkillProposal(proposalId: string, rect: ChangeRect): void {
    setSkillError(null);
    setSelectedSkillProposalId(proposalId);
    setSkillHostRect(rect);
  }

  function clearSkillSelection(): void {
    setSelectedSkillProposalId(null);
  }

  function focusSkillProposal(proposalId: string): void {
    setSkillFocusId(proposalId);
    setSkillFocusToken((token) => token + 1);
  }

  function handleSkillPopoverOpenChange(open: boolean): void {
    if (open) return;
    setSelectedSkillProposalId(null);
  }

  async function handleSkillAccept(): Promise<void> {
    if (selectedSkillProposal === null) return;
    try {
      const next = await acceptSkillProposal(document.id, selectedSkillProposal.id);
      onDocumentChange(next);
      setSkillError(null);
      setSkillAnnouncement(ACCEPTED_MESSAGE);
      toast.success(ACCEPTED_MESSAGE, { duration: TOAST_DURATION_MS });
      setSelectedSkillProposalId(null);
    } catch {
      setSkillError(REVIEW_ERROR_MESSAGE);
    }
  }

  async function handleSkillReject(): Promise<void> {
    if (selectedSkillProposal === null) return;
    try {
      const next = await rejectSkillProposal(document.id, selectedSkillProposal.id);
      onDocumentChange(next);
      setSkillError(null);
      setSkillAnnouncement(REJECTED_MESSAGE);
      toast.success(REJECTED_MESSAGE, { duration: TOAST_DURATION_MS });
      setSelectedSkillProposalId(null);
    } catch {
      setSkillError(REVIEW_ERROR_MESSAGE);
    }
  }

  return {
    pendingSkillProposals,
    selectedSkillProposal,
    selectedSkillBeforeText,
    selectedSkillCoverages,
    skillHostRect,
    skillFocusId,
    skillFocusToken,
    skillError,
    skillAnnouncement,
    openForSkillProposal,
    clearSkillSelection,
    handleSkillAccept,
    handleSkillReject,
    handleSkillPopoverOpenChange,
    focusSkillProposal,
  };
}
