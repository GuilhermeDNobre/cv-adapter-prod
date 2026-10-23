import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import {
  careerProfiles,
  contactDetails,
  deepSeekCredentials,
  deniedRequirements,
  educationEntries,
  evaluations,
  evidences,
  experiences,
  jobDescriptions,
  requirementCoverages,
  requirements,
  resumeBullets,
  resumeEntries,
  resumeExports,
  resumeImports,
  resumeSections,
  resumes,
  sourceDocuments,
} from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/modules/storage/object-storage';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { EVALUATION_QUEUE, RESUME_IMPORT_QUEUE, RESUME_WRITING_QUEUE } from '../src/queue.module';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_data_erasure_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/11';

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

const aiComplete = vi.fn(async () => ({
  isJobDescription: true,
  language: 'en',
  requirements: [{ literalTerm: 'Kubernetes', concept: 'Kubernetes', kind: 'mandatory' }],
}));

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

type ErasureTable =
  | typeof careerProfiles
  | typeof contactDetails
  | typeof deepSeekCredentials
  | typeof deniedRequirements
  | typeof educationEntries
  | typeof evaluations
  | typeof evidences
  | typeof experiences
  | typeof jobDescriptions
  | typeof requirementCoverages
  | typeof requirements
  | typeof resumeImports
  | typeof resumes
  | typeof resumeExports
  | typeof sourceDocuments;

async function countRows(table: ErasureTable): Promise<number> {
  const rows = await db.select().from(table);
  return rows.length;
}

async function seedAll(): Promise<void> {
  const [profile] = await db
    .insert(careerProfiles)
    .values({ userId: LOCAL_USER_ID })
    .returning();
  const profileId = profile!.id;
  await db.insert(contactDetails).values({
    careerProfileId: profileId,
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+5511999999999',
    links: [{ title: null, url: 'https://linkedin.com/in/jane' }],
  });
  const [experience] = await db
    .insert(experiences)
    .values({
      careerProfileId: profileId,
      company: 'Acme Corp',
      role: 'Senior Software Engineer',
      startedOn: '2020-01-15',
      endedOn: '2023-12-31',
    })
    .returning();
  await db.insert(educationEntries).values({
    careerProfileId: profileId,
    institution: 'MIT',
    degree: 'BS Computer Science',
    startedOn: '2016-09-01',
    endedOn: '2020-06-15',
  });
  const [evidence] = await db
    .insert(evidences)
    .values({
      careerProfileId: profileId,
      experienceId: experience!.id,
      statement: 'Led a team of 5 engineers',
    })
    .returning();
  await db.insert(deniedRequirements).values({
    careerProfileId: profileId,
    normalizedConcept: 'cobol',
  });
  const storage = app.get<ObjectStorage>(OBJECT_STORAGE);
  const storageKey = await storage.putSourceDocument({
    userId: LOCAL_USER_ID,
    content: Buffer.from('%PDF-1.4 seeded resume'),
    extension: '.pdf',
  });
  await db.insert(resumeImports).values({
    userId: LOCAL_USER_ID,
    storageKey,
    status: 'confirmed',
  });
  const [job] = await db
    .insert(jobDescriptions)
    .values({ userId: LOCAL_USER_ID, rawText: 'Looking for a Kubernetes expert', language: 'en' })
    .returning();
  const [firstRequirement] = await db
    .insert(requirements)
    .values({
      jobDescriptionId: job!.id,
      literalTerm: 'Kubernetes',
      concept: 'Container orchestration',
      normalizedConcept: 'kubernetes',
      kind: 'mandatory',
      ordinal: 0,
    })
    .returning();
  await db.insert(requirements).values({
    jobDescriptionId: job!.id,
    literalTerm: 'TypeScript',
    concept: 'TypeScript programming',
    normalizedConcept: 'typescript',
    kind: 'desirable',
    ordinal: 1,
  });
  const [evaluation] = await db
    .insert(evaluations)
    .values({
      userId: LOCAL_USER_ID,
      jobDescriptionId: job!.id,
      careerProfileId: profileId,
      status: 'ready',
      matchScore: 50,
    })
    .returning();
  await db.insert(requirementCoverages).values({
    evaluationId: evaluation!.id,
    requirementId: firstRequirement!.id,
    coverage: 'covered',
    evidenceId: evidence!.id,
    rationale: 'Strong Kubernetes experience',
  });
  await db
    .insert(deepSeekCredentials)
    .values({ id: 1, apiKey: 'sk-live-abcdef-12345678' })
    .onConflictDoNothing();
  const [resume] = await db
    .insert(resumes)
    .values({
      userId: LOCAL_USER_ID,
      kind: 'base',
      name: 'Backend focus',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: null,
      generationStatus: 'ready',
      failureReason: null,
      adaptationPlan: null,
    })
    .returning();
  const [section] = await db
    .insert(resumeSections)
    .values({ resumeId: resume!.id, kind: 'experience', title: null, ordinal: 0 })
    .returning();
  const [entry] = await db
    .insert(resumeEntries)
    .values({
      sectionId: section!.id,
      ordinal: 0,
      experienceId: experience!.id,
      educationEntryId: null,
      heading: null,
    })
    .returning();
  await db.insert(resumeBullets).values({
    entryId: entry!.id,
    ordinal: 0,
    text: 'Led a team of 5 engineers',
    evidenceId: evidence!.id,
    status: 'assumed',
    suggestionQuestion: null,
    requirementId: null,
    gapKind: null,
    needsReview: false,
    editedByPerson: false,
  });
  await db.insert(resumeExports).values({ resumeId: resume!.id, pdf: Buffer.from('%PDF-1.4 fake'), pageCount: 1 });
}

