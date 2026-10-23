import { z } from 'zod';
import {
  bulletStatus,
  coverageLevel,
  gapKind,
  resumeGenerationStatus,
  resumeGenerationStep,
  resumeKind,
  resumeLanguage,
  resumeSectionKind,
  resumeTemplate,
  resumeTone,
  skillProposalKind,
  skillProposalStatus,
  writingMethod,
} from '../enums';
import { aiErrorCodeSchema } from './ai-error';

export const MAX_RESUME_NAME_LENGTH = 200;
export const MAX_SECTION_TITLE_LENGTH = 200;
export const MAX_BULLET_TEXT_LENGTH = 2000;
export const MAX_COMMENT_TEXT_LENGTH = 2000;
export const MAX_SECTION_REWRITE_INSTRUCTION_LENGTH = 500;

export const resumeIdSchema = z.string().uuid();
export const resumeSectionIdSchema = z.string().uuid();
export const resumeEntryIdSchema = z.string().uuid();
export const resumeBulletIdSchema = z.string().uuid();
export const sectionCommentIdSchema = z.string().uuid();
export const resumeEvidenceIdSchema = z.string().uuid();
export const resumeExperienceIdSchema = z.string().uuid();
export const resumeExportIdSchema = z.string().uuid();

export const baseResumeSectionSelectionSchema = z
  .object({
    kind: z.enum(resumeSectionKind.enumValues),
    title: z.string().trim().min(1).max(MAX_SECTION_TITLE_LENGTH).nullable().optional(),
    experienceIds: z.array(z.string().uuid()).optional(),
    educationEntryIds: z.array(z.string().uuid()).optional(),
    evidenceIds: z.array(z.string().uuid()).optional(),
    items: z.array(z.string().trim().min(1).max(MAX_BULLET_TEXT_LENGTH)).optional(),
    skillIds: z.array(z.string().uuid()).optional(),
    entries: z
      .array(
        z.object({
          experienceId: z.string().uuid().nullable().optional(),
          educationEntryId: z.string().uuid().nullable().optional(),
          bullets: z.array(
            z.object({
              evidenceId: z.string().uuid().nullable(),
              text: z.string().trim().min(1).max(MAX_BULLET_TEXT_LENGTH),
            }),
          ),
        }),
      )
      .optional(),
  })
  .refine(
    (selection) =>
      selection.kind === 'custom' ||
      selection.items === undefined ||
      selection.items.length === 0,
    { message: 'items is only allowed for custom sections', path: ['items'] },
  )
  .refine(
    (selection) =>
      selection.kind === 'skills' ||
      selection.skillIds === undefined ||
      selection.skillIds.length === 0,
    { message: 'skillIds is only allowed for skills sections', path: ['skillIds'] },
  );

export type BaseResumeSectionSelection = z.infer<typeof baseResumeSectionSelectionSchema>;

export const createBaseResumeRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_RESUME_NAME_LENGTH),
  language: z.enum(resumeLanguage.enumValues).optional(),
  template: z.enum(resumeTemplate.enumValues).optional(),
  lengthTarget: z.number().int().min(1).max(2).optional(),
  writingMethod: z.enum(writingMethod.enumValues).optional(),
  tone: z.enum(resumeTone.enumValues).optional(),
  sections: z.array(baseResumeSectionSelectionSchema).optional(),
});

export type CreateBaseResumeRequest = z.infer<typeof createBaseResumeRequestSchema>;

export const createTailoredResumeRequestSchema = z.object({
  baseResumeId: z.string().uuid(),
  jobDescriptionId: z.string().uuid(),
  language: z.enum(resumeLanguage.enumValues).optional(),
});

export type CreateTailoredResumeRequest = z.infer<typeof createTailoredResumeRequestSchema>;

export const createResumeResponseSchema = z.object({
  id: z.string().uuid(),
});

export type CreateResumeResponse = z.infer<typeof createResumeResponseSchema>;

export const updateResumeSettingsRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_RESUME_NAME_LENGTH).optional(),
    language: z.enum(resumeLanguage.enumValues).optional(),
    template: z.enum(resumeTemplate.enumValues).optional(),
    lengthTarget: z.number().int().min(1).max(2).optional(),
    writingMethod: z.enum(writingMethod.enumValues).optional(),
    tone: z.enum(resumeTone.enumValues).optional(),
  })
  .refine((settings) => Object.keys(settings).length > 0, {
    message: 'At least one setting must be provided',
  });

export type UpdateResumeSettingsRequest = z.infer<typeof updateResumeSettingsRequestSchema>;

export const updateResumeStructureRequestSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().uuid(),
        ordinal: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export type UpdateResumeStructureRequest = z.infer<typeof updateResumeStructureRequestSchema>;

export const createResumeSectionRequestSchema = z
  .object({
    kind: z.enum(resumeSectionKind.enumValues),
    title: z.string().trim().min(1).max(MAX_SECTION_TITLE_LENGTH).nullable().optional(),
    ordinal: z.number().int().nonnegative(),
    items: z.array(z.string().trim().min(1).max(MAX_BULLET_TEXT_LENGTH)).optional(),
  })
  .refine(
    (section) =>
      section.kind === 'custom' || section.items === undefined || section.items.length === 0,
    { message: 'items is only allowed for custom sections', path: ['items'] },
  );

