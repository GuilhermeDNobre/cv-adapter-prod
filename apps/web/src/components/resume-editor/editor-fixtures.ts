import type {
  ResumeBulletResponse,
  ResumeDocumentResponse,
  ResumeEntryResponse,
  ResumeSectionResponse,
  SectionCommentResponse,
} from 'schema/contracts/resume';

export const RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
export const SECTION_EXPERIENCE_ID = '22222222-2222-4222-8222-222222222222';
export const SECTION_SUMMARY_ID = '11111111-1111-4111-8111-111111111111';
export const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
export const BULLET_ASSUMED_ID = '44444444-4444-4444-8444-444444444444';
export const BULLET_REVIEW_ID = '55555555-5555-4555-8555-555555555555';
export const BULLET_SUGGESTION_ID = '66666666-6666-4666-8666-666666666666';
export const COMMENT_ID = '77777777-7777-4777-8777-777777777777';
export const EVIDENCE_ID = '88888888-8888-4888-8888-888888888888';
export const EXPERIENCE_REF_ID = '99999999-9999-4999-8999-999999999999';
export const REQUIREMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export function assumedBulletFixture(): ResumeBulletResponse {
  return {
    id: BULLET_ASSUMED_ID,
    ordinal: 0,
    text: 'Cut API latency by 30% with caching.',
    evidenceId: EVIDENCE_ID,
    status: 'assumed',
    suggestionQuestion: null,
    requirementId: null,
    gapKind: null,
    needsReview: false,
    editedByPerson: false,
  };
}

export function reviewBulletFixture(): ResumeBulletResponse {
  return {
    id: BULLET_REVIEW_ID,
    ordinal: 1,
    text: 'Led a team of 20 engineers.',
    evidenceId: EVIDENCE_ID,
    status: 'assumed',
    suggestionQuestion: null,
    requirementId: null,
    gapKind: null,
    needsReview: true,
    editedByPerson: false,
  };
}

export function suggestionBulletFixture(): ResumeBulletResponse {
  return {
    id: BULLET_SUGGESTION_ID,
    ordinal: 2,
    text: 'Operated Kubernetes clusters in production.',
    evidenceId: null,
    status: 'suggestion',
    suggestionQuestion: 'Have you operated Kubernetes in production?',
    requirementId: REQUIREMENT_ID,
    gapKind: 'existence',
    needsReview: false,
    editedByPerson: false,
  };
}

export function experienceEntryFixture(
  bullets: readonly ResumeBulletResponse[] = [assumedBulletFixture()],
): ResumeEntryResponse {
  return {
    id: ENTRY_ID,
    ordinal: 0,
    experienceId: EXPERIENCE_REF_ID,
    educationEntryId: null,
    heading: null,
    company: 'Acme',
    role: 'Engineer',
    institution: null,
    degree: null,
    period: '2020-01-01 – 2023-01-01',
    bullets: [...bullets],
  };
}

export function openCommentFixture(): SectionCommentResponse {
  return {
    id: COMMENT_ID,
    text: 'Make it shorter.',
    resolvedAt: null,
    createdAt: '2026-09-05T10:00:00.000Z',
  };
}

export function experienceSectionFixture(): ResumeSectionResponse {
  return {
    id: SECTION_EXPERIENCE_ID,
    kind: 'experience',
    title: null,
    ordinal: 1,
    entries: [experienceEntryFixture([assumedBulletFixture(), reviewBulletFixture()])],
    comments: [openCommentFixture()],
  };
}

export function summarySectionFixture(): ResumeSectionResponse {
  return {
    id: SECTION_SUMMARY_ID,
    kind: 'summary',
    title: null,
    ordinal: 0,
    entries: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ordinal: 0,
        experienceId: null,
        educationEntryId: null,
        heading: null,
        company: null,
        role: null,
        institution: null,
        degree: null,
        period: null,
        bullets: [suggestionBulletFixture()],
      },
    ],
    comments: [],
  };
}

export interface DocumentOverrides {
  readonly kind?: ResumeDocumentResponse['kind'];
  readonly generationStatus?: ResumeDocumentResponse['generationStatus'];
  readonly failureReason?: ResumeDocumentResponse['failureReason'];
  readonly languageFallback?: boolean;
  readonly matchScore?: number | null;
  readonly sections?: readonly ResumeSectionResponse[];
  readonly requirementCoverages?: ResumeDocumentResponse['requirementCoverages'];
}

export function resumeDocumentFixture(overrides: DocumentOverrides = {}): ResumeDocumentResponse {
  return {
    id: RESUME_ID,
    kind: overrides.kind ?? 'tailored',
    name: 'Backend focus',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: null,
    jobDescriptionId: null,
    generationStatus: overrides.generationStatus ?? 'ready',
    failureReason: overrides.failureReason ?? null,
    adaptationPlan: null,
    adaptationChanges: null,
    adaptationReview: {},
    languageFallback: overrides.languageFallback ?? false,
    matchScore: overrides.matchScore ?? 80,
    contact: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+55 11 90000-0000',
      links: [{ title: 'GitHub', url: 'github.com/ada' }],
    },
    sections: [...(overrides.sections ?? [summarySectionFixture(), experienceSectionFixture()])],
    requirementCoverages:
      overrides.requirementCoverages ??
      ([
        {
          requirementId: REQUIREMENT_ID,
          literalTerm: 'Kubernetes',
          coverage: 'gap',
          bulletId: null,
        },
        {
          requirementId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          literalTerm: 'TypeScript',
          coverage: 'covered',
          bulletId: BULLET_ASSUMED_ID,
        },
      ] as ResumeDocumentResponse['requirementCoverages']),
    skillProposals: [],
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}