async function enqueueJobs(): Promise<{ evaluationQueue: Queue; resumeImportQueue: Queue }> {
  const evaluationQueue = app.get<Queue>(getQueueToken(EVALUATION_QUEUE));
  const resumeImportQueue = app.get<Queue>(getQueueToken(RESUME_IMPORT_QUEUE));
  await evaluationQueue.add('evaluate', { evaluationId: 'seeded-evaluation' });
  await evaluationQueue.add('evaluate', { evaluationId: 'seeded-delayed' }, { delay: 60000 });
  await resumeImportQueue.add('process', { resumeImportId: 'seeded-import' });
  await resumeImportQueue.add('process', { resumeImportId: 'seeded-delayed' }, { delay: 60000 });
  return { evaluationQueue, resumeImportQueue };
}

async function enqueueWritingJobs(): Promise<Queue> {
  const writingQueue = app.get<Queue>(getQueueToken(RESUME_WRITING_QUEUE));
  await writingQueue.add('write-base', { resumeId: 'seeded-resume' });
  await writingQueue.add('write-base', { resumeId: 'seeded-delayed' }, { delay: 60000 });
  return writingQueue;
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
    .useValue({ complete: aiComplete } as unknown as AiClient)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
}, 120_000);

beforeEach(async () => {
  await queueRedis.flushdb();
  await resetDatabase(pool);
  await seedAll();
});

