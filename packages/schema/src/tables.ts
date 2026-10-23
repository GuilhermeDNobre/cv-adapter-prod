import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  bulletStatus,
  coverageLevel,
  evaluationFailureReason,
  evaluationStatus,
  gapKind,
  importFailureReason,
  importStatus,
  requirementKind,
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
} from './enums';

export const users = pgTable('users', (t) => ({
  id: t.uuid().primaryKey().defaultRandom(),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: t.timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const jobDescriptions = pgTable('job_descriptions', (t) => ({
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t
    .uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  rawText: t.text('raw_text').notNull(),
  language: t.text().notNull(),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: t.timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const requirements = pgTable(
  'requirements',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    jobDescriptionId: t
      .uuid('job_description_id')
      .notNull()
      .references(() => jobDescriptions.id, { onDelete: 'cascade' }),
    literalTerm: t.text('literal_term').notNull(),
    concept: t.text().notNull(),
    normalizedConcept: t.text('normalized_concept').notNull(),
    kind: requirementKind().notNull(),
    ordinal: t.integer().notNull(),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index('requirements_job_description_id_idx').on(t.jobDescriptionId)],
);

export const careerProfiles = pgTable(
  'career_profiles',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    userId: t
      .uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [uniqueIndex('career_profiles_user_id_unique').on(t.userId)],
);

export const contactDetails = pgTable('contact_details', (t) => ({
  careerProfileId: t
    .uuid('career_profile_id')
    .primaryKey()
    .references(() => careerProfiles.id, { onDelete: 'cascade' }),
  fullName: t.text('full_name'),
  email: t.text(),
  phone: t.text(),
  city: t.text(),
  links: t.jsonb(),
}));

export const experiences = pgTable('experiences', (t) => ({
  id: t.uuid().primaryKey().defaultRandom(),
  careerProfileId: t
    .uuid('career_profile_id')
    .notNull()
    .references(() => careerProfiles.id, { onDelete: 'cascade' }),
  company: t.text().notNull(),
  role: t.text().notNull(),
  startedOn: t.text('started_on').notNull(),
  endedOn: t.text('ended_on'),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const educationEntries = pgTable('education_entries', (t) => ({
  id: t.uuid().primaryKey().defaultRandom(),
  careerProfileId: t
    .uuid('career_profile_id')
    .notNull()
    .references(() => careerProfiles.id, { onDelete: 'cascade' }),
  institution: t.text().notNull(),
  degree: t.text().notNull(),
  startedOn: t.text('started_on').notNull(),
  endedOn: t.text('ended_on'),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const evidences = pgTable(
  'evidences',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    careerProfileId: t
      .uuid('career_profile_id')
      .notNull()
      .references(() => careerProfiles.id, { onDelete: 'cascade' }),
    experienceId: t.uuid('experience_id').references(() => experiences.id, { onDelete: 'set null' }),
    statement: t.text().notNull(),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index('evidences_career_profile_id_idx').on(t.careerProfileId)],
);

export const skills = pgTable(
  'skills',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    careerProfileId: t
      .uuid('career_profile_id')
      .notNull()
      .references(() => careerProfiles.id, { onDelete: 'cascade' }),
    name: t.text().notNull(),
    group: t.text(),
    ordinal: t.integer().notNull().default(0),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [
    uniqueIndex('skills_profile_lower_name_unique').on(
      t.careerProfileId,
      sql`lower(${t.name})`,
    ),
  ],
);

export const languages = pgTable('languages', (t) => ({
  id: t.uuid().primaryKey().defaultRandom(),
  careerProfileId: t
    .uuid('career_profile_id')
    .notNull()
    .references(() => careerProfiles.id, { onDelete: 'cascade' }),
  name: t.text().notNull(),
  level: t.text(),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const certifications = pgTable('certifications', (t) => ({
  id: t.uuid().primaryKey().defaultRandom(),
  careerProfileId: t
    .uuid('career_profile_id')
    .notNull()
    .references(() => careerProfiles.id, { onDelete: 'cascade' }),
  name: t.text().notNull(),
  issuer: t.text(),
  year: t.text(),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const resumeImports = pgTable('resume_imports', (t) => ({
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t
    .uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  storageKey: t.text('storage_key'),
  status: importStatus().notNull(),
  failureReason: importFailureReason('failure_reason'),
  draft: t.jsonb(),
  writingStyle: t.jsonb('writing_style'),
  baseResumeProposal: t.jsonb('base_resume_proposal'),
  summary: t.text(),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: t.timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const evaluations = pgTable('evaluations', (t) => ({
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t
    .uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jobDescriptionId: t
    .uuid('job_description_id')
    .notNull()
    .references(() => jobDescriptions.id, { onDelete: 'cascade' }),
  careerProfileId: t
    .uuid('career_profile_id')
    .notNull()
    .references(() => careerProfiles.id, { onDelete: 'cascade' }),
  resumeId: t.uuid('resume_id').references(() => resumes.id, { onDelete: 'cascade' }),
  status: evaluationStatus().notNull(),
  matchScore: t.integer('match_score'),
  failureReason: evaluationFailureReason('failure_reason'),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: t.timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const requirementCoverages = pgTable(
  'requirement_coverages',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    evaluationId: t
      .uuid('evaluation_id')
      .notNull()
      .references(() => evaluations.id, { onDelete: 'cascade' }),
    requirementId: t
      .uuid('requirement_id')
      .notNull()
      .references(() => requirements.id, { onDelete: 'cascade' }),
    coverage: coverageLevel().notNull(),
    evidenceId: t.uuid('evidence_id').references(() => evidences.id, { onDelete: 'set null' }),
    rationale: t.text().notNull(),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index('requirement_coverages_evaluation_id_idx').on(t.evaluationId)],
);

export const deniedRequirements = pgTable(
  'denied_requirements',
  (t) => ({
    careerProfileId: t
      .uuid('career_profile_id')
      .notNull()
      .references(() => careerProfiles.id, { onDelete: 'cascade' }),
    normalizedConcept: t.text('normalized_concept').notNull(),
    deniedAt: t.timestamp('denied_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [primaryKey({ columns: [t.careerProfileId, t.normalizedConcept] })],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const sourceDocuments = pgTable('source_documents', (t) => ({
  storageKey: t.text('storage_key').primaryKey(),
  content: bytea('content').notNull(),
  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}));

export const deepSeekCredentials = pgTable(
  'deepseek_credentials',
  (t) => ({
    id: t.smallint().primaryKey().default(1),
    apiKey: t.text('api_key').notNull(),
    updatedAt: t.timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [check('deepseek_credentials_single_row', sql`${t.id} = 1`)],
);

export const resumes = pgTable(
  'resumes',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    userId: t
      .uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: resumeKind().notNull(),
    name: t.text().notNull(),
    language: resumeLanguage().notNull(),
    template: resumeTemplate().notNull(),
    lengthTarget: t.integer('length_target').notNull(),
    writingMethod: writingMethod('writing_method').notNull(),
    tone: resumeTone().notNull(),
    baseResumeId: t.uuid('base_resume_id'),
    jobDescriptionId: t
      .uuid('job_description_id')
      .references(() => jobDescriptions.id, { onDelete: 'cascade' }),
    generationStatus: resumeGenerationStatus('generation_status').notNull(),
    generationStep: resumeGenerationStep('generation_step'),
    failureReason: evaluationFailureReason('failure_reason'),
    adaptationPlan: t.jsonb('adaptation_plan'),
    adaptationReview: t.jsonb('adaptation_review'),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: t.timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [
    foreignKey({
      columns: [t.baseResumeId],
      foreignColumns: [t.id],
      name: 'resumes_base_resume_id_resumes_id_fk',
    }).onDelete('set null'),
    check(
      'resumes_tailored_requires_job',
      sql`${t.kind} != 'tailored' OR ${t.jobDescriptionId} IS NOT NULL`,
    ),
  ],
);

export const resumeSections = pgTable(
  'resume_sections',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    resumeId: t
      .uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    kind: resumeSectionKind().notNull(),
    title: t.text(),
    ordinal: t.integer().notNull(),
    undoSnapshot: t.jsonb('undo_snapshot'),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index('resume_sections_resume_id_idx').on(t.resumeId)],
);

export const resumeSectionSkills = pgTable(
  'resume_section_skills',
  (t) => ({
    sectionId: t
      .uuid('section_id')
      .notNull()
      .references(() => resumeSections.id, { onDelete: 'cascade' }),
    skillId: t
      .uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    ordinal: t.integer().notNull(),
  }),
  (t) => [primaryKey({ columns: [t.sectionId, t.skillId] })],
);

export const resumeSkillProposals = pgTable(
  'resume_skill_proposals',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    sectionId: t
      .uuid('section_id')
      .notNull()
      .references(() => resumeSections.id, { onDelete: 'cascade' }),
    kind: skillProposalKind().notNull(),
    name: t.text().notNull(),
    group: t.text(),
    replacesSkillId: t
      .uuid('replaces_skill_id')
      .references(() => skills.id, { onDelete: 'cascade' }),
    requirementId: t
      .uuid('requirement_id')
      .references(() => requirements.id, { onDelete: 'set null' }),
    status: skillProposalStatus().notNull().default('pending'),
    ordinal: t.integer().notNull(),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [
    uniqueIndex('resume_skill_proposals_section_lower_name_unique').on(
      t.sectionId,
      sql`lower(${t.name})`,
    ),
    check(
      'resume_skill_proposals_swap_requires_skill',
      sql`(${t.kind} = 'swap') = (${t.replacesSkillId} IS NOT NULL)`,
    ),
  ],
);

export const resumeEntries = pgTable(
  'resume_entries',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    sectionId: t
      .uuid('section_id')
      .notNull()
      .references(() => resumeSections.id, { onDelete: 'cascade' }),
    ordinal: t.integer().notNull(),
    experienceId: t
      .uuid('experience_id')
      .references(() => experiences.id, { onDelete: 'set null' }),
    educationEntryId: t
      .uuid('education_entry_id')
      .references(() => educationEntries.id, { onDelete: 'set null' }),
    heading: t.text(),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index('resume_entries_section_id_idx').on(t.sectionId)],
);

export const resumeBullets = pgTable(
  'resume_bullets',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    entryId: t
      .uuid('entry_id')
      .notNull()
      .references(() => resumeEntries.id, { onDelete: 'cascade' }),
    ordinal: t.integer().notNull(),
    text: t.text().notNull(),
    evidenceId: t.uuid('evidence_id').references(() => evidences.id, { onDelete: 'set null' }),
    status: bulletStatus().notNull(),
    suggestionQuestion: t.text('suggestion_question'),
    requirementId: t
      .uuid('requirement_id')
      .references(() => requirements.id, { onDelete: 'set null' }),
    gapKind: gapKind('gap_kind'),
    needsReview: t.boolean('needs_review').notNull().default(false),
    editedByPerson: t.boolean('edited_by_person').notNull().default(false),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index('resume_bullets_entry_id_idx').on(t.entryId)],
);

export const sectionComments = pgTable(
  'section_comments',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    sectionId: t
      .uuid('section_id')
      .notNull()
      .references(() => resumeSections.id, { onDelete: 'cascade' }),
    text: t.text().notNull(),
    resolvedAt: t.timestamp('resolved_at', { withTimezone: true }),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index('section_comments_section_id_idx').on(t.sectionId)],
);

export const resumeExports = pgTable(
  'resume_exports',
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    resumeId: t
      .uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    pdf: bytea('pdf').notNull(),
    pageCount: t.integer('page_count').notNull(),
    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index('resume_exports_resume_id_idx').on(t.resumeId)],
);
