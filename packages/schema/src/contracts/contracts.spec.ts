import { describe, expect, it } from 'vitest';
import { aiErrorCodeSchema } from './ai-error';
import { careerProfileResponseSchema } from './career-profile';
import { dataErasureRequestSchema } from './data-erasure';
import { evaluationResponseSchema } from './evaluation';
import {
  contactDetailsDraftSchema,
  resumeImportDraftSchema,
  sectionOrderSchema,
  writingStyleSchema,
} from './resume-import';
import {
  adaptationReviewRecordSchema,
  adaptationReviewRequestSchema,
  adaptationReviewResponseSchema,
  adaptationReviewUndoRequestSchema,
  addCustomItemRequestSchema,
  createBaseResumeRequestSchema,
  createResumeSectionRequestSchema,
  createSectionCommentRequestSchema,
  createTailoredResumeRequestSchema,
  exportResumeResponseSchema,
  moveBulletRequestSchema,
  resumeContactResponseSchema,
  resumeDocumentResponseSchema,
  resumeIdSchema,
  resumeListResponseSchema,
  sectionRewriteRequestSchema,
  skillProposalResponseSchema,
  updateBulletRequestSchema,
  updateEvidenceRequestSchema,
  updateExperienceRequestSchema,
  updateResumeSettingsRequestSchema,
  updateResumeStructureRequestSchema,
} from './resume';
import {
  deepSeekBalanceSchema,
  deepSeekKeyStatusSchema,
  saveDeepSeekKeyRequestSchema,
} from './settings';

