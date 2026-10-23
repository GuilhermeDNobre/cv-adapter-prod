import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import { careerProfiles, jobDescriptions, requirements, resumeSections, resumeSectionSkills, resumeSkillProposals, resumes, skills } from 'schema';
import { eq } from 'drizzle-orm';
import { LOCAL_USER_ID } from 'schema/local-user';
import { resumeDocumentResponseSchema } from 'schema/contracts/resume';
import { AI_CLIENT } from '../src/modules/ai/ai-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_skill_proposal_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/8';

function urlWithDatabase(database: string): string {
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  url.pathname = database;
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

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

async function createProfileWithSkills(): Promise<{ profileId: string; nestId: string; tsId: string }> {
  const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
  const [nest] = await db
    .insert(skills)
    .values({ careerProfileId: profile!.id, name: 'NestJS', group: 'Back-end', ordinal: 0 })
    .returning();
  const [ts] = await db
    .insert(skills)
    .values({ careerProfileId: profile!.id, name: 'TypeScript', group: 'Linguagens', ordinal: 1 })
    .returning();
  return { profileId: profile!.id, nestId: nest!.id, tsId: ts!.id };
}

async function createJobWithRequirement(term: string): Promise<{ jobId: string; requirementId: string }> {
  const [job] = await db
    .insert(jobDescriptions)
    .values({ userId: LOCAL_USER_ID, rawText: `Hiring ${term}`, language: 'en' })
    .returning();
  const [requirement] = await db
    .insert(requirements)
    .values({
      jobDescriptionId: job!.id,
      literalTerm: term,
      concept: term,
      normalizedConcept: term.toLowerCase(),
      kind: 'mandatory',
      ordinal: 0,
    })
    .returning();
  return { jobId: job!.id, requirementId: requirement!.id };
}

async function createResumeWithSkillsSection(input: {
  jobId: string;
  skillIds: string[];
}): Promise<{ resumeId: string; sectionId: string }> {
  const [resume] = await db
    .insert(resumes)
    .values({
      userId: LOCAL_USER_ID,
      kind: 'tailored',
      name: 'Tailored',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: input.jobId,
      generationStatus: 'ready',
      failureReason: null,
      adaptationPlan: null,
      adaptationReview: {},
    })
    .returning();
  const [section] = await db
    .insert(resumeSections)
    .values({ resumeId: resume!.id, kind: 'skills', title: null, ordinal: 0 })
    .returning();
  for (let index = 0; index < input.skillIds.length; index += 1) {
    await db.insert(resumeSectionSkills).values({ sectionId: section!.id, skillId: input.skillIds[index]!, ordinal: index });
  }
  return { resumeId: resume!.id, sectionId: section!.id };
}

async function createProposal(input: {
  sectionId: string;
  kind: 'addition' | 'swap';
  name: string;
  group?: string | null;
  replacesSkillId?: string | null;
  requirementId?: string | null;
  status?: 'pending' | 'accepted' | 'rejected';
}): Promise<string> {
  const [row] = await db
    .insert(resumeSkillProposals)
    .values({
      sectionId: input.sectionId,
      kind: input.kind,
      name: input.name,
      group: input.group ?? null,
      replacesSkillId: input.replacesSkillId ?? null,
      requirementId: input.requirementId ?? null,
      status: input.status ?? 'pending',
      ordinal: 0,
    })
    .returning();
  return row!.id;
}

beforeAll(async () => {
  process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  });
  process.env.DATABASE_URL = urlWithDatabase(`/${TEST_DATABASE}`);
  process.env.REDIS_URL = TEST_REDIS_URL;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  queueRedis = new Redis(TEST_REDIS_URL);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_CLIENT)
    .useValue({ complete: vi.fn(async () => ({ bullets: [] })) })
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await queueRedis.flushdb();
  await resetDatabase(pool);
});

