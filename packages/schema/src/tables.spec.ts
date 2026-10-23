import crypto from 'node:crypto';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from './index';
import { resumeGenerationStep } from './enums';
import {
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

const allTables: PgTable[] = [
  users,
  jobDescriptions,
  requirements,
  careerProfiles,
  contactDetails,
  experiences,
  educationEntries,
  evidences,
  skills,
  languages,
  certifications,
  resumeImports,
  evaluations,
  requirementCoverages,
  deniedRequirements,
  sourceDocuments,
  deepSeekCredentials,
  resumes,
  resumeSections,
  resumeSectionSkills,
  resumeSkillProposals,
  resumeEntries,
  resumeBullets,
  sectionComments,
  resumeExports,
];

function columnsOf(table: PgTable): AnyPgColumn[] {
  return getTableConfig(table).columns;
}

function columnNames(table: PgTable): string[] {
  return columnsOf(table).map((column) => column.name);
}

function primaryKeyColumns(table: PgTable): string[] {
  const columnLevel = columnsOf(table)
    .filter((column) => column.primary)
    .map((column) => column.name);
  const tableLevel = getTableConfig(table).primaryKeys.flatMap((primaryKey) =>
    primaryKey.columns.map((column) => column.name),
  );
  return [...columnLevel, ...tableLevel];
}

function foreignKeyOnLocalColumn(table: PgTable, localColumnName: string) {
  const foreignKey = getTableConfig(table).foreignKeys.find((candidate) =>
    candidate.reference().columns.some((column) => column.name === localColumnName),
  );
  if (!foreignKey) {
    throw new Error(`No foreign key on ${getTableConfig(table).name}.${localColumnName}`);
  }
  return foreignKey;
}

function indexNamed(table: PgTable, name: string) {
  const index = getTableConfig(table).indexes.find(
    (candidate) => candidate.config.name === name,
  );
  if (!index) {
    throw new Error(`No index named ${name} on table`);
  }
  return index;
}

describe('table set', () => {
  it('should contain exactly the 25 tables and no extra table', () => {
    const sqlNames = allTables.map((table) => getTableConfig(table).name);
    expect(sqlNames).toEqual([
      'users',
      'job_descriptions',
      'requirements',
      'career_profiles',
      'contact_details',
      'experiences',
      'education_entries',
      'evidences',
      'skills',
      'languages',
      'certifications',
      'resume_imports',
      'evaluations',
      'requirement_coverages',
      'denied_requirements',
      'source_documents',
      'deepseek_credentials',
      'resumes',
      'resume_sections',
      'resume_section_skills',
      'resume_skill_proposals',
      'resume_entries',
      'resume_bullets',
      'section_comments',
      'resume_exports',
    ]);
  });
});

describe('users', () => {
  it('should have exactly id, created_at and updated_at', () => {
    expect(columnNames(users)).toEqual(['id', 'created_at', 'updated_at']);
  });

  it('should have no index beyond the primary key', () => {
    expect(getTableConfig(users).indexes).toEqual([]);
  });
});

describe('job_descriptions', () => {
  it('should have a NOT NULL user_id', () => {
    const userId = columnsOf(jobDescriptions).find((column) => column.name === 'user_id');
    expect(userId?.notNull).toBe(true);
  });

  it('should cascade to users on delete', () => {
    expect(foreignKeyOnLocalColumn(jobDescriptions, 'user_id').onDelete).toBe('cascade');
  });
});

describe('requirements', () => {
  it('should have the techspec columns', () => {
    expect(columnNames(requirements)).toEqual([
      'id',
      'job_description_id',
      'literal_term',
      'concept',
      'normalized_concept',
      'kind',
      'ordinal',
      'created_at',
    ]);
  });

  it('should have a lookup index on job_description_id', () => {
    expect(indexNamed(requirements, 'requirements_job_description_id_idx')).toBeDefined();
  });

  it('should cascade to job_descriptions on delete', () => {
    expect(foreignKeyOnLocalColumn(requirements, 'job_description_id').onDelete).toBe('cascade');
  });
});

describe('career_profiles', () => {
  it('should have a unique index on user_id', () => {
    expect(indexNamed(careerProfiles, 'career_profiles_user_id_unique').config.unique).toBe(true);
  });

  it('should cascade to users on delete', () => {
    expect(foreignKeyOnLocalColumn(careerProfiles, 'user_id').onDelete).toBe('cascade');
  });
});

describe('contact_details', () => {
  it('should have career_profile_id as its only primary key column', () => {
    expect(primaryKeyColumns(contactDetails)).toEqual(['career_profile_id']);
  });

  it('should have no evidence or section column', () => {
    expect(columnNames(contactDetails)).toEqual([
      'career_profile_id',
      'full_name',
      'email',
      'phone',
      'city',
      'links',
    ]);
  });

  it('should store city as nullable text', () => {
    const city = columnsOf(contactDetails).find((column) => column.name === 'city');
    expect(city?.getSQLType()).toBe('text');
    expect(city?.notNull).toBe(false);
  });

  it('should cascade to career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(contactDetails, 'career_profile_id').onDelete).toBe('cascade');
  });
});