export type CreateResumeSectionRequest = z.infer<typeof createResumeSectionRequestSchema>;

export const updateBulletRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_BULLET_TEXT_LENGTH),
});

export type UpdateBulletRequest = z.infer<typeof updateBulletRequestSchema>;

export const moveBulletRequestSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export type MoveBulletRequest = z.infer<typeof moveBulletRequestSchema>;

export const addCustomItemRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_BULLET_TEXT_LENGTH),
  createEvidence: z.boolean().optional(),
  entryId: z.string().uuid().optional(),
});

export type AddCustomItemRequest = z.infer<typeof addCustomItemRequestSchema>;

export const createSectionCommentRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_COMMENT_TEXT_LENGTH),
});

export type CreateSectionCommentRequest = z.infer<typeof createSectionCommentRequestSchema>;

export const sectionRewriteRequestSchema = z.object({
  instruction: z.string().trim().min(1).max(MAX_SECTION_REWRITE_INSTRUCTION_LENGTH),
});

export type SectionRewriteRequest = z.infer<typeof sectionRewriteRequestSchema>;

export const updateEvidenceRequestSchema = z.object({
  statement: z.string().trim().min(1),
});

export type UpdateEvidenceRequest = z.infer<typeof updateEvidenceRequestSchema>;

export const updateExperienceRequestSchema = z
  .object({
    company: z.string().trim().min(1).optional(),
    role: z.string().trim().min(1).optional(),
    startedOn: z.string().trim().min(1).optional(),
    endedOn: z.string().trim().min(1).nullable().optional(),
  })
  .refine((correction) => Object.keys(correction).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateExperienceRequest = z.infer<typeof updateExperienceRequestSchema>;

export const exportResumeResponseSchema = z.object({
  exportId: z.string().uuid(),
  pageCount: z.number().int().positive(),
  exceedsLengthTarget: z.boolean(),
});

export type ExportResumeResponse = z.infer<typeof exportResumeResponseSchema>;

export const resumeExportSummarySchema = z.object({
  id: z.string().uuid(),
  pageCount: z.number().int().positive(),
  createdAt: z.string(),
});

export type ResumeExportSummary = z.infer<typeof resumeExportSummarySchema>;

export const resumeListItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(resumeKind.enumValues),
  name: z.string().min(1),
  language: z.enum(resumeLanguage.enumValues),
  template: z.enum(resumeTemplate.enumValues),
  lengthTarget: z.number().int().min(1).max(2),
  writingMethod: z.enum(writingMethod.enumValues),
  tone: z.enum(resumeTone.enumValues),
  baseResumeId: z.string().uuid().nullable(),
  jobDescriptionId: z.string().uuid().nullable(),
  jobTitle: z.string().min(1).nullable(),
  generationStatus: z.enum(resumeGenerationStatus.enumValues),
  failureReason: aiErrorCodeSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  exports: z.array(resumeExportSummarySchema),
});

export type ResumeListItem = z.infer<typeof resumeListItemSchema>;

export const resumeListResponseSchema = z.object({
  resumes: z.array(resumeListItemSchema),
});

export type ResumeListResponse = z.infer<typeof resumeListResponseSchema>;

export const resumeBulletResponseSchema = z.object({
  id: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  text: z.string().min(1),
  evidenceId: z.string().uuid().nullable(),
  status: z.enum(bulletStatus.enumValues),
  suggestionQuestion: z.string().min(1).nullable(),
  requirementId: z.string().uuid().nullable(),
  gapKind: z.enum(gapKind.enumValues).nullable(),
  needsReview: z.boolean(),
  editedByPerson: z.boolean(),
});

export type ResumeBulletResponse = z.infer<typeof resumeBulletResponseSchema>;

export const resumeContactLinkSchema = z.object({
  title: z.string().trim().min(1).nullable(),
  url: z.string().trim().min(1),
});

export type ResumeContactLink = z.infer<typeof resumeContactLinkSchema>;

export const resumeContactResponseSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1).nullable(),
  phone: z.string().min(1).nullable(),
  city: z.string().trim().min(1).nullable().optional(),
  links: z.array(resumeContactLinkSchema).nullable(),
});

export type ResumeContactResponse = z.infer<typeof resumeContactResponseSchema>;

export const resumeEntryResponseSchema = z.object({
  id: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  experienceId: z.string().uuid().nullable(),
  educationEntryId: z.string().uuid().nullable(),
  heading: z.string().min(1).nullable(),
  company: z.string().min(1).nullable(),
  role: z.string().min(1).nullable(),
  institution: z.string().min(1).nullable(),
  degree: z.string().min(1).nullable(),
  period: z.string().min(1).nullable(),
  bullets: z.array(resumeBulletResponseSchema),
});

export type ResumeEntryResponse = z.infer<typeof resumeEntryResponseSchema>;