afterAll(async () => {
  await app.close();
  await queueRedis.quit();
  await pool.end();
  await withAdminClient((client) => client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`));
});

describe('POST /resumes/:resumeId/skill-proposals/:proposalId/accept', () => {
  it('should accept an addition, add the skill to the profile and show it as assumed', async () => {
    const { nestId, tsId } = await createProfileWithSkills();
    const { jobId, requirementId } = await createJobWithRequirement('Fastify');
    const { resumeId, sectionId } = await createResumeWithSkillsSection({ jobId, skillIds: [nestId, tsId] });
    const proposalId = await createProposal({ sectionId, kind: 'addition', name: 'Fastify', group: 'Back-end', requirementId });

    const response = await request(app.getHttpServer())
      .post(`/resumes/${resumeId}/skill-proposals/${proposalId}/accept`)
      .expect(200);
    const parsed = resumeDocumentResponseSchema.parse(response.body);
    expect(parsed.skillProposals.find((item) => item.id === proposalId)?.status).toBe('accepted');

    const profileSkills = await db.select().from(skills);
    expect(profileSkills.map((skill) => skill.name)).toContain('Fastify');
    const fastify = profileSkills.find((skill) => skill.name === 'Fastify')!;
    expect(fastify.group).toBe('Back-end');

    const skillsSection = parsed.sections.find((section) => section.kind === 'skills')!;
    const backend = skillsSection.entries.find((entry) => entry.heading === 'Back-end')!;
    expect(backend.bullets.map((bullet) => bullet.text)).toContain('Fastify');
    expect(backend.bullets.find((bullet) => bullet.text === 'Fastify')?.status).toBe('assumed');

    const again = await request(app.getHttpServer())
      .post(`/resumes/${resumeId}/skill-proposals/${proposalId}/accept`)
      .expect(422);
    expect(again.status).toBe(422);
  });

  it('should reuse an existing profile skill with different casing and not duplicate', async () => {
    const { nestId, tsId } = await createProfileWithSkills();
    const { jobId, requirementId } = await createJobWithRequirement('fastify');
    const { resumeId, sectionId } = await createResumeWithSkillsSection({ jobId, skillIds: [nestId, tsId] });
    const proposalId = await createProposal({ sectionId, kind: 'addition', name: 'fastify', group: 'Back-end', requirementId });
    await request(app.getHttpServer()).post(`/resumes/${resumeId}/skill-proposals/${proposalId}/accept`).expect(200);

    const before = await db.select().from(skills);
    const fastifyCount = before.filter((skill) => skill.name.toLowerCase() === 'fastify').length;
    expect(fastifyCount).toBe(1);

    const { sectionId: secondSection } = await createResumeWithSkillsSection({ jobId, skillIds: [nestId] });
    const secondProposal = await createProposal({ sectionId: secondSection, kind: 'addition', name: 'FASTIFY', group: 'Back-end', requirementId });
    const secondResume = await db.select().from(resumeSections).where(eq(resumeSections.id, secondSection));
    const secondResumeId = secondResume[0]!.resumeId;
    await request(app.getHttpServer()).post(`/resumes/${secondResumeId}/skill-proposals/${secondProposal}/accept`).expect(200);

    const after = await db.select().from(skills);
    expect(after.filter((skill) => skill.name.toLowerCase() === 'fastify')).toHaveLength(1);
  });

  it('should accept a swap without touching the profile and replace in place', async () => {
    const { nestId, tsId } = await createProfileWithSkills();
    const { jobId, requirementId } = await createJobWithRequirement('Fastify');
    const { resumeId, sectionId } = await createResumeWithSkillsSection({ jobId, skillIds: [tsId, nestId] });
    const proposalId = await createProposal({
      sectionId,
      kind: 'swap',
      name: 'Fastify',
      group: 'Back-end',
      replacesSkillId: nestId,
      requirementId,
    });
    const skillsBefore = await db.select().from(skills);

    const response = await request(app.getHttpServer())
      .post(`/resumes/${resumeId}/skill-proposals/${proposalId}/accept`)
      .expect(200);
    const parsed = resumeDocumentResponseSchema.parse(response.body);
    expect(parsed.skillProposals.find((item) => item.id === proposalId)?.status).toBe('accepted');

    const skillsAfter = await db.select().from(skills);
    expect(skillsAfter.map((skill) => skill.name).sort()).toEqual(skillsBefore.map((skill) => skill.name).sort());

    const backend = parsed.sections
      .find((section) => section.kind === 'skills')!
      .entries.find((entry) => entry.heading === 'Back-end')!;
    expect(backend.bullets.map((bullet) => bullet.text)).toEqual(['Fastify']);
    expect(backend.bullets[0]!.status).toBe('assumed');
  });
});

describe('POST /resumes/:resumeId/skill-proposals/:proposalId/reject', () => {
  it('should reject a pending proposal and hide it from the document', async () => {
    const { nestId } = await createProfileWithSkills();
    const { jobId, requirementId } = await createJobWithRequirement('Fastify');
    const { resumeId, sectionId } = await createResumeWithSkillsSection({ jobId, skillIds: [nestId] });
    const proposalId = await createProposal({ sectionId, kind: 'addition', name: 'Fastify', group: 'Back-end', requirementId });

    const response = await request(app.getHttpServer())
      .post(`/resumes/${resumeId}/skill-proposals/${proposalId}/reject`)
      .expect(200);
    const parsed = resumeDocumentResponseSchema.parse(response.body);
    expect(parsed.skillProposals.find((item) => item.id === proposalId)?.status).toBe('rejected');
    const backend = parsed.sections.find((section) => section.kind === 'skills')!.entries.find((entry) => entry.heading === 'Back-end')!;
    expect(backend.bullets.map((bullet) => bullet.text)).toEqual(['NestJS']);
  });

  it('should answer 404 for a proposal of another resume', async () => {
    const { nestId } = await createProfileWithSkills();
    const { jobId, requirementId } = await createJobWithRequirement('Fastify');
    const first = await createResumeWithSkillsSection({ jobId, skillIds: [nestId] });
    const second = await createResumeWithSkillsSection({ jobId, skillIds: [nestId] });
    const proposalId = await createProposal({ sectionId: first.sectionId, kind: 'addition', name: 'Fastify', group: 'Back-end', requirementId });

    await request(app.getHttpServer()).post(`/resumes/${second.resumeId}/skill-proposals/${proposalId}/accept`).expect(404);
    await request(app.getHttpServer()).post(`/resumes/${second.resumeId}/skill-proposals/${proposalId}/reject`).expect(404);
    await request(app.getHttpServer()).post(`/resumes/${first.resumeId}/skill-proposals/${randomUUID()}/accept`).expect(404);
    await request(app.getHttpServer()).post(`/resumes/${randomUUID()}/skill-proposals/${proposalId}/accept`).expect(404);
  });

  it('should answer 422 for an already resolved proposal', async () => {
    const { nestId } = await createProfileWithSkills();
    const { jobId, requirementId } = await createJobWithRequirement('Fastify');
    const { resumeId, sectionId } = await createResumeWithSkillsSection({ jobId, skillIds: [nestId] });
    const proposalId = await createProposal({ sectionId, kind: 'addition', name: 'Fastify', group: 'Back-end', requirementId, status: 'accepted' });

    await request(app.getHttpServer()).post(`/resumes/${resumeId}/skill-proposals/${proposalId}/accept`).expect(422);
    await request(app.getHttpServer()).post(`/resumes/${resumeId}/skill-proposals/${proposalId}/reject`).expect(422);
  });
});
