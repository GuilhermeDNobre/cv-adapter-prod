import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from './index';
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
  users,
} from './tables';
import { LOCAL_USER_ID } from './local-user';

const TEST_DATABASE = 'cv_adapter_schema_migration_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';

function urlWithDatabase(pathname: string): string {
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
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

type SeededIds = {
  userId: string;
  jobDescriptionId: string;
  requirementId: string;
  careerProfileId: string;
  experienceId: string;
  evidenceId: string;
  resumeImportId: string;
  evaluationId: string;
  coverageId: string;
};

let pool: Pool;
let db: NodePgDatabase<typeof schema>;

async function seedFullChain(): Promise<SeededIds> {
  const ownerId = randomUUID();
  await db.insert(users).values({ id: ownerId });
  const jobDescription = singleRow(
    await db
      .insert(jobDescriptions)
      .values({ userId: ownerId, rawText: 'Vaga para pessoa engenheira', language: 'pt-BR' })
      .returning(),
  );
  const requirement = singleRow(
    await db
      .insert(requirements)
      .values({
        jobDescriptionId: jobDescription.id,
        literalTerm: 'PostgreSQL',
        concept: 'Relational database experience',
        normalizedConcept: 'postgresql',
        kind: 'mandatory',
        ordinal: 0,
      })
      .returning(),
  );
  const careerProfile = singleRow(
    await db.insert(careerProfiles).values({ userId: ownerId }).returning(),
  );
  await db.insert(contactDetails).values({
    careerProfileId: careerProfile.id,
    fullName: 'Maria Silva',
    email: 'contact@example.com',
    phone: '+55 11 99999-0000',
    city: 'Quixadá, CE',
    links: { linkedin: 'https://linkedin.com/in/maria-silva' },
  });
  const experience = singleRow(
    await db
      .insert(experiences)
      .values({
        careerProfileId: careerProfile.id,
        company: 'Acme',
        role: 'Engineer',
        startedOn: '2022-01-01',
        endedOn: null,
      })
      .returning(),
  );
  await db.insert(educationEntries).values({
    careerProfileId: careerProfile.id,
    institution: 'USP',
    degree: 'Computer Science',
    startedOn: '2016-01-01',
    endedOn: '2019-12-31',
  });
  const evidence = singleRow(
    await db
      .insert(evidences)
      .values({
        careerProfileId: careerProfile.id,
        experienceId: experience.id,
        statement: 'Ran a PostgreSQL cluster serving 10M queries per day',
      })
      .returning(),
  );
  const resumeImport = singleRow(
    await db
      .insert(resumeImports)
      .values({
        userId: ownerId,
        storageKey: 'source-documents/latest.pdf',
        status: 'ready_for_review',
        draft: { evidences: [evidence.statement] },
      })
      .returning(),
  );
  const evaluation = singleRow(
    await db
      .insert(evaluations)
      .values({
        userId: ownerId,
        jobDescriptionId: jobDescription.id,
        careerProfileId: careerProfile.id,
        status: 'ready',
        matchScore: 100,
      })
      .returning(),
  );
  const coverage = singleRow(
    await db
      .insert(requirementCoverages)
      .values({
        evaluationId: evaluation.id,
        requirementId: requirement.id,
        coverage: 'covered',
        evidenceId: evidence.id,
        rationale: 'Evidence cites a PostgreSQL cluster at scale',
      })
      .returning(),
  );
  await db.insert(deniedRequirements).values({
    careerProfileId: careerProfile.id,
    normalizedConcept: 'kubernetes',
  });
  return {
    userId: ownerId,
    jobDescriptionId: jobDescription.id,
    requirementId: requirement.id,
    careerProfileId: careerProfile.id,
    experienceId: experience.id,
    evidenceId: evidence.id,
    resumeImportId: resumeImport.id,
    evaluationId: evaluation.id,
    coverageId: coverage.id,
  };
}

beforeAll(async () => {
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  });
  pool = new Pool({ connectionString: urlWithDatabase(`/${TEST_DATABASE}`) });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}, 120_000);

afterAll(async () => {
  await pool.end();
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`),
  );
});

describe('initial migration', () => {
  it('should create exactly the 25 tables in a clean database', async () => {
    const result = await db.execute<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name <> '__drizzle_migrations'`,
    );
    const names = result.rows.map((row) => row.table_name).sort();
    expect(names).toEqual(
      [
        'career_profiles',
        'certifications',
        'contact_details',
        'deepseek_credentials',
        'denied_requirements',
        'education_entries',
        'evaluations',
        'evidences',
        'experiences',
        'job_descriptions',
        'languages',
        'requirement_coverages',
        'requirements',
        'resume_imports',
        'resume_bullets',
        'resume_entries',
        'resume_exports',
        'resume_section_skills',
        'resume_sections',
        'resume_skill_proposals',
        'resumes',
        'section_comments',
        'skills',
        'source_documents',
        'users',
      ].sort(),
    );
  });

  it('should create exactly the 18 techspec enums', async () => {
    const result = await db.execute<{ typname: string }>(
      `SELECT DISTINCT t.typname FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typnamespace = 'public'::regnamespace`,
    );
    const names = result.rows.map((row) => row.typname).sort();
    expect(names).toEqual(
      [
        'bullet_status',
        'coverage_level',
        'evaluation_failure_reason',
        'evaluation_status',
        'gap_kind',
        'import_failure_reason',
        'import_status',
        'requirement_kind',
        'resume_generation_status',
        'resume_generation_step',
        'resume_kind',
        'resume_language',
        'resume_section_kind',
        'resume_template',
        'resume_tone',
        'skill_proposal_kind',
        'skill_proposal_status',
        'writing_method',
      ].sort(),
    );
  });

  it('should seed the local user row', async () => {
    const [localUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, LOCAL_USER_ID));
    expect(localUser).toBeDefined();
    expect(localUser?.id).toBe(LOCAL_USER_ID);
  });

  it('should be idempotent when run again', async () => {
    await expect(migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })).resolves.toBeUndefined();
  });
});