describe('experiences', () => {
  it('should have the techspec columns with a nullable ended_on', () => {
    expect(columnNames(experiences)).toEqual([
      'id',
      'career_profile_id',
      'company',
      'role',
      'started_on',
      'ended_on',
      'created_at',
    ]);
    const endedOn = columnsOf(experiences).find((column) => column.name === 'ended_on');
    expect(endedOn?.notNull).toBe(false);
  });

  it('should store started_on and ended_on as text', () => {
    const startedOn = columnsOf(experiences).find((column) => column.name === 'started_on');
    const endedOn = columnsOf(experiences).find((column) => column.name === 'ended_on');
    expect(startedOn?.getSQLType()).toBe('text');
    expect(endedOn?.getSQLType()).toBe('text');
  });

  it('should cascade to career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(experiences, 'career_profile_id').onDelete).toBe('cascade');
  });
});

describe('education_entries', () => {
  it('should have the techspec columns with a nullable ended_on', () => {
    expect(columnNames(educationEntries)).toEqual([
      'id',
      'career_profile_id',
      'institution',
      'degree',
      'started_on',
      'ended_on',
      'created_at',
    ]);
    const endedOn = columnsOf(educationEntries).find((column) => column.name === 'ended_on');
    expect(endedOn?.notNull).toBe(false);
  });

  it('should store started_on and ended_on as text', () => {
    const startedOn = columnsOf(educationEntries).find((column) => column.name === 'started_on');
    const endedOn = columnsOf(educationEntries).find((column) => column.name === 'ended_on');
    expect(startedOn?.getSQLType()).toBe('text');
    expect(endedOn?.getSQLType()).toBe('text');
  });

  it('should cascade to career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(educationEntries, 'career_profile_id').onDelete).toBe('cascade');
  });
});

describe('evidences', () => {
  it('should have the techspec columns with a nullable experience_id', () => {
    expect(columnNames(evidences)).toEqual([
      'id',
      'career_profile_id',
      'experience_id',
      'statement',
      'created_at',
    ]);
    const experienceId = columnsOf(evidences).find((column) => column.name === 'experience_id');
    expect(experienceId?.notNull).toBe(false);
  });

  it('should have a lookup index on career_profile_id', () => {
    expect(indexNamed(evidences, 'evidences_career_profile_id_idx')).toBeDefined();
  });

  it('should cascade to career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(evidences, 'career_profile_id').onDelete).toBe('cascade');
  });

  it('should set experience_id to null when the experience is deleted', () => {
    expect(foreignKeyOnLocalColumn(evidences, 'experience_id').onDelete).toBe('set null');
  });
});

