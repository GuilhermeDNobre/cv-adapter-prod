import type {
  careerProfiles,
  certifications,
  contactDetails,
  deepSeekCredentials,
  deniedRequirements,
  educationEntries,
  evaluations,
  evidences,
  experiences,
  jobDescriptions,
  languages,
  requirementCoverages,
  requirements,
  resumeBullets,
  resumeEntries,
  resumeExports,
  resumeImports,
  resumeSectionSkills,
  resumeSections,
  resumeSkillProposals,
  resumes,
  sectionComments,
  skills,
  sourceDocuments,
  users,
} from './tables';

export * from './enums';
export * from './local-user';
export * from './tables';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type JobDescription = typeof jobDescriptions.$inferSelect;
export type NewJobDescription = typeof jobDescriptions.$inferInsert;
export type Requirement = typeof requirements.$inferSelect;
export type NewRequirement = typeof requirements.$inferInsert;
export type CareerProfile = typeof careerProfiles.$inferSelect;
export type NewCareerProfile = typeof careerProfiles.$inferInsert;
export type ContactDetail = typeof contactDetails.$inferSelect;
export type NewContactDetail = typeof contactDetails.$inferInsert;
export type Experience = typeof experiences.$inferSelect;
export type NewExperience = typeof experiences.$inferInsert;
export type EducationEntry = typeof educationEntries.$inferSelect;
export type NewEducationEntry = typeof educationEntries.$inferInsert;
export type Evidence = typeof evidences.$inferSelect;
export type NewEvidence = typeof evidences.$inferInsert;
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type Language = typeof languages.$inferSelect;
export type NewLanguage = typeof languages.$inferInsert;
export type Certification = typeof certifications.$inferSelect;
export type NewCertification = typeof certifications.$inferInsert;
export type ResumeImport = typeof resumeImports.$inferSelect;
export type NewResumeImport = typeof resumeImports.$inferInsert;
export type Evaluation = typeof evaluations.$inferSelect;
export type NewEvaluation = typeof evaluations.$inferInsert;
export type RequirementCoverage = typeof requirementCoverages.$inferSelect;
export type NewRequirementCoverage = typeof requirementCoverages.$inferInsert;
export type DeniedRequirement = typeof deniedRequirements.$inferSelect;
export type NewDeniedRequirement = typeof deniedRequirements.$inferInsert;
export type SourceDocument = typeof sourceDocuments.$inferSelect;
export type NewSourceDocument = typeof sourceDocuments.$inferInsert;
export type DeepSeekCredential = typeof deepSeekCredentials.$inferSelect;
export type NewDeepSeekCredential = typeof deepSeekCredentials.$inferInsert;
export type Resume = typeof resumes.$inferSelect;
export type NewResume = typeof resumes.$inferInsert;
export type ResumeSection = typeof resumeSections.$inferSelect;
export type NewResumeSection = typeof resumeSections.$inferInsert;
export type ResumeSectionSkill = typeof resumeSectionSkills.$inferSelect;
export type NewResumeSectionSkill = typeof resumeSectionSkills.$inferInsert;
export type ResumeSkillProposal = typeof resumeSkillProposals.$inferSelect;
export type NewResumeSkillProposal = typeof resumeSkillProposals.$inferInsert;
export type ResumeEntry = typeof resumeEntries.$inferSelect;
export type NewResumeEntry = typeof resumeEntries.$inferInsert;
export type ResumeBullet = typeof resumeBullets.$inferSelect;
export type NewResumeBullet = typeof resumeBullets.$inferInsert;
export type SectionComment = typeof sectionComments.$inferSelect;
export type NewSectionComment = typeof sectionComments.$inferInsert;
export type ResumeExport = typeof resumeExports.$inferSelect;
export type NewResumeExport = typeof resumeExports.$inferInsert;