describe('failure reason enums', () => {
  it('should contain the AI values at the end of import_failure_reason', async () => {
    const result = await db.execute<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'import_failure_reason'
       ORDER BY e.enumsortorder`,
    );
    const labels = result.rows.map((row) => row.enumlabel);
    expect(labels).toEqual([
      'no_text_layer',
      'unsupported_format',
      'too_large',
      'not_a_resume',
      'extraction_empty',
      'ai_key_rejected',
      'ai_balance_exhausted',
      'ai_unavailable',
    ]);
  });

  it('should contain the AI values and nothing to rewrite in evaluation_failure_reason', async () => {
    const result = await db.execute<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'evaluation_failure_reason'
       ORDER BY e.enumsortorder`,
    );
    const labels = result.rows.map((row) => row.enumlabel);
    expect(labels).toEqual(['ai_key_rejected', 'ai_balance_exhausted', 'ai_unavailable', 'nothing_to_rewrite', 'rewrite_claims_rejected']);
  });
});

describe('deepseek_credentials single row', () => {
  it('should refuse a second row with a different id', async () => {
    await db.insert(deepSeekCredentials).values({ apiKey: 'sk-first-key' });
    try {
      const second = db.insert(deepSeekCredentials).values({ id: 2, apiKey: 'sk-second-key' });
      await expect(second).rejects.toThrow(/23514|check|deepseek_credentials_single_row/i);
    } finally {
      await db.delete(deepSeekCredentials);
    }
  });
});

describe('row round-trip', () => {
  it('should insert and read back one row of every table', async () => {
    const ids = await seedFullChain();

    const user = singleRow(await db.select().from(users).where(eq(users.id, ids.userId)));
    const jobDescription = singleRow(
      await db.select().from(jobDescriptions).where(eq(jobDescriptions.id, ids.jobDescriptionId)),
    );
    const requirement = singleRow(
      await db.select().from(requirements).where(eq(requirements.id, ids.requirementId)),
    );
    const contact = singleRow(
      await db
        .select()
        .from(contactDetails)
        .where(eq(contactDetails.careerProfileId, ids.careerProfileId)),
    );
    const experience = singleRow(
      await db.select().from(experiences).where(eq(experiences.id, ids.experienceId)),
    );
    const education = singleRow(
      await db
        .select()
        .from(educationEntries)
        .where(eq(educationEntries.careerProfileId, ids.careerProfileId)),
    );
    const evidence = singleRow(
      await db.select().from(evidences).where(eq(evidences.id, ids.evidenceId)),
    );
    const resumeImport = singleRow(
      await db
        .select()
        .from(resumeImports)
        .where(eq(resumeImports.id, ids.resumeImportId)),
    );
    const evaluation = singleRow(
      await db.select().from(evaluations).where(eq(evaluations.id, ids.evaluationId)),
    );
    const coverage = singleRow(
      await db
        .select()
        .from(requirementCoverages)
        .where(eq(requirementCoverages.id, ids.coverageId)),
    );
    const denied = singleRow(
      await db
        .select()
        .from(deniedRequirements)
        .where(eq(deniedRequirements.careerProfileId, ids.careerProfileId)),
    );

    expect(user.id).toBe(ids.userId);
    expect(jobDescription.language).toBe('pt-BR');
    expect(requirement.kind).toBe('mandatory');
    expect(contact.fullName).toBe('Maria Silva');
    expect(contact.city).toBe('Quixadá, CE');
    expect(experience.company).toBe('Acme');
    expect(education.institution).toBe('USP');
    expect(evidence.statement).toContain('PostgreSQL');
    expect(resumeImport.status).toBe('ready_for_review');
    expect(evaluation.matchScore).toBe(100);
    expect(coverage.coverage).toBe('covered');
    expect(denied.normalizedConcept).toBe('kubernetes');
  });
});