describe('skills', () => {
  it('should have id, career_profile_id, name, group, ordinal and created_at', () => {
    expect(columnNames(skills)).toEqual([
      'id',
      'career_profile_id',
      'name',
      'group',
      'ordinal',
      'created_at',
    ]);
    const group = columnsOf(skills).find((column) => column.name === 'group');
    expect(group?.notNull).toBe(false);
    const ordinal = columnsOf(skills).find((column) => column.name === 'ordinal');
    expect(ordinal?.notNull).toBe(true);
  });

  it('should have a unique index on career_profile_id and lower(name)', () => {
    const unique = indexNamed(skills, 'skills_profile_lower_name_unique');
    expect(unique.config.unique).toBe(true);
  });

  it('should cascade to career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(skills, 'career_profile_id').onDelete).toBe('cascade');
  });
});

describe('languages', () => {
  it('should have id, career_profile_id, name, level and created_at', () => {
    expect(columnNames(languages)).toEqual([
      'id',
      'career_profile_id',
      'name',
      'level',
      'created_at',
    ]);
    const level = columnsOf(languages).find((column) => column.name === 'level');
    expect(level?.notNull).toBe(false);
  });

  it('should cascade to career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(languages, 'career_profile_id').onDelete).toBe('cascade');
  });
});

describe('certifications', () => {
  it('should have id, career_profile_id, name, issuer, year and created_at', () => {
    expect(columnNames(certifications)).toEqual([
      'id',
      'career_profile_id',
      'name',
      'issuer',
      'year',
      'created_at',
    ]);
    const issuer = columnsOf(certifications).find((column) => column.name === 'issuer');
    expect(issuer?.notNull).toBe(false);
    const year = columnsOf(certifications).find((column) => column.name === 'year');
    expect(year?.notNull).toBe(false);
    expect(year?.getSQLType()).toBe('text');
  });

  it('should cascade to career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(certifications, 'career_profile_id').onDelete).toBe('cascade');
  });
});

describe('resume_imports', () => {
  it('should have the techspec columns with nullable storage_key, failure_reason, draft and writing_style', () => {
    expect(columnNames(resumeImports)).toEqual([
      'id',
      'user_id',
      'storage_key',
      'status',
      'failure_reason',
      'draft',
      'writing_style',
      'base_resume_proposal',
      'summary',
      'created_at',
      'updated_at',
    ]);
    const nullable = columnsOf(resumeImports)
      .filter((column) => !column.notNull)
      .map((column) => column.name);
    expect(nullable).toEqual([
      'storage_key',
      'failure_reason',
      'draft',
      'writing_style',
      'base_resume_proposal',
      'summary',
    ]);
  });

  it('should store draft as jsonb', () => {
    const draft = columnsOf(resumeImports).find((column) => column.name === 'draft');
    expect(draft?.getSQLType()).toBe('jsonb');
  });

  it('should store writing_style as nullable jsonb', () => {
    const writingStyle = columnsOf(resumeImports).find(
      (column) => column.name === 'writing_style',
    );
    expect(writingStyle?.getSQLType()).toBe('jsonb');
    expect(writingStyle?.notNull).toBe(false);
  });

  it('should store base_resume_proposal as nullable jsonb', () => {
    const proposal = columnsOf(resumeImports).find(
      (column) => column.name === 'base_resume_proposal',
    );
    expect(proposal?.getSQLType()).toBe('jsonb');
    expect(proposal?.notNull).toBe(false);
  });

  it('should cascade to users on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeImports, 'user_id').onDelete).toBe('cascade');
  });
});

describe('evaluations', () => {
  it('should have the techspec columns with a nullable integer match_score and nullable failure_reason', () => {
    expect(columnNames(evaluations)).toEqual([
      'id',
      'user_id',
      'job_description_id',
      'career_profile_id',
      'resume_id',
      'status',
      'match_score',
      'failure_reason',
      'created_at',
      'updated_at',
    ]);
    const matchScore = columnsOf(evaluations).find((column) => column.name === 'match_score');
    expect(matchScore?.notNull).toBe(false);
    expect(matchScore?.getSQLType()).toBe('integer');
    const failureReason = columnsOf(evaluations).find(
      (column) => column.name === 'failure_reason',
    );
    expect(failureReason?.notNull).toBe(false);
  });

  it('should cascade to users, job_descriptions and career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(evaluations, 'user_id').onDelete).toBe('cascade');
    expect(foreignKeyOnLocalColumn(evaluations, 'job_description_id').onDelete).toBe('cascade');
    expect(foreignKeyOnLocalColumn(evaluations, 'career_profile_id').onDelete).toBe('cascade');
  });

  it('should expose resume_id as nullable uuid with cascade to resumes', () => {
    const resumeId = columnsOf(evaluations).find((column) => column.name === 'resume_id');
    expect(resumeId?.getSQLType()).toBe('uuid');
    expect(resumeId?.notNull).toBe(false);
    expect(foreignKeyOnLocalColumn(evaluations, 'resume_id').onDelete).toBe('cascade');
  });
});

