import { z } from 'zod';

export const careerProfileExperienceSchema = z.object({
  id: z.string().uuid(),
  company: z.string().min(1),
  role: z.string().min(1),
  startedOn: z.string().min(1),
  endedOn: z.string().nullable(),
});

export type CareerProfileExperience = z.infer<typeof careerProfileExperienceSchema>;

export const careerProfileEducationSchema = z.object({
  id: z.string().uuid(),
  institution: z.string().min(1),
  degree: z.string().min(1),
  startedOn: z.string().min(1),
  endedOn: z.string().nullable(),
});

export type CareerProfileEducation = z.infer<typeof careerProfileEducationSchema>;

export const careerProfileEvidenceSchema = z.object({
  id: z.string().uuid(),
  statement: z.string().min(1),
  experienceId: z.string().uuid().nullable(),
});

export type CareerProfileEvidence = z.infer<typeof careerProfileEvidenceSchema>;

export const careerProfileSkillSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  group: z.string().trim().min(1).nullable(),
});

export type CareerProfileSkill = z.infer<typeof careerProfileSkillSchema>;

export const careerProfileLanguageSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  level: z.string().trim().min(1).nullable(),
});

export type CareerProfileLanguage = z.infer<typeof careerProfileLanguageSchema>;

export const careerProfileCertificationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  issuer: z.string().trim().min(1).nullable(),
  year: z.string().trim().min(1).nullable(),
});

export type CareerProfileCertification = z.infer<typeof careerProfileCertificationSchema>;

export const careerProfileLinkSchema = z.object({
  title: z.string().trim().min(1).nullable(),
  url: z.string().trim().min(1),
});

export type CareerProfileLink = z.infer<typeof careerProfileLinkSchema>;

export const careerProfileContactSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().trim().min(1).nullable().optional(),
  links: z.array(careerProfileLinkSchema).nullable(),
});

export type CareerProfileContact = z.infer<typeof careerProfileContactSchema>;

export const careerProfileResponseSchema = z.object({
  experiences: z.array(careerProfileExperienceSchema),
  educationEntries: z.array(careerProfileEducationSchema),
  evidences: z.array(careerProfileEvidenceSchema),
  skills: z.array(careerProfileSkillSchema).optional(),
  languages: z.array(careerProfileLanguageSchema).optional(),
  certifications: z.array(careerProfileCertificationSchema).optional(),
  contact: careerProfileContactSchema.optional(),
});

export type CareerProfileResponse = z.infer<typeof careerProfileResponseSchema>;