describe('contact_details city', () => {
  it('should expose city as nullable text in information_schema', async () => {
    const result = await db.execute<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'contact_details'
         AND column_name = 'city'`,
    );
    const row = singleRow(result.rows);
    expect(row.data_type).toBe('text');
    expect(row.is_nullable).toBe('YES');
  });

  it('should accept a null city for a profile without a city', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const profile = singleRow(await db.insert(careerProfiles).values({ userId: ownerId }).returning());
    const [contact] = await db
      .insert(contactDetails)
      .values({ careerProfileId: profile.id, fullName: 'Sem Cidade' })
      .returning();
    expect(contact?.city).toBeNull();
  });
});

describe('constraints', () => {
  it('should reject contact_details for an unknown career_profile_id', async () => {
    const attempt = db
      .insert(contactDetails)
      .values({ careerProfileId: randomUUID(), fullName: 'Ninguém' });
    await expect(attempt).rejects.toThrow(/23503|foreign key/i);
  });

  it('should reject a duplicate composite key in denied_requirements', async () => {
    const ids = await seedFullChain();
    const duplicate = db.insert(deniedRequirements).values({
      careerProfileId: ids.careerProfileId,
      normalizedConcept: 'kubernetes',
    });
    await expect(duplicate).rejects.toThrow(/23505|duplicate key/i);
  });
});

describe('cascade on user deletion', () => {
  it('should remove career profile, imports and evaluations with the user', async () => {
    const ids = await seedFullChain();

    await db.delete(users).where(eq(users.id, ids.userId));

    const remaining = await Promise.all([
      db.select().from(careerProfiles).where(eq(careerProfiles.id, ids.careerProfileId)),
      db.select().from(jobDescriptions).where(eq(jobDescriptions.id, ids.jobDescriptionId)),
      db.select().from(requirements).where(eq(requirements.id, ids.requirementId)),
      db.select().from(resumeImports).where(eq(resumeImports.id, ids.resumeImportId)),
      db.select().from(evaluations).where(eq(evaluations.id, ids.evaluationId)),
      db.select().from(requirementCoverages).where(inArray(requirementCoverages.id, [ids.coverageId])),
      db.select().from(evidences).where(eq(evidences.id, ids.evidenceId)),
      db
        .select()
        .from(deniedRequirements)
        .where(eq(deniedRequirements.careerProfileId, ids.careerProfileId)),
    ]);
    for (const rows of remaining) {
      expect(rows).toEqual([]);
    }
  });
});

async function seedBaseResume(ownerId: string) {
  return singleRow(
    await db
      .insert(resumes)
      .values({
        userId: ownerId,
        kind: 'base',
        name: 'Backend focus',
        language: 'pt',
        template: 'comfortable',
        lengthTarget: 2,
        writingMethod: 'xyz',
        tone: 'direct',
        generationStatus: 'ready',
      })
      .returning(),
  );
}

async function seedTailoredResume(ownerId: string, baseResumeId: string, jobId: string) {
  return singleRow(
    await db
      .insert(resumes)
      .values({
        userId: ownerId,
        kind: 'tailored',
        name: 'Backend at Acme',
        language: 'pt',
        template: 'comfortable',
        lengthTarget: 1,
        writingMethod: 'star',
        tone: 'formal',
        baseResumeId,
        jobDescriptionId: jobId,
        generationStatus: 'ready',
      })
      .returning(),
  );
}

describe('resumes tailored check', () => {
  it('should reject a tailored resume without a job_description_id', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const attempt = db.insert(resumes).values({
      userId: ownerId,
      kind: 'tailored',
      name: 'Orphan tailored',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      generationStatus: 'ready',
    });
    await expect(attempt).rejects.toThrow(/23514|check|resumes_tailored_requires_job/i);
  });

  it('should accept a base resume without a job_description_id', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const base = await seedBaseResume(ownerId);
    expect(base.jobDescriptionId).toBeNull();
  });
});

describe('resumes cascade rules', () => {
  it('should delete the tailored resume when its job description is deleted', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const job = singleRow(
      await db
        .insert(jobDescriptions)
        .values({ userId: ownerId, rawText: 'Vaga backend', language: 'pt-BR' })
        .returning(),
    );
    const base = await seedBaseResume(ownerId);
    const tailored = await seedTailoredResume(ownerId, base.id, job.id);
    await db.delete(jobDescriptions).where(eq(jobDescriptions.id, job.id));
    const remaining = await db.select().from(resumes).where(eq(resumes.id, tailored.id));
    expect(remaining).toEqual([]);
  });

  it('should keep the tailored resume with a null base_resume_id when the base is deleted', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const job = singleRow(
      await db
        .insert(jobDescriptions)
        .values({ userId: ownerId, rawText: 'Vaga backend', language: 'pt-BR' })
        .returning(),
    );
    const base = await seedBaseResume(ownerId);
    const tailored = await seedTailoredResume(ownerId, base.id, job.id);
    await db.delete(resumes).where(eq(resumes.id, base.id));
    const kept = singleRow(await db.select().from(resumes).where(eq(resumes.id, tailored.id)));
    expect(kept.baseResumeId).toBeNull();
  });
});

describe('resumes adaptation_review', () => {
  it('should expose adaptation_review as nullable jsonb in information_schema', async () => {
    const result = await db.execute<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'resumes'
         AND column_name = 'adaptation_review'`,
    );
    const row = singleRow(result.rows);
    expect(row.data_type).toBe('jsonb');
    expect(row.is_nullable).toBe('YES');
  });

  it('should write and read back an adaptation review', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const base = await seedBaseResume(ownerId);
    const job = singleRow(
      await db
        .insert(jobDescriptions)
        .values({ userId: ownerId, rawText: 'Vaga backend', language: 'pt-BR' })
        .returning(),
    );
    const evidenceId = randomUUID();
    const bulletId = randomUUID();
    const review = {
      [evidenceId]: {
        decision: 'rejected',
        decidedAt: '2026-09-22T00:00:00.000Z',
        snapshot: [{ entryId: randomUUID(), ordinal: 0, text: 'Led a team', bulletId }],
      },
    };
    const [tailored] = await db
      .insert(resumes)
      .values({
        userId: ownerId,
        kind: 'tailored',
        name: 'Tailored',
        language: 'en',
        template: 'comfortable',
        lengthTarget: 1,
        writingMethod: 'xyz',
        tone: 'direct',
        baseResumeId: base.id,
        jobDescriptionId: job.id,
        generationStatus: 'ready',
        adaptationPlan: null,
        adaptationReview: review,
      })
      .returning();
    expect(tailored).toBeDefined();
    const [readBack] = await db.select().from(resumes).where(eq(resumes.id, tailored!.id));
    expect(readBack?.adaptationReview).toEqual(review);
  });
});