describe('requirement_coverages', () => {
  it('should have the techspec columns with a nullable evidence_id', () => {
    expect(columnNames(requirementCoverages)).toEqual([
      'id',
      'evaluation_id',
      'requirement_id',
      'coverage',
      'evidence_id',
      'rationale',
      'created_at',
    ]);
    const evidenceId = columnsOf(requirementCoverages).find(
      (column) => column.name === 'evidence_id',
    );
    expect(evidenceId?.notNull).toBe(false);
  });

  it('should have a lookup index on evaluation_id', () => {
    expect(indexNamed(requirementCoverages, 'requirement_coverages_evaluation_id_idx')).toBeDefined();
  });

  it('should cascade to evaluations and requirements, and set evidence_id to null', () => {
    expect(foreignKeyOnLocalColumn(requirementCoverages, 'evaluation_id').onDelete).toBe('cascade');
    expect(foreignKeyOnLocalColumn(requirementCoverages, 'requirement_id').onDelete).toBe(
      'cascade',
    );
    expect(foreignKeyOnLocalColumn(requirementCoverages, 'evidence_id').onDelete).toBe('set null');
  });
});

describe('denied_requirements', () => {
  it('should have a composite primary key on career_profile_id and normalized_concept', () => {
    expect(primaryKeyColumns(deniedRequirements)).toEqual([
      'career_profile_id',
      'normalized_concept',
    ]);
  });

  it('should not key the denial by requirement_id', () => {
    expect(columnNames(deniedRequirements)).not.toContain('requirement_id');
  });

  it('should have a not null denied_at with a default', () => {
    const deniedAt = columnsOf(deniedRequirements).find((column) => column.name === 'denied_at');
    expect(deniedAt?.notNull).toBe(true);
    expect(deniedAt?.hasDefault).toBe(true);
  });

  it('should cascade to career_profiles on delete', () => {
    expect(foreignKeyOnLocalColumn(deniedRequirements, 'career_profile_id').onDelete).toBe(
      'cascade',
    );
  });
});

describe('source_documents', () => {
  it('should have storage_key, content and created_at', () => {
    expect(columnNames(sourceDocuments)).toEqual(['storage_key', 'content', 'created_at']);
  });

  it('should have storage_key as its only primary key column', () => {
    expect(primaryKeyColumns(sourceDocuments)).toEqual(['storage_key']);
  });
});

describe('deepseek_credentials', () => {
  it('should have id, api_key and updated_at', () => {
    expect(columnNames(deepSeekCredentials)).toEqual(['id', 'api_key', 'updated_at']);
  });

  it('should have id as its only primary key column', () => {
    expect(primaryKeyColumns(deepSeekCredentials)).toEqual(['id']);
  });

  it('should have a single-row check on id', () => {
    const checkNames = getTableConfig(deepSeekCredentials).checks.map((check) => check.name);
    expect(checkNames).toContain('deepseek_credentials_single_row');
  });
});

