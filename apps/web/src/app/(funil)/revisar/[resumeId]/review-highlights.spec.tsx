import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ReviewHighlights } from './review-highlights';
import { resumeDocumentFixture } from '../../../../components/resume-editor/editor-fixtures';
import { acceptSkillProposal, rejectSkillProposal } from '../../../../lib/api-client';

vi.mock('../../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api-client')>();
  return { ...actual, acceptSkillProposal: vi.fn(), rejectSkillProposal: vi.fn() };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const mockedAcceptSkill = vi.mocked(acceptSkillProposal);
const mockedRejectSkill = vi.mocked(rejectSkillProposal);

const EVIDENCE_ONE = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_TWO = '22222222-2222-4222-8222-222222222222';
const BULLET_ONE = '55555555-5555-4555-8555-555555555555';
const BULLET_TWO = '66666666-6666-4666-8666-666666666666';

function twoChangesInSameJob(): ReturnType<typeof resumeDocumentFixture> {
  const base = resumeDocumentFixture({
    sections: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'experience',
        title: null,
        ordinal: 0,
        entries: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            ordinal: 0,
            experienceId: null,
            educationEntryId: null,
            heading: null,
            company: 'Acme',
            role: 'Engineer',
            institution: null,
            degree: null,
            period: '2020-2024',
            bullets: [
              {
                id: BULLET_ONE,
                ordinal: 0,
                text: 'First added bullet for review.',
                evidenceId: EVIDENCE_ONE,
                status: 'assumed',
                suggestionQuestion: null,
                requirementId: null,
                gapKind: null,
                needsReview: false,
                editedByPerson: false,
              },
              {
                id: BULLET_TWO,
                ordinal: 1,
                text: 'Second added bullet for review.',
                evidenceId: EVIDENCE_TWO,
                status: 'assumed',
                suggestionQuestion: null,
                requirementId: null,
                gapKind: null,
                needsReview: false,
                editedByPerson: false,
              },
            ],
          },
        ],
        comments: [],
      },
    ],
    requirementCoverages: [],
  });
  return {
    ...base,
    adaptationChanges: {
      addedEvidences: [
        { id: EVIDENCE_ONE, statement: 'First added one.' },
        { id: EVIDENCE_TWO, statement: 'Second added one.' },
      ],
      removedEvidences: [],
    },
    adaptationReview: {},
  };
}

describe('ReviewHighlights change items', () => {
  it('should label two changes in the same job with the start of each bullet', () => {
    render(
      <ReviewHighlights
        document={twoChangesInSameJob()}
        onDocumentChange={vi.fn()}
        onSectionSelect={vi.fn()}
      />,
    );

    const first = screen.getByRole('button', { name: /First added bullet/ });
    const second = screen.getByRole('button', { name: /Second added bullet/ });
    expect(first).toBeInTheDocument();
    expect(second).toBeInTheDocument();
    expect(first.getAttribute('title')).toBe('Professional Experience · Acme');
    expect(second.getAttribute('title')).toBe('Professional Experience · Acme');
    const bar = screen.getByRole('region', { name: 'Barra de revisão' });
    expect(
      within(bar).getAllByRole('button', {
        name: /Pendente/,
      }),
    ).toHaveLength(2);
  });
});

const SWAP_PROPOSAL_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const ADDITION_PROPOSAL_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const SKILL_REQUIREMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function documentWithSkillProposals() {
  const base = resumeDocumentFixture();
  return {
    ...base,
    skillProposals: [
      {
        id: SWAP_PROPOSAL_ID,
        kind: 'swap' as const,
        name: 'Fastify',
        group: 'Back-end',
        replacesSkillId: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
        replacesSkillName: 'NestJS',
        requirementId: SKILL_REQUIREMENT_ID,
        literalTerm: 'Fastify',
        status: 'pending' as const,
        ordinal: 0,
      },
      {
        id: ADDITION_PROPOSAL_ID,
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

function frameSource(): { fakeSource: object; frame: HTMLIFrameElement } {
  const frame = screen.getByTitle('Pré-visualização do currículo');
  if (!(frame instanceof HTMLIFrameElement)) throw new Error('Expected the preview frame');
  const fakeSource = { postMessage: vi.fn() };
  Object.defineProperty(frame, 'contentWindow', { value: fakeSource, configurable: true });
  return { fakeSource, frame };
}

async function openSkillProposal(proposalId: string): Promise<void> {
  const { fakeSource } = frameSource();
  await act(async () => {
    const event = new MessageEvent('message', {
      data: {
        source: 'resume-preview',
        type: 'change-rect',
        bulletId: '',
        skillProposalId: proposalId,
        rect: { top: 10, left: 20, width: 100, height: 30 },
      },
    });
    Object.defineProperty(event, 'source', { value: fakeSource });
    window.dispatchEvent(event);
  });
}

describe('ReviewHighlights skill proposals', () => {
  afterEach(() => {
    mockedAcceptSkill.mockReset();
    mockedRejectSkill.mockReset();
  });

  it('should open the popover with the new name, the original skill and the requirement coverage for a swap', async () => {
    render(
      <ReviewHighlights
        document={documentWithSkillProposals()}
        onDocumentChange={vi.fn()}
        onSectionSelect={vi.fn()}
      />,
    );

    await openSkillProposal(SWAP_PROPOSAL_ID);

    const fastifyOccurrences = await screen.findAllByText('Fastify');
    expect(fastifyOccurrences.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('NestJS')).toBeInTheDocument();
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Requirements cobertos')).toBeInTheDocument();
  });

  it('should accept a swap proposal with the resume and proposal ids', async () => {
    const document = documentWithSkillProposals();
    const accepted = { ...document, skillProposals: [] };
    mockedAcceptSkill.mockResolvedValue(accepted);
    const onDocumentChange = vi.fn();
    render(
      <ReviewHighlights
        document={document}
        onDocumentChange={onDocumentChange}
        onSectionSelect={vi.fn()}
      />,
    );

    await openSkillProposal(SWAP_PROPOSAL_ID);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Aceitar' }));
    });

    expect(mockedAcceptSkill).toHaveBeenCalledWith(document.id, SWAP_PROPOSAL_ID);
    expect(onDocumentChange).toHaveBeenCalledWith(accepted);
  });

  it('should reject a swap proposal with the resume and proposal ids', async () => {
    const document = documentWithSkillProposals();
    const rejected = { ...document, skillProposals: [] };
    mockedRejectSkill.mockResolvedValue(rejected);
    const onDocumentChange = vi.fn();
    render(
      <ReviewHighlights
        document={document}
        onDocumentChange={onDocumentChange}
        onSectionSelect={vi.fn()}
      />,
    );

    await openSkillProposal(SWAP_PROPOSAL_ID);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Rejeitar' }));
    });

    expect(mockedRejectSkill).toHaveBeenCalledWith(document.id, SWAP_PROPOSAL_ID);
    expect(onDocumentChange).toHaveBeenCalledWith(rejected);
  });

  it('should show no before text for an addition', async () => {
    render(
      <ReviewHighlights
        document={documentWithSkillProposals()}
        onDocumentChange={vi.fn()}
        onSectionSelect={vi.fn()}
      />,
    );

    await openSkillProposal(ADDITION_PROPOSAL_ID);

    expect(await screen.findByText('Docker')).toBeInTheDocument();
    expect(screen.queryByText('Antes')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum Requirement coberto.')).toBeInTheDocument();
  });
});