describe('resume document round-trip', () => {
  it('should insert and read back sections, entries, bullets, comments and exports', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const base = await seedBaseResume(ownerId);
    const section = singleRow(
      await db
        .insert(resumeSections)
        .values({ resumeId: base.id, kind: 'experience', ordinal: 0 })
        .returning(),
    );
    const entry = singleRow(
      await db.insert(resumeEntries).values({ sectionId: section.id, ordinal: 0 }).returning(),
    );
    const bullet = singleRow(
      await db
        .insert(resumeBullets)
        .values({ entryId: entry.id, ordinal: 0, text: 'Led a team', status: 'assumed' })
        .returning(),
    );
    const comment = singleRow(
      await db
        .insert(sectionComments)
        .values({ sectionId: section.id, text: 'Shorter, highlight leadership' })
        .returning(),
    );
    const exported = singleRow(
      await db
        .insert(resumeExports)
        .values({ resumeId: base.id, pdf: Buffer.from('%PDF-1.4'), pageCount: 1 })
        .returning(),
    );
    expect(section.resumeId).toBe(base.id);
    expect(entry.sectionId).toBe(section.id);
    expect(bullet.entryId).toBe(entry.id);
    expect(bullet.needsReview).toBe(false);
    expect(bullet.editedByPerson).toBe(false);
    expect(comment.sectionId).toBe(section.id);
    expect(exported.resumeId).toBe(base.id);
    expect(exported.pageCount).toBe(1);
  });
});

describe('migration journal consistency', () => {
  it('should have a sql file and a snapshot for every journal entry, and no orphan sql file', () => {
    const journalRaw = fs.readFileSync(
      path.resolve(MIGRATIONS_FOLDER, 'meta', '_journal.json'),
      'utf8',
    );
    const journal = JSON.parse(journalRaw) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    for (const entry of journal.entries) {
      const tag = entry.tag;
      expect(
        fs.existsSync(path.resolve(MIGRATIONS_FOLDER, `${tag}.sql`)),
        `missing sql for journal entry ${tag}`,
      ).toBe(true);
      const snapshotName = `${String(entry.idx).padStart(4, '0')}_snapshot.json`;
      expect(
        fs.existsSync(path.resolve(MIGRATIONS_FOLDER, 'meta', snapshotName)),
        `missing snapshot for journal entry ${tag}`,
      ).toBe(true);
    }
    const sqlFiles = fs
      .readdirSync(MIGRATIONS_FOLDER)
      .filter((name) => name.endsWith('.sql'));
    const journalTags = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
    for (const sqlFile of sqlFiles) {
      expect(journalTags.has(sqlFile), `orphan sql file ${sqlFile}`).toBe(true);
    }
  });
});

function statementsOf(tag: string): string[] {
  const sql = fs.readFileSync(path.resolve(MIGRATIONS_FOLDER, `${tag}.sql`), 'utf8');
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function createFreshDatabase(database: string): Promise<Pool> {
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${database}"`);
  });
  return new Pool({ connectionString: urlWithDatabase(`/${database}`) });
}