describe('resumes', () => {
  it('should have the techspec columns', () => {
    expect(columnNames(resumes)).toEqual([
      'id',
      'user_id',
      'kind',
      'name',
      'language',
      'template',
      'length_target',
      'writing_method',
      'tone',
      'base_resume_id',
      'job_description_id',
      'generation_status',
      'generation_step',
      'failure_reason',
      'adaptation_plan',
      'adaptation_review',
      'created_at',
      'updated_at',
    ]);
  });

  it('should store adaptation_plan as jsonb', () => {
    const adaptationPlan = columnsOf(resumes).find((column) => column.name === 'adaptation_plan');
    expect(adaptationPlan?.getSQLType()).toBe('jsonb');
  });

  it('should store adaptation_review as nullable jsonb', () => {
    const adaptationReview = columnsOf(resumes).find((column) => column.name === 'adaptation_review');
    expect(adaptationReview?.getSQLType()).toBe('jsonb');
    expect(adaptationReview?.notNull).toBe(false);
  });

  it('should keep base_resume_id, job_description_id, generation_step, failure_reason, adaptation_plan and adaptation_review nullable', () => {
    const nullable = columnsOf(resumes)
      .filter((column) => !column.notNull)
      .map((column) => column.name);
    expect(nullable).toEqual([
      'base_resume_id',
      'job_description_id',
      'generation_step',
      'failure_reason',
      'adaptation_plan',
      'adaptation_review',
    ]);
  });

  it('should expose generation_step as the resume_generation_step enum', () => {
    const generationStep = columnsOf(resumes).find((column) => column.name === 'generation_step');
    expect(generationStep?.getSQLType()).toBe('resume_generation_step');
  });

  it('should define the resume_generation_step enum with the pipeline steps', () => {
    expect(resumeGenerationStep.enumValues).toEqual(['planning', 'writing', 'suggesting', 'saving']);
  });

  it('should cascade to users on delete', () => {
    expect(foreignKeyOnLocalColumn(resumes, 'user_id').onDelete).toBe('cascade');
  });

  it('should set base_resume_id to null when the base resume is deleted', () => {
    expect(foreignKeyOnLocalColumn(resumes, 'base_resume_id').onDelete).toBe('set null');
  });

  it('should cascade to job_descriptions on delete', () => {
    expect(foreignKeyOnLocalColumn(resumes, 'job_description_id').onDelete).toBe('cascade');
  });

  it('should require a job when the kind is tailored', () => {
    const checkNames = getTableConfig(resumes).checks.map((check) => check.name);
    expect(checkNames).toContain('resumes_tailored_requires_job');
  });
});

describe('resume_sections', () => {
  it('should have the techspec columns', () => {
    expect(columnNames(resumeSections)).toEqual([
      'id',
      'resume_id',
      'kind',
      'title',
      'ordinal',
      'undo_snapshot',
      'created_at',
    ]);
  });

  it('should store undo_snapshot as jsonb', () => {
    const undoSnapshot = columnsOf(resumeSections).find(
      (column) => column.name === 'undo_snapshot',
    );
    expect(undoSnapshot?.getSQLType()).toBe('jsonb');
  });

  it('should have a lookup index on resume_id', () => {
    expect(indexNamed(resumeSections, 'resume_sections_resume_id_idx')).toBeDefined();
  });

  it('should cascade to resumes on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeSections, 'resume_id').onDelete).toBe('cascade');
  });
});

describe('resume_section_skills', () => {
  it('should have section_id, skill_id and ordinal', () => {
    expect(columnNames(resumeSectionSkills)).toEqual(['section_id', 'skill_id', 'ordinal']);
  });

  it('should have a composite primary key on section_id and skill_id', () => {
    expect(primaryKeyColumns(resumeSectionSkills)).toEqual(['section_id', 'skill_id']);
  });

  it('should cascade to resume_sections and skills on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeSectionSkills, 'section_id').onDelete).toBe('cascade');
    expect(foreignKeyOnLocalColumn(resumeSectionSkills, 'skill_id').onDelete).toBe('cascade');
  });
});