export const sectionCommentResponseSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type SectionCommentResponse = z.infer<typeof sectionCommentResponseSchema>;

export const resumeSectionResponseSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(resumeSectionKind.enumValues),
  title: z.string().min(1).nullable(),
  ordinal: z.number().int().nonnegative(),
  entries: z.array(resumeEntryResponseSchema),
  comments: z.array(sectionCommentResponseSchema),
});

export type ResumeSectionResponse = z.infer<typeof resumeSectionResponseSchema>;

export const resumeRequirementCoverageResponseSchema = z.object({
  requirementId: z.string().uuid(),
  literalTerm: z.string().min(1),
  coverage: z.enum(coverageLevel.enumValues),
  bulletId: z.string().uuid().nullable(),
});

export type ResumeRequirementCoverageResponse = z.infer<
  typeof resumeRequirementCoverageResponseSchema
>;

export const resumeEvidenceChangeSchema = z.object({
  id: z.string().uuid(),
  statement: z.string().min(1),
});

export type ResumeEvidenceChange = z.infer<typeof resumeEvidenceChangeSchema>;

export const adaptationChangesSchema = z.object({
  addedEvidences: z.array(resumeEvidenceChangeSchema),
  removedEvidences: z.array(resumeEvidenceChangeSchema),
});

export type AdaptationChanges = z.infer<typeof adaptationChangesSchema>;

export const adaptationReviewDecisionSchema = z.enum(['accepted', 'rejected', 'restored']);

export type AdaptationReviewDecision = z.infer<typeof adaptationReviewDecisionSchema>;

export const adaptationReviewSnapshotItemSchema = z.object({
  entryId: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  text: z.string().min(1),
  bulletId: z.string().uuid(),
  editedByPerson: z.boolean().optional().default(false),
  needsReview: z.boolean().optional().default(false),
});

export type AdaptationReviewSnapshotItem = z.infer<typeof adaptationReviewSnapshotItemSchema>;

export const adaptationReviewEntrySchema = z.object({
  decision: adaptationReviewDecisionSchema,
  decidedAt: z.string().min(1),
  snapshot: z.array(adaptationReviewSnapshotItemSchema),
});

export type AdaptationReviewEntry = z.infer<typeof adaptationReviewEntrySchema>;

export const adaptationReviewRecordSchema = z.record(
  z.string().uuid(),
  adaptationReviewEntrySchema,
);

export type AdaptationReviewRecord = z.infer<typeof adaptationReviewRecordSchema>;

export const adaptationReviewResponseSchema = z.record(
  z.string().uuid(),
  adaptationReviewDecisionSchema,
);

export type AdaptationReviewResponse = z.infer<typeof adaptationReviewResponseSchema>;

export const adaptationReviewRequestSchema = z.object({
  evidenceId: z.string().uuid(),
  decision: adaptationReviewDecisionSchema,
});

export type AdaptationReviewRequest = z.infer<typeof adaptationReviewRequestSchema>;

export const adaptationReviewUndoRequestSchema = z.object({
  evidenceId: z.string().uuid(),
});

export type AdaptationReviewUndoRequest = z.infer<typeof adaptationReviewUndoRequestSchema>;

export const skillProposalResponseSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(skillProposalKind.enumValues),
  name: z.string().min(1),
  group: z.string().min(1).nullable(),
  replacesSkillId: z.string().uuid().nullable(),
  replacesSkillName: z.string().min(1).nullable(),
  requirementId: z.string().uuid().nullable(),
  literalTerm: z.string().min(1).nullable(),
  status: z.enum(skillProposalStatus.enumValues),
  ordinal: z.number().int().nonnegative(),
});

export type SkillProposalResponse = z.infer<typeof skillProposalResponseSchema>;

export const resumeDocumentResponseSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(resumeKind.enumValues),
  name: z.string().min(1),
  language: z.enum(resumeLanguage.enumValues),
  template: z.enum(resumeTemplate.enumValues),
  lengthTarget: z.number().int().min(1).max(2),
  writingMethod: z.enum(writingMethod.enumValues),
  tone: z.enum(resumeTone.enumValues),
  baseResumeId: z.string().uuid().nullable(),
  jobDescriptionId: z.string().uuid().nullable(),
  generationStatus: z.enum(resumeGenerationStatus.enumValues),
  generationStep: z.enum(resumeGenerationStep.enumValues).nullable().optional(),
  failureReason: aiErrorCodeSchema.nullable(),
  adaptationPlan: z.unknown().nullable(),
  adaptationChanges: adaptationChangesSchema.nullable(),
  adaptationReview: adaptationReviewResponseSchema,
  languageFallback: z.boolean(),
  matchScore: z.number().int().min(0).max(100).nullable(),
  contact: resumeContactResponseSchema,
  sections: z.array(resumeSectionResponseSchema),
  requirementCoverages: z.array(resumeRequirementCoverageResponseSchema),
  skillProposals: z.array(skillProposalResponseSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ResumeDocumentResponse = z.infer<typeof resumeDocumentResponseSchema>;