afterAll(async () => {
  await app.close();
  await queueRedis.quit();
  await pool.end();
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`),
  );
});

describe('POST /data/erase job_descriptions', () => {
  it('should erase jobs, requirements, evaluations and coverages while preserving the profile, imports and files', async () => {
    const { evaluationQueue, resumeImportQueue } = await enqueueJobs();

    const response = await request(app.getHttpServer())
      .post('/data/erase')
      .send({ scope: 'job_descriptions' })
      .expect(200);

    expect(response.body).toEqual({ scope: 'job_descriptions' });
    expect(await countRows(jobDescriptions)).toBe(0);
    expect(await countRows(requirements)).toBe(0);
    expect(await countRows(evaluations)).toBe(0);
    expect(await countRows(requirementCoverages)).toBe(0);
    expect(await countRows(careerProfiles)).toBe(1);
    expect(await countRows(resumeImports)).toBe(1);
    expect(await countRows(sourceDocuments)).toBe(1);
    expect(await evaluationQueue.getWaitingCount()).toBe(0);
    expect(await evaluationQueue.getDelayedCount()).toBe(0);
    expect(await resumeImportQueue.getWaitingCount()).toBeGreaterThan(0);
  });
});

describe('POST /data/erase career_profile', () => {
  it('should erase the profile, imports, files, contacts, experiences, education, evidences, resumes and evaluations while preserving jobs', async () => {
    const { evaluationQueue, resumeImportQueue } = await enqueueJobs();
    const writingQueue = await enqueueWritingJobs();

    const response = await request(app.getHttpServer())
      .post('/data/erase')
      .send({ scope: 'career_profile' })
      .expect(200);

    expect(response.body).toEqual({ scope: 'career_profile' });
    expect(await countRows(careerProfiles)).toBe(0);
    expect(await countRows(resumeImports)).toBe(0);
    expect(await countRows(sourceDocuments)).toBe(0);
    expect(await countRows(contactDetails)).toBe(0);
    expect(await countRows(experiences)).toBe(0);
    expect(await countRows(educationEntries)).toBe(0);
    expect(await countRows(evidences)).toBe(0);
    expect(await countRows(deniedRequirements)).toBe(0);
    expect(await countRows(evaluations)).toBe(0);
    expect(await countRows(requirementCoverages)).toBe(0);
    expect(await countRows(resumes)).toBe(0);
    expect(await countRows(resumeExports)).toBe(0);
    expect(await countRows(jobDescriptions)).toBe(1);
    expect(await countRows(requirements)).toBe(2);
    expect(await evaluationQueue.getWaitingCount()).toBe(0);
    expect(await evaluationQueue.getDelayedCount()).toBe(0);
    expect(await resumeImportQueue.getWaitingCount()).toBe(0);
    expect(await resumeImportQueue.getDelayedCount()).toBe(0);
    expect(await writingQueue.getWaitingCount()).toBe(0);
    expect(await writingQueue.getDelayedCount()).toBe(0);
  });
});

describe('POST /data/erase everything', () => {
  it('should erase everything except the deepseek key', async () => {
    const { evaluationQueue, resumeImportQueue } = await enqueueJobs();
    const writingQueue = await enqueueWritingJobs();

    const response = await request(app.getHttpServer())
      .post('/data/erase')
      .send({ scope: 'everything' })
      .expect(200);

    expect(response.body).toEqual({ scope: 'everything' });
    expect(await countRows(jobDescriptions)).toBe(0);
    expect(await countRows(requirements)).toBe(0);
    expect(await countRows(evaluations)).toBe(0);
    expect(await countRows(requirementCoverages)).toBe(0);
    expect(await countRows(careerProfiles)).toBe(0);
    expect(await countRows(resumeImports)).toBe(0);
    expect(await countRows(sourceDocuments)).toBe(0);
    expect(await countRows(contactDetails)).toBe(0);
    expect(await countRows(experiences)).toBe(0);
    expect(await countRows(educationEntries)).toBe(0);
    expect(await countRows(evidences)).toBe(0);
    expect(await countRows(deniedRequirements)).toBe(0);
    expect(await countRows(resumes)).toBe(0);
    expect(await countRows(resumeExports)).toBe(0);
    expect(await countRows(deepSeekCredentials)).toBe(1);
    expect(await evaluationQueue.getWaitingCount()).toBe(0);
    expect(await evaluationQueue.getDelayedCount()).toBe(0);
    expect(await resumeImportQueue.getWaitingCount()).toBe(0);
    expect(await resumeImportQueue.getDelayedCount()).toBe(0);
    expect(await writingQueue.getWaitingCount()).toBe(0);
    expect(await writingQueue.getDelayedCount()).toBe(0);
  });
});

describe('POST /data/erase resumes', () => {
  it('should erase resumes and pdfs while preserving profile, jobs, evaluations and the key', async () => {
    const { evaluationQueue, resumeImportQueue } = await enqueueJobs();
    const writingQueue = await enqueueWritingJobs();

    const response = await request(app.getHttpServer()).post('/data/erase').send({ scope: 'resumes' }).expect(200);

    expect(response.body).toEqual({ scope: 'resumes' });
    expect(await countRows(resumes)).toBe(0);
    expect(await countRows(resumeExports)).toBe(0);
    expect(await countRows(careerProfiles)).toBe(1);
    expect(await countRows(jobDescriptions)).toBe(1);
    expect(await countRows(requirements)).toBe(2);
    expect(await countRows(evaluations)).toBe(1);
    expect(await countRows(deepSeekCredentials)).toBe(1);
    expect(await writingQueue.getWaitingCount()).toBe(0);
    expect(await writingQueue.getDelayedCount()).toBe(0);
    expect(await evaluationQueue.getWaitingCount()).toBeGreaterThan(0);
    expect(await resumeImportQueue.getWaitingCount()).toBeGreaterThan(0);
  });
});

describe('POST /data/erase validation', () => {
  it('should answer 400 for an unknown scope and erase nothing', async () => {
    const jobCount = await countRows(jobDescriptions);
    const profileCount = await countRows(careerProfiles);
    expect(jobCount).toBeGreaterThan(0);
    expect(profileCount).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post('/data/erase')
      .send({ scope: 'unknown' })
      .expect(400);

    expect(await countRows(jobDescriptions)).toBe(jobCount);
    expect(await countRows(careerProfiles)).toBe(profileCount);
    expect(await countRows(requirements)).toBe(2);
    expect(await countRows(sourceDocuments)).toBe(1);
  });
});