describe('resume_skill_proposals', () => {
  it('should have the techspec columns', () => {
    expect(columnNames(resumeSkillProposals)).toEqual([
      'id',
      'section_id',
      'kind',
      'name',
      'group',
      'replaces_skill_id',
      'requirement_id',
      'status',
      'ordinal',
      'created_at',
    ]);
  });

  it('should keep group, replaces_skill_id and requirement_id nullable', () => {
    const nullable = columnsOf(resumeSkillProposals)
      .filter((column) => !column.notNull)
      .map((column) => column.name);
    expect(nullable).toEqual(['group', 'replaces_skill_id', 'requirement_id']);
  });

  it('should default status to pending', () => {
    const status = columnsOf(resumeSkillProposals).find((column) => column.name === 'status');
    expect(status?.notNull).toBe(true);
    expect(status?.hasDefault).toBe(true);
  });

  it('should have a unique index on section_id and lower(name)', () => {
    const unique = indexNamed(
      resumeSkillProposals,
      'resume_skill_proposals_section_lower_name_unique',
    );
    expect(unique.config.unique).toBe(true);
  });

  it('should define the swap check constraint', () => {
    const checkNames = getTableConfig(resumeSkillProposals).checks.map((check) => check.name);
    expect(checkNames).toContain('resume_skill_proposals_swap_requires_skill');
  });

  it('should cascade section_id to resume_sections on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeSkillProposals, 'section_id').onDelete).toBe('cascade');
  });

  it('should cascade replaces_skill_id to skills on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeSkillProposals, 'replaces_skill_id').onDelete).toBe(
      'cascade',
    );
  });

  it('should set requirement_id to null when the requirement is deleted', () => {
    expect(foreignKeyOnLocalColumn(resumeSkillProposals, 'requirement_id').onDelete).toBe(
      'set null',
    );
  });
});

describe('resume_entries', () => {
  it('should have the techspec columns', () => {
    expect(columnNames(resumeEntries)).toEqual([
      'id',
      'section_id',
      'ordinal',
      'experience_id',
      'education_entry_id',
      'heading',
      'created_at',
    ]);
  });

  it('should keep experience, education and heading nullable', () => {
    const nullable = columnsOf(resumeEntries)
      .filter((column) => !column.notNull)
      .map((column) => column.name);
    expect(nullable).toEqual(['experience_id', 'education_entry_id', 'heading']);
  });

  it('should have a lookup index on section_id', () => {
    expect(indexNamed(resumeEntries, 'resume_entries_section_id_idx')).toBeDefined();
  });

  it('should cascade to resume_sections on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeEntries, 'section_id').onDelete).toBe('cascade');
  });

  it('should set experience_id and education_entry_id to null on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeEntries, 'experience_id').onDelete).toBe('set null');
    expect(foreignKeyOnLocalColumn(resumeEntries, 'education_entry_id').onDelete).toBe('set null');
  });
});

describe('resume_bullets', () => {
  it('should have the techspec columns', () => {
    expect(columnNames(resumeBullets)).toEqual([
      'id',
      'entry_id',
      'ordinal',
      'text',
      'evidence_id',
      'status',
      'suggestion_question',
      'requirement_id',
      'gap_kind',
      'needs_review',
      'edited_by_person',
      'created_at',
    ]);
  });

  it('should have a lookup index on entry_id', () => {
    expect(indexNamed(resumeBullets, 'resume_bullets_entry_id_idx')).toBeDefined();
  });

  it('should cascade to resume_entries on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeBullets, 'entry_id').onDelete).toBe('cascade');
  });

  it('should set evidence_id and requirement_id to null on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeBullets, 'evidence_id').onDelete).toBe('set null');
    expect(foreignKeyOnLocalColumn(resumeBullets, 'requirement_id').onDelete).toBe('set null');
  });

  it('should default needs_review and edited_by_person to false', () => {
    const needsReview = columnsOf(resumeBullets).find((column) => column.name === 'needs_review');
    const editedByPerson = columnsOf(resumeBullets).find(
      (column) => column.name === 'edited_by_person',
    );
    expect(needsReview?.notNull).toBe(true);
    expect(needsReview?.hasDefault).toBe(true);
    expect(editedByPerson?.notNull).toBe(true);
    expect(editedByPerson?.hasDefault).toBe(true);
  });
});

