import { describe, expect, it } from 'vitest';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import { toPreviewDocument } from './to-preview-document';

const SECTION_SUMMARY_ID = '11111111-1111-4111-8111-111111111111';
const SECTION_EXPERIENCE_ID = '22222222-2222-4222-8222-222222222222';

function documentFixture(): ResumeDocumentResponse {
  return {
    id: '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01',
    kind: 'tailored',
    name: 'Backend focus',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: null,
    jobDescriptionId: null,
    generationStatus: 'ready',
    failureReason: null,
    adaptationPlan: null,
    adaptationChanges: null,
    adaptationReview: {},
    languageFallback: false,
    matchScore: 80,
    contact: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+55 11 90000-0000',
      city: 'Quixadá, CE',
      links: [{ title: 'GitHub', url: 'github.com/ada' }],
    },
    sections: [
      {
        id: SECTION_EXPERIENCE_ID,
        kind: 'experience',
        title: null,
        ordinal: 1,
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
            period: '2020-01-01 – 2023-01-01',
            bullets: [
              {
                id: '44444444-4444-4444-8444-444444444444',
                ordinal: 1,
                text: 'Second bullet.',
                evidenceId: null,
                status: 'assumed',
                suggestionQuestion: null,
                requirementId: null,
                gapKind: null,
                needsReview: false,
                editedByPerson: false,
              },
              {
                id: '55555555-5555-4555-8555-555555555555',
                ordinal: 0,
                text: 'First bullet.',
                evidenceId: null,
                status: 'assumed',
                suggestionQuestion: null,
                requirementId: null,
                gapKind: null,
                needsReview: false,
                editedByPerson: false,
              },
              {
                id: '66666666-6666-4666-8666-666666666666',
                ordinal: 2,
                text: 'Maybe Kubernetes.',
                evidenceId: null,
                status: 'suggestion',
                suggestionQuestion: 'Do you know Kubernetes?',
                requirementId: null,
                gapKind: 'existence',
                needsReview: false,
                editedByPerson: false,
              },
            ],
          },
        ],
        comments: [],
      },
      {
        id: SECTION_SUMMARY_ID,
        kind: 'summary',
        title: null,
        ordinal: 0,
        entries: [
          {
            id: '77777777-7777-4777-8777-777777777777',
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
                id: '88888888-8888-4888-8888-888888888888',
                ordinal: 0,
                text: 'Backend engineer.',
                evidenceId: null,
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
    skillProposals: [],
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

describe('toPreviewDocument', () => {
  it('should use the profile contact instead of the resume name and order sections by ordinal', () => {
    const document = documentFixture();
    const preview = toPreviewDocument(document);

    expect(preview.contact).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+55 11 90000-0000',
      city: 'Quixadá, CE',
      links: [{ title: 'GitHub', url: 'github.com/ada' }],
    });
    expect(preview.contact.name).not.toBe(document.name);
    expect(preview.sections.map((section) => section.id)).toEqual([
      SECTION_SUMMARY_ID,
      SECTION_EXPERIENCE_ID,
    ]);
  });

  it('should pass company, role and period of each entry to the renderable resume', () => {
    const preview = toPreviewDocument(documentFixture());
    const experience = preview.sections.find((section) => section.id === SECTION_EXPERIENCE_ID);
    const entry = experience?.entries[0];

    expect(entry?.company).toBe('Acme');
    expect(entry?.role).toBe('Engineer');
    expect(entry?.period).toBe('2020-01-01 – 2023-01-01');
  });

  it('should order bullets by ordinal and keep suggestions for the template to filter', () => {
    const preview = toPreviewDocument(documentFixture());
    const experience = preview.sections.find((section) => section.id === SECTION_EXPERIENCE_ID);
    const bullets = experience?.entries[0]?.bullets ?? [];

    expect(bullets.map((bullet) => bullet.text)).toEqual([
      'First bullet.',
      'Second bullet.',
      'Maybe Kubernetes.',
    ]);
    expect(bullets[2]?.status).toBe('suggestion');
  });

  it('should mark only the highlighted bullets as added changes', () => {
    const preview = toPreviewDocument(documentFixture(), [
      '55555555-5555-4555-8555-555555555555',
    ]);
    const experience = preview.sections.find((section) => section.id === SECTION_EXPERIENCE_ID);
    const bullets = experience?.entries[0]?.bullets ?? [];

    expect(bullets[0]?.change).toBe('added');
    expect(bullets[0]?.id).toBe('55555555-5555-4555-8555-555555555555');
    expect(bullets[1]?.change).toBeUndefined();
    expect(bullets[2]?.change).toBeUndefined();
  });

  it('should keep bullet ids for the interactive template', () => {
    const preview = toPreviewDocument(documentFixture());
    const experience = preview.sections.find((section) => section.id === SECTION_EXPERIENCE_ID);
    const bullets = experience?.entries[0]?.bullets ?? [];

    expect(bullets.map((bullet) => bullet.id)).toEqual([
      '55555555-5555-4555-8555-555555555555',
      '44444444-4444-4444-8444-444444444444',
      '66666666-6666-4666-8666-666666666666',
    ]);
  });

  it('should pass titled links to the preview', () => {
    const preview = toPreviewDocument(documentFixture());

    expect(preview.contact.links).toEqual([{ title: 'GitHub', url: 'github.com/ada' }]);
  });

  it('should pass skills entries with their group headings to the preview', () => {
    const document = {
      ...documentFixture(),
      sections: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          kind: 'skills',
          title: null,
          ordinal: 0,
          entries: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
              ordinal: 0,
              experienceId: null,
              educationEntryId: null,
              heading: 'Frontend',
              company: null,
              role: null,
              institution: null,
              degree: null,
              period: null,
              bullets: [
                {
                  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  ordinal: 0,
                  text: 'TypeScript',
                  evidenceId: null,
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
    } as unknown as ResumeDocumentResponse;
    const preview = toPreviewDocument(document);
    const skills = preview.sections.find((section) => section.kind === 'skills');

    expect(skills?.entries[0]?.heading).toBe('Frontend');
    expect(skills?.entries[0]?.bullets.map((bullet) => bullet.text)).toEqual(['TypeScript']);
  });

  it('should pass the city to the preview without a city losing the other contact fields', () => {
    const withoutCity = {
      ...documentFixture(),
      contact: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+55 11 90000-0000',
        city: null,
      links: [{ title: 'GitHub', url: 'github.com/ada' }],
      },
    };
    const preview = toPreviewDocument(withoutCity);

    expect(preview.contact.city).toBeUndefined();
    expect(preview.contact.email).toBe('ada@example.com');
  });
});
