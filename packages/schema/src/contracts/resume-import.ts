import { z } from 'zod';
import { importStatus, importFailureReason, resumeTone, writingMethod } from '../enums';

export const MAX_SOURCE_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_SOURCE_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/x-latex',
  'text/x-latex',
  'text/html',
] as const;

export const SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.tex',
  '.latex',
  '.html',
  '.htm',
] as const;

export const evidenceDraftSchema = z.object({
  statement: z.string().min(1),
  experienceIndex: z.number().int().nonnegative().optional(),
});

export type EvidenceDraft = z.infer<typeof evidenceDraftSchema>;

export const experienceDraftSchema = z.object({
  company: z.string(),
  role: z.string(),
  startedOn: z.string(),
  endedOn: z.string().nullable(),
});

export type ExperienceDraft = z.infer<typeof experienceDraftSchema>;

export const educationDraftSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  startedOn: z.string(),
  endedOn: z.string().nullable(),
});

export type EducationDraft = z.infer<typeof educationDraftSchema>;

export const resumeLinkDraftSchema = z.object({
  title: z.string().trim().min(1).nullable(),
  url: z.string().trim().min(1),
});

export type ResumeLinkDraft = z.infer<typeof resumeLinkDraftSchema>;

export const contactDetailsDraftSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().trim().min(1).nullable().optional(),
  links: z.array(resumeLinkDraftSchema).nullable(),
});

export type ContactDetailsDraft = z.infer<typeof contactDetailsDraftSchema>;

export const skillDraftSchema = z.object({
  name: z.string().trim().min(1),
  group: z.string().trim().min(1).nullable(),
});

export type SkillDraft = z.infer<typeof skillDraftSchema>;

export const languageDraftSchema = z.object({
  name: z.string().trim().min(1),
  level: z.string().trim().min(1).nullable(),
});

export type LanguageDraft = z.infer<typeof languageDraftSchema>;

export const certificationDraftSchema = z.object({
  name: z.string().trim().min(1),
  issuer: z.string().trim().min(1).nullable(),
  year: z.string().trim().min(1).nullable(),
});

export type CertificationDraft = z.infer<typeof certificationDraftSchema>;

export const sectionOrderSchema = z.array(
  z.enum(['summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'custom']),
);

export type SectionOrder = z.infer<typeof sectionOrderSchema>;

export const writingStyleSchema = z.object({
  writingMethod: z.enum(writingMethod.enumValues),
  tone: z.enum(resumeTone.enumValues),
  averageBulletWords: z.number().int().positive(),
});

export type WritingStyle = z.infer<typeof writingStyleSchema>;

export const resumeImportDraftSchema = z.object({
  evidences: z.array(evidenceDraftSchema),
  experiences: z.array(experienceDraftSchema),
  education: z.array(educationDraftSchema),
  contactDetails: contactDetailsDraftSchema,
  summary: z.string().trim().min(1).nullable().optional(),
  skills: z.array(skillDraftSchema).optional(),
  languages: z.array(languageDraftSchema).optional(),
  certifications: z.array(certificationDraftSchema).optional(),
  sectionOrder: sectionOrderSchema.optional(),
});

export type ResumeImportDraft = z.infer<typeof resumeImportDraftSchema>;

export const resumeImportIdSchema = z.string().uuid();

export const resumeImportResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(importStatus.enumValues),
  failureReason: z.enum(importFailureReason.enumValues).nullable(),
  draft: resumeImportDraftSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ResumeImportResponse = z.infer<typeof resumeImportResponseSchema>;

export const proposedBulletSchema = z.object({
  evidenceId: z.string().uuid().nullable(),
  original: z.string().min(1),
  text: z.string().min(1),
});

export type ProposedBullet = z.infer<typeof proposedBulletSchema>;

export const proposedEntrySchema = z.object({
  experienceId: z.string().uuid().nullable().optional(),
  educationEntryId: z.string().uuid().nullable().optional(),
  bullets: z.array(proposedBulletSchema),
  rewriteFailed: z.boolean().optional(),
});

export type ProposedEntry = z.infer<typeof proposedEntrySchema>;

export const proposedSectionSchema = z.object({
  kind: z.enum(['summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'custom']),
  title: z.string().min(1).nullable(),
  entries: z.array(proposedEntrySchema),
  skillIds: z.array(z.string().uuid()).optional(),
});

export type ProposedSection = z.infer<typeof proposedSectionSchema>;

export const baseResumeProposalSchema = z.object({
  name: z.string().min(1),
  language: z.enum(['pt', 'en']),
  style: writingStyleSchema,
  sections: z.array(proposedSectionSchema),
});

export type BaseResumeProposal = z.infer<typeof baseResumeProposalSchema>;

export const baseResumeProposalStatusSchema = z.enum(['generating', 'ready', 'failed']);

export type BaseResumeProposalStatus = z.infer<typeof baseResumeProposalStatusSchema>;

export const baseResumeProposalRecordSchema = z.object({
  status: baseResumeProposalStatusSchema,
  proposal: baseResumeProposalSchema.nullable(),
  failureReason: z.string().min(1).nullable(),
});

export type BaseResumeProposalRecord = z.infer<typeof baseResumeProposalRecordSchema>;

export const baseResumeProposalResponseSchema = baseResumeProposalRecordSchema;

export type BaseResumeProposalResponse = z.infer<typeof baseResumeProposalResponseSchema>;