describe('0001 ownerless job reassignment', () => {
  it('should reassign an ownerless job to the local user and seed exactly one local user', async () => {
    const database = `cv_adapter_0001_ownerless_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const ownerlessPool = await createFreshDatabase(database);
    try {
      for (const statement of statementsOf('0000_third_sphinx')) {
        await ownerlessPool.query(statement);
      }
      await ownerlessPool.query(
        `INSERT INTO job_descriptions (raw_text, guest_token_hash, language) VALUES ('vaga', 'hash', 'pt-BR')`,
      );
      for (const statement of statementsOf('0001_remove_auth')) {
        await ownerlessPool.query(statement);
      }
      const jobs = await ownerlessPool.query(
        `SELECT user_id FROM job_descriptions WHERE raw_text = 'vaga'`,
      );
      expect(jobs.rows[0]?.user_id).toBe(LOCAL_USER_ID);
      const localUsers = await ownerlessPool.query(`SELECT id FROM users WHERE id = '${LOCAL_USER_ID}'`);
      expect(localUsers.rows).toHaveLength(1);
      const userCount = await ownerlessPool.query(`SELECT COUNT(*)::int AS count FROM users`);
      expect(userCount.rows[0]?.count).toBe(1);
    } finally {
      await ownerlessPool.end();
      await withAdminClient((client) =>
        client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
      );
    }
  });

  it('should succeed when there is no ownerless job to reassign', async () => {
    const database = `cv_adapter_0001_empty_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const emptyPool = await createFreshDatabase(database);
    try {
      for (const statement of statementsOf('0000_third_sphinx')) {
        await emptyPool.query(statement);
      }
      for (const statement of statementsOf('0001_remove_auth')) {
        await emptyPool.query(statement);
      }
      const localUsers = await emptyPool.query(`SELECT id FROM users WHERE id = '${LOCAL_USER_ID}'`);
      expect(localUsers.rows).toHaveLength(1);
    } finally {
      await emptyPool.end();
      await withAdminClient((client) =>
        client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
      );
    }
  });

  it('should keep the seeded row when the local user already exists', async () => {
    const database = `cv_adapter_0001_conflict_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const conflictPool = await createFreshDatabase(database);
    try {
      for (const statement of statementsOf('0000_third_sphinx')) {
        await conflictPool.query(statement);
      }
      await conflictPool.query(
        `INSERT INTO users (id, google_sub, email) VALUES ('${LOCAL_USER_ID}', 'local', 'local@localhost') ON CONFLICT ("id") DO NOTHING`,
      );
      for (const statement of statementsOf('0001_remove_auth')) {
        await conflictPool.query(statement);
      }
      const localUsers = await conflictPool.query(`SELECT id FROM users WHERE id = '${LOCAL_USER_ID}'`);
      expect(localUsers.rows).toHaveLength(1);
    } finally {
      await conflictPool.end();
      await withAdminClient((client) =>
        client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
      );
    }
  });

  it('should keep a legacy identity user and profile under the old id', async () => {
    const database = `cv_adapter_0001_legacy_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const legacyPool = await createFreshDatabase(database);
    try {
      for (const statement of statementsOf('0000_third_sphinx')) {
        await legacyPool.query(statement);
      }
      const legacyUserId = randomUUID();
      await legacyPool.query(
        `INSERT INTO users (id, google_sub, email) VALUES ('${legacyUserId}', 'identity-123', 'legacy@example.com')`,
      );
      await legacyPool.query(
        `INSERT INTO career_profiles (user_id) VALUES ('${legacyUserId}')`,
      );
      for (const statement of statementsOf('0001_remove_auth')) {
        await legacyPool.query(statement);
      }
      const profiles = await legacyPool.query(
        `SELECT user_id FROM career_profiles WHERE user_id = '${legacyUserId}'`,
      );
      expect(profiles.rows).toHaveLength(1);
      const localUsers = await legacyPool.query(`SELECT id FROM users WHERE id = '${LOCAL_USER_ID}'`);
      expect(localUsers.rows).toHaveLength(1);
    } finally {
      await legacyPool.end();
      await withAdminClient((client) =>
        client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
      );
    }
  });
});

