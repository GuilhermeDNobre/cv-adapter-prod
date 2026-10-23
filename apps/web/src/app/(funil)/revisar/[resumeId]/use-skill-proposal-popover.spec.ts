import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { resumeDocumentFixture } from '../../../../components/resume-editor/editor-fixtures';
import { acceptSkillProposal, rejectSkillProposal } from '../../../../lib/api-client';
import { useSkillProposalPopover } from './use-skill-proposal-popover';

vi.mock('../../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api-client')>();
  return { ...actual, acceptSkillProposal: vi.fn(), rejectSkillProposal: vi.fn() };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const mockedAccept = vi.mocked(acceptSkillProposal);
const mockedReject = vi.mocked(rejectSkillProposal);

const SWAP_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const ADDITION_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const REQUIREMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function documentWithProposals() {
  const base = resumeDocumentFixture();
  return {
    ...base,
    skillProposals: [
      {
        id: SWAP_ID,
        kind: 'swap' as const,
        name: 'Fastify',
        group: 'Back-end',
        replacesSkillId: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
        replacesSkillName: 'NestJS',
        requirementId: REQUIREMENT_ID,
        literalTerm: 'Fastify',
        status: 'pending' as const,
        ordinal: 0,
      },
      {
        id: ADDITION_ID,
        kind: 'addition' as const,
        name: 'Docker',
        group: 'DevOps',
        replacesSkillId: null,
        replacesSkillName: null,
        requirementId: null,
        literalTerm: null,
        status: 'pending' as const,
        ordinal: 1,
      },
    ],
  };
}

describe('useSkillProposalPopover', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockedAccept.mockReset();
    mockedReject.mockReset();
  });

  it('should list only pending proposals', () => {
    const { result } = renderHook(() =>
      useSkillProposalPopover({ document: documentWithProposals(), onDocumentChange: vi.fn() }),
    );

    expect(result.current.pendingSkillProposals.map((proposal) => proposal.id)).toEqual([
      SWAP_ID,
      ADDITION_ID,
    ]);
    expect(result.current.selectedSkillProposal).toBeNull();
  });

  it('should expose the new name, the original skill and the requirement coverage for a swap', () => {
    const { result } = renderHook(() =>
      useSkillProposalPopover({ document: documentWithProposals(), onDocumentChange: vi.fn() }),
    );

    act(() => {
      result.current.openForSkillProposal(SWAP_ID, { top: 0, left: 0, width: 10, height: 10 });
    });

    expect(result.current.selectedSkillProposal?.name).toBe('Fastify');
    expect(result.current.selectedSkillBeforeText).toBe('NestJS');
    expect(result.current.selectedSkillCoverages).toEqual([
      { requirementId: REQUIREMENT_ID, literalTerm: 'Fastify' },
    ]);
  });

  it('should have no before text and no coverages for an addition', () => {
    const { result } = renderHook(() =>
      useSkillProposalPopover({ document: documentWithProposals(), onDocumentChange: vi.fn() }),
    );

    act(() => {
      result.current.openForSkillProposal(ADDITION_ID, { top: 0, left: 0, width: 10, height: 10 });
    });

    expect(result.current.selectedSkillProposal?.name).toBe('Docker');
    expect(result.current.selectedSkillBeforeText).toBeNull();
    expect(result.current.selectedSkillCoverages).toEqual([]);
  });

  it('should accept the selected proposal with the resume and proposal ids', async () => {
    const onDocumentChange = vi.fn();
    const document = documentWithProposals();
    const accepted = { ...document, skillProposals: [] };
    mockedAccept.mockResolvedValue(accepted);
    const { result } = renderHook(() => useSkillProposalPopover({ document, onDocumentChange }));

    act(() => {
      result.current.openForSkillProposal(SWAP_ID, { top: 1, left: 2, width: 3, height: 4 });
    });
    await act(async () => {
      await result.current.handleSkillAccept();
    });

    expect(mockedAccept).toHaveBeenCalledWith(document.id, SWAP_ID);
    expect(onDocumentChange).toHaveBeenCalledWith(accepted);
    expect(result.current.selectedSkillProposal).toBeNull();
    expect(result.current.skillAnnouncement).toBe('Alteração aceita.');
  });

  it('should reject the selected proposal with the resume and proposal ids', async () => {
    const onDocumentChange = vi.fn();
    const document = documentWithProposals();
    const rejected = { ...document, skillProposals: [] };
    mockedReject.mockResolvedValue(rejected);
    const { result } = renderHook(() => useSkillProposalPopover({ document, onDocumentChange }));

    act(() => {
      result.current.openForSkillProposal(ADDITION_ID, { top: 1, left: 2, width: 3, height: 4 });
    });
    await act(async () => {
      await result.current.handleSkillReject();
    });

    expect(mockedReject).toHaveBeenCalledWith(document.id, ADDITION_ID);
    expect(onDocumentChange).toHaveBeenCalledWith(rejected);
    expect(result.current.selectedSkillProposal).toBeNull();
    expect(result.current.skillAnnouncement).toBe('Alteração rejeitada.');
  });

  it('should surface the shared error message when accepting fails', async () => {
    mockedAccept.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useSkillProposalPopover({ document: documentWithProposals(), onDocumentChange: vi.fn() }),
    );

    act(() => {
      result.current.openForSkillProposal(SWAP_ID, { top: 0, left: 0, width: 1, height: 1 });
    });
    await act(async () => {
      await result.current.handleSkillAccept();
    });

    expect(result.current.skillError).toBe('Não foi possível salvar a decisão. Tente de novo.');
  });
});
