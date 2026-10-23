import { describe, expect, it } from 'vitest';
import type {
  AdaptationChanges,
  AdaptationReviewResponse,
  ResumeSectionResponse,
} from 'schema/contracts/resume';
import { computeChangeHighlights, findHighlightBullet } from './change-highlights';

const EVIDENCE_ADDED_ONE = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ADDED_TWO = '22222222-2222-4222-8222-222222222222';
const EVIDENCE_REMOVED_ONE = '33333333-3333-4333-8333-333333333333';
const EVIDENCE_OTHER = '44444444-4444-4444-8444-444444444444';
const BULLET_ONE = '55555555-5555-4555-8555-555555555555';
const BULLET_TWO = '66666666-6666-4666-8666-666666666666';
const BULLET_OTHER = '77777777-7777-4777-8777-777777777777';

function sectionsFixture(): ResumeSectionResponse[] {
  return [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      kind: 'experience',
      title: null,
      ordinal: 1,
      entries: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ordinal: 1,
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
              id: BULLET_TWO,
              ordinal: 1,
              text: 'Second added bullet.',
              evidenceId: EVIDENCE_ADDED_TWO,
              status: 'assumed',
              suggestionQuestion: null,
              requirementId: null,
              gapKind: null,
              needsReview: false,
              editedByPerson: false,
            },
            {
              id: BULLET_ONE,
              ordinal: 0,
              text: 'First added bullet.',
              evidenceId: EVIDENCE_ADDED_ONE,
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
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      kind: 'summary',
      title: null,
      ordinal: 0,
      entries: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          ordinal: 0,
          experienceId: null,
          educationEntryId: null,
          heading: null,
          company: null,
          role: null,
          institution: null,
          degree: null,
          period: null,
          bullets: [
            {
              id: BULLET_OTHER,
              ordinal: 0,
              text: 'Unrelated bullet.',
              evidenceId: EVIDENCE_OTHER,
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
  ];
}

function changesFixture(): AdaptationChanges {
  return {
    addedEvidences: [
      { id: EVIDENCE_ADDED_ONE, statement: 'First added.' },
      { id: EVIDENCE_ADDED_TWO, statement: 'Second added.' },
    ],
    removedEvidences: [{ id: EVIDENCE_REMOVED_ONE, statement: 'Removed one.' }],
  };
}

describe('computeChangeHighlights', () => {
  it('should highlight bullets whose evidence was added and keep the reading order', () => {
    const result = computeChangeHighlights({
      sections: sectionsFixture(),
      adaptationChanges: changesFixture(),
      adaptationReview: {},
    });

    expect(result.highlightedBulletIds).toEqual([BULLET_ONE, BULLET_TWO]);
  });

  it('should ignore bullets whose evidence was not added', () => {
    const result = computeChangeHighlights({
      sections: sectionsFixture(),
      adaptationChanges: changesFixture(),
      adaptationReview: {},
    });

    expect(result.highlightedBulletIds).not.toContain(BULLET_OTHER);
  });

  it('should drop accepted and rejected additions from the highlights', () => {
    const review: AdaptationReviewResponse = {
      [EVIDENCE_ADDED_ONE]: 'accepted',
      [EVIDENCE_ADDED_TWO]: 'rejected',
    };
    const result = computeChangeHighlights({
      sections: sectionsFixture(),
      adaptationChanges: changesFixture(),
      adaptationReview: review,
    });

    expect(result.highlightedBulletIds).toEqual([]);
  });

  it('should keep one addition highlighted while the other is decided', () => {
    const result = computeChangeHighlights({
      sections: sectionsFixture(),
      adaptationChanges: changesFixture(),
      adaptationReview: { [EVIDENCE_ADDED_ONE]: 'accepted' },
    });

    expect(result.highlightedBulletIds).toEqual([BULLET_TWO]);
  });

  it('should return no highlights when the changes are null', () => {
    const result = computeChangeHighlights({
      sections: sectionsFixture(),
      adaptationChanges: null,
      adaptationReview: {},
    });

    expect(result.highlightedBulletIds).toEqual([]);
    expect(result.pendingRemoved).toEqual([]);
  });

  it('should list removed evidences until they are restored', () => {
    const pending = computeChangeHighlights({
      sections: sectionsFixture(),
      adaptationChanges: changesFixture(),
      adaptationReview: {},
    });
    const restored = computeChangeHighlights({
      sections: sectionsFixture(),
      adaptationChanges: changesFixture(),
      adaptationReview: { [EVIDENCE_REMOVED_ONE]: 'restored' },
    });

    expect(pending.pendingRemoved.map((item) => item.id)).toEqual([EVIDENCE_REMOVED_ONE]);
    expect(restored.pendingRemoved).toEqual([]);
  });
});

describe('findHighlightBullet', () => {
  it('should return the evidence and text for a known bullet', () => {
    const found = findHighlightBullet(sectionsFixture(), BULLET_ONE);

    expect(found).toEqual({ bulletId: BULLET_ONE, evidenceId: EVIDENCE_ADDED_ONE, text: 'First added bullet.' });
  });

  it('should return null for an unknown bullet', () => {
    expect(findHighlightBullet(sectionsFixture(), '99999999-9999-4999-8999-999999999999')).toBeNull();
  });
});