describe('skills, languages and certifications round-trip', () => {
  it('should expose writing_style as nullable jsonb in information_schema', async () => {
    const result = await db.execute<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'resume_imports'
         AND column_name = 'writing_style'`,
    );
    const row = singleRow(result.rows);
    expect(row.data_type).toBe('jsonb');
    expect(row.is_nullable).toBe('YES');
  });

  it('should write and read back a writing_style', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const style = { writingMethod: 'star', tone: 'direct', averageBulletWords: 18 };
    const [created] = await db
      .insert(resumeImports)
      .values({ userId: ownerId, status: 'ready_for_review', writingStyle: style })
      .returning();
    expect(created).toBeDefined();
    const [readBack] = await db
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, created!.id));
    expect(readBack?.writingStyle).toEqual(style);
  });

  it('should insert and read back skills, languages and certifications', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const profile = singleRow(await db.insert(careerProfiles).values({ userId: ownerId }).returning());
    const skill = singleRow(
      await db
        .insert(skills)
        .values({ careerProfileId: profile.id, name: 'Node.js', group: 'Backend' })
        .returning(),
    );
    const language = singleRow(
      await db
        .insert(languages)
        .values({ careerProfileId: profile.id, name: 'English', level: 'Fluent' })
        .returning(),
    );
    const certification = singleRow(
      await db
        .insert(certifications)
        .values({ careerProfileId: profile.id, name: 'AWS SAA', issuer: 'Amazon', year: '2023' })
        .returning(),
    );
    expect(skill.name).toBe('Node.js');
    expect(skill.group).toBe('Backend');
    expect(language.level).toBe('Fluent');
    expect(certification.issuer).toBe('Amazon');
    expect(certification.year).toBe('2023');
  });

  it('should reject a duplicate skill name with different case for the same profile', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const profile = singleRow(await db.insert(careerProfiles).values({ userId: ownerId }).returning());
    await db.insert(skills).values({ careerProfileId: profile.id, name: 'React' });
    const duplicate = db
      .insert(skills)
      .values({ careerProfileId: profile.id, name: 'react' });
    await expect(duplicate).rejects.toThrow(/23505|duplicate key/i);
  });

  it('should accept the same skill name for different profiles', async () => {
    const firstOwner = randomUUID();
    await db.insert(users).values({ id: firstOwner });
    const firstProfile = singleRow(
      await db.insert(careerProfiles).values({ userId: firstOwner }).returning(),
    );
    const secondOwner = randomUUID();
    await db.insert(users).values({ id: secondOwner });
    const secondProfile = singleRow(
      await db.insert(careerProfiles).values({ userId: secondOwner }).returning(),
    );
    await db.insert(skills).values({ careerProfileId: firstProfile.id, name: 'React' });
    const second = singleRow(
      await db.insert(skills).values({ careerProfileId: secondProfile.id, name: 'react' }).returning(),
    );
    expect(second.careerProfileId).toBe(secondProfile.id);
  });

  it('should expose the skills unique index in pg_indexes', async () => {
    const result = await db.execute<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'skills'`,
    );
    const names = result.rows.map((row) => row.indexname);
    expect(names).toContain('skills_profile_lower_name_unique');
  });

  it('should contain free in the writing_method enum', async () => {
    const result = await db.execute<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'writing_method'
       ORDER BY e.enumsortorder`,
    );
    const labels = result.rows.map((row) => row.enumlabel);
    expect(labels).toEqual(['star', 'xyz', 'car', 'apr', 'free']);
  });
});

describe('resume_section_skills round-trip', () => {
  it('should link a skill to a section and reject a duplicate link', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const profile = singleRow(await db.insert(careerProfiles).values({ userId: ownerId }).returning());
    const skill = singleRow(
      await db.insert(skills).values({ careerProfileId: profile.id, name: 'PostgreSQL' }).returning(),
    );
    const base = await seedBaseResume(ownerId);
    const section = singleRow(
      await db.insert(resumeSections).values({ resumeId: base.id, kind: 'skills', ordinal: 0 }).returning(),
    );
    const link = singleRow(
      await db
        .insert(resumeSectionSkills)
        .values({ sectionId: section.id, skillId: skill.id, ordinal: 0 })
        .returning(),
    );
    expect(link.sectionId).toBe(section.id);
    expect(link.skillId).toBe(skill.id);
    const duplicate = db
      .insert(resumeSectionSkills)
      .values({ sectionId: section.id, skillId: skill.id, ordinal: 1 });
    await expect(duplicate).rejects.toThrow(/23505|duplicate key/i);
  });
});

describe('resume_skill_proposals round-trip', () => {
  async function seedProposalContext() {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const profile = singleRow(
      await db.insert(careerProfiles).values({ userId: ownerId }).returning(),
    );
    const skill = singleRow(
      await db.insert(skills).values({ careerProfileId: profile.id, name: 'NestJS' }).returning(),
    );
    const job = singleRow(
      await db
        .insert(jobDescriptions)
        .values({ userId: ownerId, rawText: 'Vaga backend', language: 'pt-BR' })
        .returning(),
    );
    const requirement = singleRow(
      await db
        .insert(requirements)
        .values({
          jobDescriptionId: job.id,
          literalTerm: 'Fastify',
          concept: 'Fastify experience',
          normalizedConcept: 'fastify',
          kind: 'mandatory',
          ordinal: 0,
        })
        .returning(),
    );
    const base = await seedBaseResume(ownerId);
    const section = singleRow(
      await db
        .insert(resumeSections)
        .values({ resumeId: base.id, kind: 'skills', ordinal: 0 })
        .returning(),
    );
    return { ownerId, profile, skill, job, requirement, base, section };
  }

  it('should insert valid addition and swap proposals', async () => {
    const context = await seedProposalContext();
    const addition = singleRow(
      await db
        .insert(resumeSkillProposals)
        .values({
          sectionId: context.section.id,
          kind: 'addition',
          name: 'Fastify',
          group: 'Back-end',
          requirementId: context.requirement.id,
          ordinal: 0,
        })
        .returning(),
    );
    const swap = singleRow(
      await db
        .insert(resumeSkillProposals)
        .values({
          sectionId: context.section.id,
          kind: 'swap',
          name: 'Vitest',
          group: null,
          replacesSkillId: context.skill.id,
          requirementId: context.requirement.id,
          status: 'pending',
          ordinal: 1,
        })
        .returning(),
    );
    expect(addition.kind).toBe('addition');
    expect(addition.name).toBe('Fastify');
    expect(addition.replacesSkillId).toBeNull();
    expect(swap.kind).toBe('swap');
    expect(swap.replacesSkillId).toBe(context.skill.id);
  });

  it('should reject a swap without replaces_skill_id', async () => {
    const context = await seedProposalContext();
    const attempt = db.insert(resumeSkillProposals).values({
      sectionId: context.section.id,
      kind: 'swap',
      name: 'Fastify',
      requirementId: context.requirement.id,
      ordinal: 0,
    });
    await expect(attempt).rejects.toThrow(/23514|check|resume_skill_proposals_swap/i);
  });

  it('should reject an addition with replaces_skill_id', async () => {
    const context = await seedProposalContext();
    const attempt = db.insert(resumeSkillProposals).values({
      sectionId: context.section.id,
      kind: 'addition',
      name: 'Fastify',
      replacesSkillId: context.skill.id,
      requirementId: context.requirement.id,
      ordinal: 0,
    });
    await expect(attempt).rejects.toThrow(/23514|check|resume_skill_proposals_swap/i);
  });

  it('should reject a duplicate name with different case in the same section', async () => {
    const context = await seedProposalContext();
    await db.insert(resumeSkillProposals).values({
      sectionId: context.section.id,
      kind: 'addition',
      name: 'Fastify',
      requirementId: context.requirement.id,
      ordinal: 0,
    });
    const duplicate = db.insert(resumeSkillProposals).values({
      sectionId: context.section.id,
      kind: 'addition',
      name: 'fastify',
      requirementId: context.requirement.id,
      ordinal: 1,
    });
    await expect(duplicate).rejects.toThrow(/23505|duplicate key/i);
  });

  it('should delete proposals when the section is deleted', async () => {
    const context = await seedProposalContext();
    const proposal = singleRow(
      await db
        .insert(resumeSkillProposals)
        .values({
          sectionId: context.section.id,
          kind: 'addition',
          name: 'Fastify',
          requirementId: context.requirement.id,
          ordinal: 0,
        })
        .returning(),
    );
    await db.delete(resumeSections).where(eq(resumeSections.id, context.section.id));
    const remaining = await db
      .select()
      .from(resumeSkillProposals)
      .where(eq(resumeSkillProposals.id, proposal.id));
    expect(remaining).toEqual([]);
  });

  it('should delete the swap when the skill is deleted', async () => {
    const context = await seedProposalContext();
    const proposal = singleRow(
      await db
        .insert(resumeSkillProposals)
        .values({
          sectionId: context.section.id,
          kind: 'swap',
          name: 'Fastify',
          replacesSkillId: context.skill.id,
          requirementId: context.requirement.id,
          ordinal: 0,
        })
        .returning(),
    );
    await db.delete(skills).where(eq(skills.id, context.skill.id));
    const remaining = await db
      .select()
      .from(resumeSkillProposals)
      .where(eq(resumeSkillProposals.id, proposal.id));
    expect(remaining).toEqual([]);
  });

  it('should set requirement_id to null when the requirement is deleted', async () => {
    const context = await seedProposalContext();
    const proposal = singleRow(
      await db
        .insert(resumeSkillProposals)
        .values({
          sectionId: context.section.id,
          kind: 'addition',
          name: 'Fastify',
          requirementId: context.requirement.id,
          ordinal: 0,
        })
        .returning(),
    );
    await db.delete(requirements).where(eq(requirements.id, context.requirement.id));
    const kept = singleRow(
      await db.select().from(resumeSkillProposals).where(eq(resumeSkillProposals.id, proposal.id)),
    );
    expect(kept.requirementId).toBeNull();
  });

  it('should default status to pending', async () => {
    const context = await seedProposalContext();
    const proposal = singleRow(
      await db
        .insert(resumeSkillProposals)
        .values({
          sectionId: context.section.id,
          kind: 'addition',
          name: 'Fastify',
          requirementId: context.requirement.id,
          ordinal: 0,
        })
        .returning(),
    );
    expect(proposal.status).toBe('pending');
  });
});

describe('base_resume_proposal column', () => {
  it('should expose base_resume_proposal as nullable jsonb in information_schema', async () => {
    const result = await db.execute<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'resume_imports'
         AND column_name = 'base_resume_proposal'`,
    );
    const row = singleRow(result.rows);
    expect(row.data_type).toBe('jsonb');
    expect(row.is_nullable).toBe('YES');
  });

  it('should write and read back a proposal record', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const record = {
      status: 'ready',
      proposal: {
        name: 'Engineer at Acme',
        language: 'en',
        style: { writingMethod: 'xyz', tone: 'direct', averageBulletWords: 12 },
        sections: [],
      },
      failureReason: null,
    };
    const [created] = await db
      .insert(resumeImports)
      .values({ userId: ownerId, status: 'confirmed', baseResumeProposal: record })
      .returning();
    expect(created).toBeDefined();
    const [readBack] = await db
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, created!.id));
    expect(readBack?.baseResumeProposal).toEqual(record);
  });
});