describe('section_comments', () => {
  it('should have the techspec columns with a nullable resolved_at', () => {
    expect(columnNames(sectionComments)).toEqual([
      'id',
      'section_id',
      'text',
      'resolved_at',
      'created_at',
    ]);
    const resolvedAt = columnsOf(sectionComments).find((column) => column.name === 'resolved_at');
    expect(resolvedAt?.notNull).toBe(false);
  });

  it('should have a lookup index on section_id', () => {
    expect(indexNamed(sectionComments, 'section_comments_section_id_idx')).toBeDefined();
  });

  it('should cascade to resume_sections on delete', () => {
    expect(foreignKeyOnLocalColumn(sectionComments, 'section_id').onDelete).toBe('cascade');
  });
});

describe('resume_exports', () => {
  it('should have the techspec columns', () => {
    expect(columnNames(resumeExports)).toEqual(['id', 'resume_id', 'pdf', 'page_count', 'created_at']);
  });

  it('should store pdf as bytea', () => {
    const pdf = columnsOf(resumeExports).find((column) => column.name === 'pdf');
    expect(pdf?.getSQLType()).toBe('bytea');
  });

  it('should have a lookup index on resume_id', () => {
    expect(indexNamed(resumeExports, 'resume_exports_resume_id_idx')).toBeDefined();
  });

  it('should cascade to resumes on delete', () => {
    expect(foreignKeyOnLocalColumn(resumeExports, 'resume_id').onDelete).toBe('cascade');
  });
});

describe('evaluations match_score in a migrated database', () => {
  const testDatabase = 'cv_adapter_tables_match_score_test';
  const migrationsFolder = path.resolve(process.cwd(), 'migrations');
  const defaultDatabaseUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';

  function urlWithDatabase(pathname: string): string {
    const url = new URL(process.env.DATABASE_URL ?? defaultDatabaseUrl);
    url.pathname = pathname;
    return url.toString();
  }

  async function withAdminClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: urlWithDatabase('/postgres') });
    await client.connect();
    try {
      return await run(client);
    } finally {
      await client.end();
    }
  }

  function singleRow<T>(rows: T[]): T {
    const row = rows[0];
    if (!row) {
      throw new Error('Expected exactly one row');
    }
    return row;
  }

  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;

  async function seedEvaluation(matchScore: number | null): Promise<string> {
    const ownerId = crypto.randomUUID();
    await db.insert(users).values({ id: ownerId });
    const jobDescription = singleRow(
      await db
        .insert(jobDescriptions)
        .values({ userId: ownerId, rawText: 'Vaga para pessoa engenheira', language: 'pt-BR' })
        .returning(),
    );
    const careerProfile = singleRow(
      await db.insert(careerProfiles).values({ userId: ownerId }).returning(),
    );
    const evaluation = singleRow(
      await db
        .insert(evaluations)
        .values({
          userId: ownerId,
          jobDescriptionId: jobDescription.id,
          careerProfileId: careerProfile.id,
          status: 'ready',
          matchScore,
        })
        .returning(),
    );
    return evaluation.id;
  }

  beforeAll(async () => {
    await withAdminClient(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${testDatabase}" WITH (FORCE)`);
      await client.query(`CREATE DATABASE "${testDatabase}"`);
    });
    pool = new Pool({ connectionString: urlWithDatabase(`/${testDatabase}`) });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await withAdminClient((client) =>
      client.query(`DROP DATABASE IF EXISTS "${testDatabase}" WITH (FORCE)`),
    );
  });

  it('should expose match_score with an integer data type in information_schema', async () => {
    const result = await db.execute<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'evaluations'
         AND column_name = 'match_score'`,
    );
    expect(singleRow(result.rows).data_type).toBe('integer');
  });

  it('should insert an evaluation with an integer match_score and read back the same value', async () => {
    const evaluationId = await seedEvaluation(72);
    const evaluation = singleRow(
      await db.select().from(evaluations).where(eq(evaluations.id, evaluationId)),
    );
    expect(evaluation.matchScore).toBe(72);
  });

  it('should accept a null match_score for an evaluation without a score', async () => {
    const evaluationId = await seedEvaluation(null);
    const evaluation = singleRow(
      await db.select().from(evaluations).where(eq(evaluations.id, evaluationId)),
    );
    expect(evaluation.matchScore).toBeNull();
  });
});