describe('aiErrorCodeSchema', () => {
  it('should accept the AI error codes', () => {
    // Arrange
    const codes = ['ai_key_missing', 'ai_key_rejected', 'ai_balance_exhausted', 'ai_unavailable', 'nothing_to_rewrite', 'rewrite_claims_rejected'];

    // Act
    const results = codes.map((code) => aiErrorCodeSchema.safeParse(code));

    // Assert
    for (const result of results) {
      expect(result.success).toBe(true);
    }
  });

  it('should reject any other code', () => {
    // Arrange
    const code = 'ai_unknown';

    // Act
    const result = aiErrorCodeSchema.safeParse(code);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('saveDeepSeekKeyRequestSchema', () => {
  it('should reject empty text', () => {
    // Arrange
    const body = { apiKey: '' };

    // Act
    const result = saveDeepSeekKeyRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject text above 200 characters', () => {
    // Arrange
    const body = { apiKey: 'a'.repeat(201) };

    // Act
    const result = saveDeepSeekKeyRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should trim surrounding spaces', () => {
    // Arrange
    const body = { apiKey: '  sk-key  ' };

    // Act
    const result = saveDeepSeekKeyRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiKey).toBe('sk-key');
    }
  });
});

describe('deepSeekKeyStatusSchema', () => {
  it('should accept null lastFour', () => {
    // Arrange
    const status = { configured: false, lastFour: null };

    // Act
    const result = deepSeekKeyStatusSchema.safeParse(status);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject lastFour with a length other than 4', () => {
    // Arrange
    const status = { configured: true, lastFour: 'abc' };

    // Act
    const result = deepSeekKeyStatusSchema.safeParse(status);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('deepSeekBalanceSchema', () => {
  it('should accept a balance list with currency and totalBalance as text', () => {
    // Arrange
    const balance = {
      isAvailable: true,
      balances: [{ currency: 'CNY', totalBalance: '10.50' }],
    };

    // Act
    const result = deepSeekBalanceSchema.safeParse(balance);

    // Assert
    expect(result.success).toBe(true);
  });
});

describe('dataErasureRequestSchema', () => {
  it('should reject an unknown scope', () => {
    // Arrange
    const body = { scope: 'unknown_scope' };

    // Act
    const result = dataErasureRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should accept the resumes scope', () => {
    // Arrange
    const body = { scope: 'resumes' };

    // Act
    const result = dataErasureRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });
});

describe('evaluationResponseSchema failureReason', () => {
  it('should accept a null failureReason', () => {
    // Arrange
    const response = {
      id: '00000000-0000-0000-0000-000000000001',
      status: 'ready',
      matchScore: 80,
      failureReason: null,
      resumeId: null,
      requirementCoverages: [],
      createdAt: '2026-09-17T00:00:00.000Z',
      updatedAt: '2026-09-17T00:00:00.000Z',
    };

    // Act
    const result = evaluationResponseSchema.safeParse(response);

    // Assert
    expect(result.success).toBe(true);
  });
});

describe('resumeIdSchema', () => {
  it('should accept a uuid', () => {
    // Arrange
    const id = '00000000-0000-0000-0000-000000000001';

    // Act
    const result = resumeIdSchema.safeParse(id);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject a non-uuid', () => {
    // Arrange
    const id = 'not-a-uuid';

    // Act
    const result = resumeIdSchema.safeParse(id);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('createBaseResumeRequestSchema', () => {
  it('should accept a name with optional settings', () => {
    // Arrange
    const body = { name: 'Backend focus', language: 'pt', template: 'comfortable' };

    // Act
    const result = createBaseResumeRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an empty name', () => {
    // Arrange
    const body = { name: '   ' };

    // Act
    const result = createBaseResumeRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject an invalid language enum', () => {
    // Arrange
    const body = { name: 'Backend', language: 'fr' };

    // Act
    const result = createBaseResumeRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('createTailoredResumeRequestSchema', () => {
  it('should accept base and job ids', () => {
    // Arrange
    const body = {
      baseResumeId: '00000000-0000-0000-0000-000000000001',
      jobDescriptionId: '00000000-0000-0000-0000-000000000002',
    };

    // Act
    const result = createTailoredResumeRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject a non-uuid base id', () => {
    // Arrange
    const body = {
      baseResumeId: 'nope',
      jobDescriptionId: '00000000-0000-0000-0000-000000000002',
    };

    // Act
    const result = createTailoredResumeRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('updateResumeSettingsRequestSchema', () => {
  it('should accept a tone change', () => {
    // Arrange
    const body = { tone: 'technical' };

    // Act
    const result = updateResumeSettingsRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an empty object', () => {
    // Arrange
    const body = {};

    // Act
    const result = updateResumeSettingsRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject an invalid template enum', () => {
    // Arrange
    const body = { template: 'fancy' };

    // Act
    const result = updateResumeSettingsRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('updateResumeStructureRequestSchema', () => {
  it('should accept an ordered section list', () => {
    // Arrange
    const body = {
      sections: [{ id: '00000000-0000-0000-0000-000000000001', ordinal: 0 }],
    };

    // Act
    const result = updateResumeStructureRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an empty section list', () => {
    // Arrange
    const body = { sections: [] };

    // Act
    const result = updateResumeStructureRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('createResumeSectionRequestSchema', () => {
  it('should accept a custom section with title', () => {
    // Arrange
    const body = { kind: 'custom', title: 'Publications', ordinal: 2 };

    // Act
    const result = createResumeSectionRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an invalid section kind', () => {
    // Arrange
    const body = { kind: 'header', ordinal: 0 };

    // Act
    const result = createResumeSectionRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('updateBulletRequestSchema', () => {
  it('should accept edited text', () => {
    // Arrange
    const body = { text: 'Led a team of five engineers' };

    // Act
    const result = updateBulletRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject empty text', () => {
    // Arrange
    const body = { text: '   ' };

    // Act
    const result = updateBulletRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('createSectionCommentRequestSchema', () => {
  it('should accept comment text', () => {
    // Arrange
    const body = { text: 'Shorter, highlight leadership' };

    // Act
    const result = createSectionCommentRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject empty text', () => {
    // Arrange
    const body = { text: '' };

    // Act
    const result = createSectionCommentRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('sectionRewriteRequestSchema', () => {
  it('should accept a trimmed instruction', () => {
    // Arrange
    const body = { instruction: '  Highlight Git and Docker.  ' };

    // Act
    const result = sectionRewriteRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.instruction).toBe('Highlight Git and Docker.');
    }
  });

  it('should reject an empty instruction', () => {
    // Arrange
    const body = { instruction: '   ' };

    // Act
    const result = sectionRewriteRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject an instruction above 500 characters', () => {
    // Arrange
    const body = { instruction: 'a'.repeat(501) };

    // Act
    const result = sectionRewriteRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject a missing instruction', () => {
    // Arrange
    const body = {};

    // Act
    const result = sectionRewriteRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('updateEvidenceRequestSchema', () => {
  it('should accept a corrected statement', () => {
    // Arrange
    const body = { statement: 'Left in 2023, not 2022' };

    // Act
    const result = updateEvidenceRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an empty statement', () => {
    // Arrange
    const body = { statement: '  ' };

    // Act
    const result = updateEvidenceRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('updateExperienceRequestSchema', () => {
  it('should accept a role correction', () => {
    // Arrange
    const body = { role: 'Senior Engineer' };

    // Act
    const result = updateExperienceRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an empty object', () => {
    // Arrange
    const body = {};

    // Act
    const result = updateExperienceRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject an empty company', () => {
    // Arrange
    const body = { company: '' };

    // Act
    const result = updateExperienceRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('exportResumeResponseSchema', () => {
  it('should accept an export result', () => {
    // Arrange
    const body = {
      exportId: '00000000-0000-0000-0000-000000000001',
      pageCount: 2,
      exceedsLengthTarget: false,
    };

    // Act
    const result = exportResumeResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject a non-positive page count', () => {
    // Arrange
    const body = {
      exportId: '00000000-0000-0000-0000-000000000001',
      pageCount: 0,
      exceedsLengthTarget: true,
    };

    // Act
    const result = exportResumeResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('resumeListResponseSchema', () => {
  it('should accept resumes with exports', () => {
    // Arrange
    const body = {
      resumes: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          kind: 'base',
          name: 'Backend focus',
          language: 'pt',
          template: 'comfortable',
          lengthTarget: 2,
          writingMethod: 'xyz',
          tone: 'direct',
          baseResumeId: null,
          jobDescriptionId: null,
          jobTitle: null,
          generationStatus: 'ready',
          failureReason: null,
          createdAt: '2026-09-18T00:00:00.000Z',
          updatedAt: '2026-09-18T00:00:00.000Z',
          exports: [
            {
              id: '00000000-0000-0000-0000-000000000002',
              pageCount: 1,
              createdAt: '2026-09-18T00:00:00.000Z',
            },
          ],
        },
      ],
    };

    // Act
    const result = resumeListResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should accept a tailored resume with a job title', () => {
    // Arrange
    const body = {
      resumes: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          kind: 'tailored',
          name: 'Backend focus — Senior Full Stack Developer',
          language: 'en',
          template: 'comfortable',
          lengthTarget: 2,
          writingMethod: 'xyz',
          tone: 'direct',
          baseResumeId: '00000000-0000-0000-0000-000000000002',
          jobDescriptionId: '00000000-0000-0000-0000-000000000003',
          jobTitle: 'Senior Full Stack Developer',
          generationStatus: 'ready',
          failureReason: null,
          createdAt: '2026-09-18T00:00:00.000Z',
          updatedAt: '2026-09-18T00:00:00.000Z',
          exports: [],
        },
      ],
    };

    // Act
    const result = resumeListResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an invalid resume kind', () => {
    // Arrange
    const body = {
      resumes: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          kind: 'original',
          name: 'Backend focus',
          language: 'pt',
          template: 'comfortable',
          lengthTarget: 2,
          writingMethod: 'xyz',
          tone: 'direct',
          baseResumeId: null,
          jobDescriptionId: null,
          jobTitle: null,
          generationStatus: 'ready',
          failureReason: null,
          createdAt: '2026-09-18T00:00:00.000Z',
          updatedAt: '2026-09-18T00:00:00.000Z',
          exports: [],
        },
      ],
    };

    // Act
    const result = resumeListResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('resumeDocumentResponseSchema', () => {
  it('should accept a full document with coverage and languageFallback', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'tailored',
      name: 'Backend at Acme',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'star',
      tone: 'formal',
      baseResumeId: '00000000-0000-0000-0000-000000000002',
      jobDescriptionId: '00000000-0000-0000-0000-000000000003',
      generationStatus: 'ready',
      generationStep: null,
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
          id: '00000000-0000-0000-0000-000000000010',
          kind: 'experience',
          title: null,
          ordinal: 0,
          entries: [
            {
              id: '00000000-0000-0000-0000-000000000020',
              ordinal: 0,
              experienceId: null,
              educationEntryId: null,
              heading: null,
              company: 'Example Corp',
              role: 'Engineer',
              institution: null,
              degree: null,
              period: '2020-2024',
              bullets: [
                {
                  id: '00000000-0000-0000-0000-000000000030',
                  ordinal: 0,
                  text: 'Led a team',
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
          comments: [
            {
              id: '00000000-0000-0000-0000-000000000040',
              text: 'Shorter',
              resolvedAt: null,
              createdAt: '2026-09-18T00:00:00.000Z',
            },
          ],
        },
      ],
      requirementCoverages: [
        {
          requirementId: '00000000-0000-0000-0000-000000000050',
          literalTerm: 'PostgreSQL',
          coverage: 'covered',
          bulletId: '00000000-0000-0000-0000-000000000030',
        },
      ],
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };

    // Act
    const result = resumeDocumentResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should accept titled and untitled contact links but reject bare strings', () => {
    // Arrange
    const contact = {
      name: 'Ada Lovelace',
      email: null,
      phone: null,
      city: null,
      links: [
        { title: 'LinkedIn', url: 'https://linkedin.com/in/ada' },
        { title: null, url: 'https://example.com/portfolio' },
      ],
    };

    // Act
    const accepted = resumeContactResponseSchema.safeParse(contact);
    const rejected = resumeContactResponseSchema.safeParse({ ...contact, links: ['https://linkedin.com/in/ada'] });

    // Assert
    expect(accepted.success).toBe(true);
    expect(rejected.success).toBe(false);
  });

  it('should reject a suggestion bullet with empty text', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'tailored',
      name: 'Backend at Acme',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'star',
      tone: 'formal',
      baseResumeId: null,
      jobDescriptionId: '00000000-0000-0000-0000-000000000003',
      generationStatus: 'generating',
      generationStep: 'writing',
      failureReason: null,
      adaptationPlan: null,
      adaptationChanges: null,
      adaptationReview: {},
      languageFallback: true,
      matchScore: null,
      contact: {
        name: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: null,
      },
      sections: [
        {
          id: '00000000-0000-0000-0000-000000000010',
          kind: 'experience',
          title: null,
          ordinal: 0,
          entries: [
            {
              id: '00000000-0000-0000-0000-000000000020',
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
                  id: '00000000-0000-0000-0000-000000000030',
                  ordinal: 0,
                  text: '',
                  evidenceId: null,
                  status: 'suggestion',
                  suggestionQuestion: 'Do you have Kubernetes experience?',
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
      ],
      requirementCoverages: [],
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };

    // Act
    const result = resumeDocumentResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject an invalid failure reason', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'base',
      name: 'Backend focus',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 2,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: null,
      generationStatus: 'failed',
      generationStep: null,
      failureReason: 'ai_unknown',
      adaptationPlan: null,
      adaptationChanges: null,
      adaptationReview: {},
      languageFallback: false,
      matchScore: null,
      contact: {
        name: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: null,
      },
      sections: [],
      requirementCoverages: [],
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };

    // Act
    const result = resumeDocumentResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should accept a document with adaptation changes', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'tailored',
      name: 'Backend focus — Senior Developer',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: '00000000-0000-0000-0000-000000000002',
      jobDescriptionId: '00000000-0000-0000-0000-000000000003',
      generationStatus: 'ready',
      generationStep: null,
      failureReason: null,
      adaptationPlan: null,
      adaptationChanges: {
        addedEvidences: [
          {
            id: '00000000-0000-0000-0000-000000000010',
            statement: 'Led Kubernetes migration',
          },
        ],
        removedEvidences: [
          {
            id: '00000000-0000-0000-0000-000000000011',
            statement: 'Shipped checkout flow',
          },
        ],
      },
      adaptationReview: {
        '00000000-0000-0000-0000-000000000010': 'rejected',
      },
      languageFallback: false,
      matchScore: 80,
      contact: {
        name: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: null,
      },
      sections: [],
      requirementCoverages: [],
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };

    // Act
    const result = resumeDocumentResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should accept null and each generation step and reject an unknown step', () => {
    // Arrange
    const base = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'tailored',
      name: 'Backend focus — Senior Developer',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: '00000000-0000-0000-0000-000000000002',
      jobDescriptionId: '00000000-0000-0000-0000-000000000003',
      generationStatus: 'generating',
      failureReason: null,
      adaptationPlan: null,
      adaptationChanges: null,
      adaptationReview: {},
      languageFallback: false,
      matchScore: null,
      contact: {
        name: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: null,
      },
      sections: [],
      requirementCoverages: [],
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };

    // Act
    const accepted = [null, 'planning', 'writing', 'suggesting', 'saving'].map((generationStep) =>
      resumeDocumentResponseSchema.safeParse({ ...base, generationStep }),
    );

    // Assert
    for (const result of accepted) {
      expect(result.success).toBe(true);
    }
    expect(
      resumeDocumentResponseSchema.safeParse({ ...base, generationStep: 'polishing' }).success,
    ).toBe(false);
  });
});

describe('moveBulletRequestSchema', () => {
  it('should accept moving up', () => {
    // Arrange
    const body = { direction: 'up' };

    // Act
    const result = moveBulletRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should accept moving down', () => {
    // Arrange
    const body = { direction: 'down' };

    // Act
    const result = moveBulletRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an unknown direction', () => {
    // Arrange
    const body = { direction: 'sideways' };

    // Act
    const result = moveBulletRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('addCustomItemRequestSchema', () => {
  it('should accept item text', () => {
    // Arrange
    const body = { text: 'Keynote at ATS conference' };

    // Act
    const result = addCustomItemRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject empty text', () => {
    // Arrange
    const body = { text: '   ' };

    // Act
    const result = addCustomItemRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should accept text with createEvidence and entryId', () => {
    // Arrange
    const body = {
      text: 'Shipped checkout flow',
      createEvidence: true,
      entryId: '33333333-3333-4333-8333-333333333333',
    };

    // Act
    const result = addCustomItemRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject a malformed entryId', () => {
    // Arrange
    const body = { text: 'Shipped checkout flow', entryId: 'not-a-uuid' };

    // Act
    const result = addCustomItemRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('adaptationReviewRequestSchema', () => {
  it('should accept a decision for an evidence', () => {
    // Arrange
    const body = {
      evidenceId: '00000000-0000-0000-0000-000000000010',
      decision: 'rejected',
    };

    // Act
    const result = adaptationReviewRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an unknown decision', () => {
    // Arrange
    const body = {
      evidenceId: '00000000-0000-0000-0000-000000000010',
      decision: 'ignored',
    };

    // Act
    const result = adaptationReviewRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject a non-uuid evidence id', () => {
    // Arrange
    const body = { evidenceId: 'nope', decision: 'accepted' };

    // Act
    const result = adaptationReviewRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('adaptationReviewUndoRequestSchema', () => {
  it('should accept an evidence id', () => {
    // Arrange
    const body = { evidenceId: '00000000-0000-0000-0000-000000000010' };

    // Act
    const result = adaptationReviewUndoRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject a non-uuid evidence id', () => {
    // Arrange
    const body = { evidenceId: 'nope' };

    // Act
    const result = adaptationReviewUndoRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('adaptationReviewResponseSchema', () => {
  it('should accept an empty review map', () => {
    // Arrange
    const body = {};

    // Act
    const result = adaptationReviewResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should accept decisions without snapshots', () => {
    // Arrange
    const body = { '00000000-0000-0000-0000-000000000010': 'restored' };

    // Act
    const result = adaptationReviewResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an unknown decision', () => {
    // Arrange
    const body = { '00000000-0000-0000-0000-000000000010': 'ignored' };

    // Act
    const result = adaptationReviewResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('adaptationReviewRecordSchema', () => {
  it('should accept a stored review with snapshots', () => {
    // Arrange
    const body = {
      '00000000-0000-0000-0000-000000000010': {
        decision: 'rejected',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [
          {
            entryId: '00000000-0000-0000-0000-000000000020',
            ordinal: 0,
            text: 'Led a team',
            bulletId: '00000000-0000-0000-0000-000000000030',
          },
        ],
      },
    };

    // Act
    const result = adaptationReviewRecordSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject a snapshot without bullet id', () => {
    // Arrange
    const body = {
      '00000000-0000-0000-0000-000000000010': {
        decision: 'rejected',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [{ entryId: '00000000-0000-0000-0000-000000000020', ordinal: 0, text: 'Led' }],
      },
    };

    // Act
    const result = adaptationReviewRecordSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should accept a snapshot with editedByPerson and needsReview', () => {
    // Arrange
    const body = {
      '00000000-0000-0000-0000-000000000010': {
        decision: 'rejected',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [
          {
            entryId: '00000000-0000-0000-0000-000000000020',
            ordinal: 0,
            text: 'Led a team',
            bulletId: '00000000-0000-0000-0000-000000000030',
            editedByPerson: true,
            needsReview: true,
          },
        ],
      },
    };

    // Act
    const result = adaptationReviewRecordSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data['00000000-0000-0000-0000-000000000010']?.snapshot[0];
      expect(item?.editedByPerson).toBe(true);
      expect(item?.needsReview).toBe(true);
    }
  });

  it('should default missing snapshot flags to false', () => {
    // Arrange
    const body = {
      '00000000-0000-0000-0000-000000000010': {
        decision: 'rejected',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [
          {
            entryId: '00000000-0000-0000-0000-000000000020',
            ordinal: 0,
            text: 'Led a team',
            bulletId: '00000000-0000-0000-0000-000000000030',
          },
        ],
      },
    };

    // Act
    const result = adaptationReviewRecordSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data['00000000-0000-0000-0000-000000000010']?.snapshot[0];
      expect(item?.editedByPerson).toBe(false);
      expect(item?.needsReview).toBe(false);
    }
  });
});

describe('contactDetailsDraftSchema city', () => {
  it('should accept a trimmed city and a null city', () => {
    // Arrange
    const withCity = {
      fullName: 'Ana Souza',
      email: null,
      phone: null,
      city: '  Quixadá, CE  ',
      links: null,
    };
    const withoutCity = {
      fullName: 'Ana Souza',
      email: null,
      phone: null,
      city: null,
      links: null,
    };

    // Act
    const trimmed = contactDetailsDraftSchema.safeParse(withCity);
    const nulled = contactDetailsDraftSchema.safeParse(withoutCity);

    // Assert
    expect(trimmed.success).toBe(true);
    if (trimmed.success) {
      expect(trimmed.data.city).toBe('Quixadá, CE');
    }
    expect(nulled.success).toBe(true);
  });

  it('should reject an empty city', () => {
    // Arrange
    const body = {
      fullName: null,
      email: null,
      phone: null,
      city: '   ',
      links: null,
    };

    // Act
    const result = contactDetailsDraftSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('resumeContactResponseSchema city', () => {
  it('should accept a city and a null city', () => {
    // Arrange
    const withCity = {
      name: 'Ada Lovelace',
      email: null,
      phone: null,
      city: 'Lisboa, Portugal',
      links: null,
    };
    const withoutCity = {
      name: 'Ada Lovelace',
      email: null,
      phone: null,
      city: null,
      links: null,
    };

    // Act
    const withResult = resumeContactResponseSchema.safeParse(withCity);
    const withoutResult = resumeContactResponseSchema.safeParse(withoutCity);

    // Assert
    expect(withResult.success).toBe(true);
    expect(withoutResult.success).toBe(true);
  });
});

describe('contactDetailsDraftSchema links', () => {
  it('should accept links with title and url', () => {
    // Arrange
    const body = {
      fullName: 'Ana Souza',
      email: null,
      phone: null,
      city: null,
      links: [
        { title: 'LinkedIn', url: 'https://linkedin.com/in/ana' },
        { title: null, url: 'https://github.com/ana' },
      ],
    };

    // Act
    const result = contactDetailsDraftSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject the old string links format', () => {
    // Arrange
    const body = {
      fullName: 'Ana Souza',
      email: null,
      phone: null,
      city: null,
      links: ['https://linkedin.com/in/ana'],
    };

    // Act
    const result = contactDetailsDraftSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should accept null links', () => {
    // Arrange
    const body = {
      fullName: 'Ana Souza',
      email: null,
      phone: null,
      city: null,
      links: null,
    };

    // Act
    const result = contactDetailsDraftSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });
});

describe('sectionOrderSchema', () => {
  it('should accept only the listed section kinds', () => {
    // Arrange
    const valid = ['summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'custom'];

    // Act
    const result = sectionOrderSchema.safeParse(valid);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an unknown section kind', () => {
    // Arrange
    const invalid = ['summary', 'header'];

    // Act
    const result = sectionOrderSchema.safeParse(invalid);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('resumeImportDraftSchema skills, languages and certifications', () => {
  it('should accept skills, languages, certifications and sectionOrder', () => {
    // Arrange
    const draft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
      skills: [{ name: 'Node.js', group: null }],
      languages: [{ name: 'English', level: 'Fluent' }],
      certifications: [{ name: 'AWS SAA', issuer: null, year: null }],
      sectionOrder: ['summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'custom'],
    };

    // Act
    const result = resumeImportDraftSchema.safeParse(draft);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should accept a draft without the new optional fields', () => {
    // Arrange
    const draft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    // Act
    const result = resumeImportDraftSchema.safeParse(draft);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should accept a summary and keep it out of evidences', () => {
    // Arrange
    const draft = {
      evidences: [{ statement: 'Led a team of five engineers', experienceIndex: 0 }],
      experiences: [{ company: 'Acme', role: 'Engineer', startedOn: '2020-01', endedOn: null }],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
      summary: 'Estudante de Engenharia de Software buscando estágio Fullstack.',
    };

    // Act
    const result = resumeImportDraftSchema.safeParse(draft);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toContain('Estudante');
      expect(result.data.evidences.some((evidence) => evidence.statement.includes('Estudante'))).toBe(false);
    }
  });

  it('should reject an empty summary', () => {
    // Arrange
    const draft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
      summary: '   ',
    };

    // Act
    const result = resumeImportDraftSchema.safeParse(draft);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('writingStyleSchema', () => {
  it('should accept a detected style with free method', () => {
    // Arrange
    const style = { writingMethod: 'free', tone: 'technical', averageBulletWords: 15 };

    // Act
    const result = writingStyleSchema.safeParse(style);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an unknown writing method', () => {
    // Arrange
    const style = { writingMethod: 'narrative', tone: 'direct', averageBulletWords: 12 };

    // Act
    const result = writingStyleSchema.safeParse(style);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('careerProfileResponseSchema skills, languages and certifications', () => {
  it('should accept skills, languages, certifications and contact with new links', () => {
    // Arrange
    const response = {
      experiences: [],
      educationEntries: [],
      evidences: [],
      skills: [{ id: '00000000-0000-0000-0000-000000000001', name: 'React', group: null }],
      languages: [{ id: '00000000-0000-0000-0000-000000000002', name: 'English', level: null }],
      certifications: [
        { id: '00000000-0000-0000-0000-000000000003', name: 'AWS SAA', issuer: null, year: null },
      ],
      contact: {
        fullName: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: [{ title: 'LinkedIn', url: 'https://linkedin.com/in/ada' }],
      },
    };

    // Act
    const result = careerProfileResponseSchema.safeParse(response);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject contact links in the old string format', () => {
    // Arrange
    const response = {
      experiences: [],
      educationEntries: [],
      evidences: [],
      contact: {
        fullName: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: ['https://linkedin.com/in/ada'],
      },
    };

    // Act
    const result = careerProfileResponseSchema.safeParse(response);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('createTailoredResumeRequestSchema language', () => {
  it('should accept an optional language', () => {
    // Arrange
    const withLanguage = {
      baseResumeId: '00000000-0000-0000-0000-000000000001',
      jobDescriptionId: '00000000-0000-0000-0000-000000000002',
      language: 'en',
    };
    const withoutLanguage = {
      baseResumeId: '00000000-0000-0000-0000-000000000001',
      jobDescriptionId: '00000000-0000-0000-0000-000000000002',
    };

    // Act
    const withResult = createTailoredResumeRequestSchema.safeParse(withLanguage);
    const withoutResult = createTailoredResumeRequestSchema.safeParse(withoutLanguage);

    // Assert
    expect(withResult.success).toBe(true);
    expect(withoutResult.success).toBe(true);
  });

  it('should reject an unknown language', () => {
    // Arrange
    const body = {
      baseResumeId: '00000000-0000-0000-0000-000000000001',
      jobDescriptionId: '00000000-0000-0000-0000-000000000002',
      language: 'fr',
    };

    // Act
    const result = createTailoredResumeRequestSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('skillProposalResponseSchema', () => {
  it('should accept a valid addition proposal', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'addition',
      name: 'Fastify',
      group: 'Back-end',
      replacesSkillId: null,
      replacesSkillName: null,
      requirementId: '00000000-0000-0000-0000-000000000002',
      literalTerm: 'Fastify',
      status: 'pending',
      ordinal: 0,
    };

    // Act
    const result = skillProposalResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should accept a valid swap proposal', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'swap',
      name: 'Fastify',
      group: null,
      replacesSkillId: '00000000-0000-0000-0000-000000000003',
      replacesSkillName: 'NestJS',
      requirementId: '00000000-0000-0000-0000-000000000002',
      literalTerm: 'Fastify',
      status: 'accepted',
      ordinal: 1,
    };

    // Act
    const result = skillProposalResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
  });

  it('should reject an invalid kind', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'rename',
      name: 'Fastify',
      group: null,
      replacesSkillId: null,
      replacesSkillName: null,
      requirementId: null,
      literalTerm: 'Fastify',
      status: 'pending',
      ordinal: 0,
    };

    // Act
    const result = skillProposalResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject an invalid status', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'addition',
      name: 'Fastify',
      group: null,
      replacesSkillId: null,
      replacesSkillName: null,
      requirementId: null,
      literalTerm: 'Fastify',
      status: 'approved',
      ordinal: 0,
    };

    // Act
    const result = skillProposalResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});

describe('resumeDocumentResponseSchema skillProposals', () => {
  it('should default missing skillProposals to an empty array', () => {
    // Arrange
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'tailored',
      name: 'Backend at Acme',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'star',
      tone: 'formal',
      baseResumeId: null,
      jobDescriptionId: '00000000-0000-0000-0000-000000000003',
      generationStatus: 'ready',
      generationStep: null,
      failureReason: null,
      adaptationPlan: null,
      adaptationChanges: null,
      adaptationReview: {},
      languageFallback: false,
      matchScore: null,
      contact: {
        name: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: null,
      },
      sections: [],
      requirementCoverages: [],
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };

    // Act
    const result = resumeDocumentResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skillProposals).toEqual([]);
    }
  });

  it('should reject a document with an invalid skill proposal kind', () => {
    // Arrange
    const proposal = {
      id: '00000000-0000-0000-0000-000000000010',
      kind: 'rename',
      name: 'Fastify',
      group: null,
      replacesSkillId: null,
      replacesSkillName: null,
      requirementId: null,
      literalTerm: 'Fastify',
      status: 'pending',
      ordinal: 0,
    };
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'tailored',
      name: 'Backend at Acme',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'star',
      tone: 'formal',
      baseResumeId: null,
      jobDescriptionId: '00000000-0000-0000-0000-000000000003',
      generationStatus: 'ready',
      generationStep: null,
      failureReason: null,
      adaptationPlan: null,
      adaptationChanges: null,
      adaptationReview: {},
      languageFallback: false,
      matchScore: null,
      contact: {
        name: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: null,
      },
      sections: [],
      requirementCoverages: [],
      skillProposals: [proposal],
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };

    // Act
    const result = resumeDocumentResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });

  it('should reject a document with an invalid skill proposal status', () => {
    // Arrange
    const proposal = {
      id: '00000000-0000-0000-0000-000000000010',
      kind: 'addition',
      name: 'Fastify',
      group: null,
      replacesSkillId: null,
      replacesSkillName: null,
      requirementId: null,
      literalTerm: 'Fastify',
      status: 'approved',
      ordinal: 0,
    };
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      kind: 'tailored',
      name: 'Backend at Acme',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'star',
      tone: 'formal',
      baseResumeId: null,
      jobDescriptionId: '00000000-0000-0000-0000-000000000003',
      generationStatus: 'ready',
      generationStep: null,
      failureReason: null,
      adaptationPlan: null,
      adaptationChanges: null,
      adaptationReview: {},
      languageFallback: false,
      matchScore: null,
      contact: {
        name: 'Ada Lovelace',
        email: null,
        phone: null,
        city: null,
        links: null,
      },
      sections: [],
      requirementCoverages: [],
      skillProposals: [proposal],
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };

    // Act
    const result = resumeDocumentResponseSchema.safeParse(body);

    // Assert
    expect(result.success).toBe(false);
  });
});