function journalTagsInOrder(): string[] {
  const journalRaw = fs.readFileSync(
    path.resolve(MIGRATIONS_FOLDER, 'meta', '_journal.json'),
    'utf8',
  );
  const journal = JSON.parse(journalRaw) as { entries: Array<{ idx: number; tag: string }> };
  return journal.entries
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => entry.tag);
}

describe('0009 contact_details links conversion', () => {
  it('should convert ["https://x"] to [{"title":null,"url":"https://x"}]', async () => {
    const database = `cv_adapter_0009_links_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const linksPool = await createFreshDatabase(database);
    try {
      const tags = journalTagsInOrder();
      const targetIndex = tags.findIndex((tag) => tag.startsWith('0009_'));
      if (targetIndex === -1) {
        throw new Error('Expected the 0009 migration tag');
      }
      const before = tags.slice(0, targetIndex);
      const last = tags[targetIndex];
      if (last === undefined) {
        throw new Error('Expected at least one migration tag');
      }
      for (const tag of before) {
        for (const statement of statementsOf(tag)) {
          await linksPool.query(statement);
        }
      }
      const ownerId = randomUUID();
      await linksPool.query(`INSERT INTO users (id) VALUES ('${ownerId}')`);
      const profileResult = await linksPool.query(
        `INSERT INTO career_profiles (user_id) VALUES ('${ownerId}') RETURNING id`,
      );
      const profileId = profileResult.rows[0]?.id as string;
      await linksPool.query(
        `INSERT INTO contact_details (career_profile_id, full_name, links) VALUES ('${profileId}', 'Link Owner', '["https://x"]')`,
      );
      for (const statement of statementsOf(last)) {
        await linksPool.query(statement);
      }
      const converted = await linksPool.query(
        `SELECT links FROM contact_details WHERE career_profile_id = '${profileId}'`,
      );
      expect(converted.rows[0]?.links).toEqual([{ title: null, url: 'https://x' }]);
    } finally {
      await linksPool.end();
      await withAdminClient((client) =>
        client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
      );
    }
  });

  it('should keep null links as null', async () => {
    const database = `cv_adapter_0009_null_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const nullPool = await createFreshDatabase(database);
    try {
      const tags = journalTagsInOrder();
      const targetIndex = tags.findIndex((tag) => tag.startsWith('0009_'));
      if (targetIndex === -1) {
        throw new Error('Expected the 0009 migration tag');
      }
      const before = tags.slice(0, targetIndex);
      const last = tags[targetIndex];
      if (last === undefined) {
        throw new Error('Expected at least one migration tag');
      }
      for (const tag of before) {
        for (const statement of statementsOf(tag)) {
          await nullPool.query(statement);
        }
      }
      const ownerId = randomUUID();
      await nullPool.query(`INSERT INTO users (id) VALUES ('${ownerId}')`);
      const profileResult = await nullPool.query(
        `INSERT INTO career_profiles (user_id) VALUES ('${ownerId}') RETURNING id`,
      );
      const profileId = profileResult.rows[0]?.id as string;
      await nullPool.query(
        `INSERT INTO contact_details (career_profile_id, full_name, links) VALUES ('${profileId}', 'No Links', NULL)`,
      );
      for (const statement of statementsOf(last)) {
        await nullPool.query(statement);
      }
      const kept = await nullPool.query(
        `SELECT links FROM contact_details WHERE career_profile_id = '${profileId}'`,
      );
      expect(kept.rows[0]?.links).toBeNull();
    } finally {
      await nullPool.end();
      await withAdminClient((client) =>
        client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
      );
    }
  });
});

describe('evaluations resume_id column', () => {
  it('should expose resume_id as nullable uuid in information_schema', async () => {
    const result = await db.execute<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'evaluations'
         AND column_name = 'resume_id'`,
    );
    const row = singleRow(result.rows);
    expect(row.data_type).toBe('uuid');
    expect(row.is_nullable).toBe('YES');
  });

  it('should accept a null resume_id for a profile evaluation', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const job = singleRow(
      await db
        .insert(jobDescriptions)
        .values({ userId: ownerId, rawText: 'Vaga backend', language: 'pt-BR' })
        .returning(),
    );
    const profile = singleRow(
      await db.insert(careerProfiles).values({ userId: ownerId }).returning(),
    );
    const evaluation = singleRow(
      await db
        .insert(evaluations)
        .values({
          userId: ownerId,
          jobDescriptionId: job.id,
          careerProfileId: profile.id,
          status: 'ready',
          matchScore: 40,
        })
        .returning(),
    );
    expect(evaluation.resumeId).toBeNull();
  });

  it('should cascade to resumes on delete', async () => {
    const result = await db.execute<{ delete_rule: string }>(
      `SELECT rc.delete_rule AS delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = rc.constraint_name
       WHERE kcu.table_name = 'evaluations' AND kcu.column_name = 'resume_id'`,
    );
    const row = singleRow(result.rows);
    expect(row.delete_rule).toBe('CASCADE');
  });
});
