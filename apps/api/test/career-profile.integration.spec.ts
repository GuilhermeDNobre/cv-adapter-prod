import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import {
  careerProfiles,
  certifications,
  contactDetails,
  educationEntries,
  evidences,
  experiences,
  languages,
  resumeImports,
  skills,
} from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import { OBJECT_STORAGE } from '../src/modules/storage/object-storage';
import { InMemoryObjectStorage } from '../src/modules/storage/in-memory-object-storage';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_career_profile_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/14';

const VALID_DRAFT = {
  evidences: [
    { statement: 'Led a team of 5 engineers to deliver a microservices platform', experienceIndex: 0 },
    { statement: 'Reduced deployment time from 2 hours to 15 minutes', experienceIndex: 0 },
  ],
  experiences: [
    {
      company: 'Acme Corp',
      role: 'Senior Software Engineer',
      startedOn: '2020-01-15',
      endedOn: '2023-12-31',
    },
  ],
  education: [
    {
      institution: 'MIT',
      degree: 'BS Computer Science',
      startedOn: '2016-09-01',
      endedOn: '2020-06-15',
    },
  ],
  contactDetails: {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+5511999999999',
    links: [{ title: null, url: 'https://linkedin.com/in/jane' }],
  },
};

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
let storage: InMemoryObjectStorage;

async function insertResumeImport(status: string, draft: unknown): Promise<string> {
  const [row] = await db
    .insert(resumeImports)
    .values({
      userId: LOCAL_USER_ID,
      storageKey: `source-documents/${LOCAL_USER_ID}/test-file-key`,
      status: status as 'queued' | 'extracting' | 'structuring' | 'ready_for_review' | 'confirmed' | 'failed',
      draft,
    })
    .returning({ id: resumeImports.id });
  if (row === undefined) {
    throw new Error('Failed to insert resume import');
  }
  return row.id;
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
  storage = new InMemoryObjectStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_CLIENT)
    .useValue({ complete: aiComplete } as unknown as AiClient)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
}, 120_000);

afterEach(() => {
  aiComplete.mockClear();
  aiComplete.mockImplementation(async () => ({
    isJobDescription: true,
    language: 'en',
    requirements: [{ literalTerm: 'Kubernetes', concept: 'Kubernetes', kind: 'mandatory' }],
  }));
});

beforeEach(async () => {
  await queueRedis.flushdb();
  await resetDatabase(pool);
});

afterAll(async () => {
  await app.close();
  await queueRedis.quit();
  await pool.end();
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`),
  );
});

describe('PUT /resume-imports/:resumeImportId/draft', () => {
  it('should save a draft and return it on GET', async () => {
    const importId = await insertResumeImport('ready_for_review', null);

    const putResponse = await request(app.getHttpServer())
      .put(`/resume-imports/${importId}/draft`)
      .send(VALID_DRAFT)
      .expect(200);

    expect(putResponse.body.draft).toBeDefined();
    expect(putResponse.body.draft.evidences).toHaveLength(2);
    expect(putResponse.body.status).toBe('ready_for_review');

    const getResponse = await request(app.getHttpServer())
      .get(`/resume-imports/${importId}`)
      .expect(200);

    expect(getResponse.body.draft).toEqual(putResponse.body.draft);
  });

  it('should accept corrections, removals, and additions', async () => {
    const importId = await insertResumeImport('ready_for_review', VALID_DRAFT);

    const updatedDraft = {
      ...VALID_DRAFT,
      evidences: [
        { statement: 'Corrected statement', experienceIndex: 0 },
        { statement: 'New evidence added', experienceIndex: 0 },
      ],
      experiences: [
        ...VALID_DRAFT.experiences,
        { company: 'New Co', role: 'Junior Dev', startedOn: '2019-01-01', endedOn: '2019-12-31' },
      ],
    };

    const response = await request(app.getHttpServer())
      .put(`/resume-imports/${importId}/draft`)
      .send(updatedDraft)
      .expect(200);

    expect(response.body.draft.evidences).toHaveLength(2);
    expect(response.body.draft.evidences[0].statement).toBe('Corrected statement');
    expect(response.body.draft.experiences).toHaveLength(2);
  });

  it('should reject with 409 when status is not ready_for_review', async () => {
    const importId = await insertResumeImport('confirmed', VALID_DRAFT);

    await request(app.getHttpServer())
      .put(`/resume-imports/${importId}/draft`)
      .send(VALID_DRAFT)
      .expect(409);
  });

  it('should reject with 404 for a non-existent import', async () => {
    await request(app.getHttpServer())
      .put('/resume-imports/11111111-1111-4111-8111-111111111111/draft')
      .send(VALID_DRAFT)
      .expect(404);
  });
});

describe('POST /resume-imports/:resumeImportId/confirm', () => {
  it('should materialize the career profile and remove the source document', async () => {
    const importId = await insertResumeImport('ready_for_review', VALID_DRAFT);
    await storage.putSourceDocument({ userId: LOCAL_USER_ID, content: Buffer.from('pdf-content'), extension: '.pdf' });
    const [importRow] = await db
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, importId));
    expect(importRow).toBeDefined();
    const storageKey = importRow!.storageKey;

    await request(app.getHttpServer())
      .post(`/resume-imports/${importId}/confirm`)
      .expect(200);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profile).toBeDefined();
    const profileId = profile!.id;

    const contacts = await db
      .select()
      .from(contactDetails)
      .where(eq(contactDetails.careerProfileId, profileId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.fullName).toBe('Jane Doe');
    expect(contacts[0]!.email).toBe('jane@example.com');

    const exps = await db
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, profileId));
    expect(exps).toHaveLength(1);
    expect(exps[0]!.company).toBe('Acme Corp');

    const edus = await db
      .select()
      .from(educationEntries)
      .where(eq(educationEntries.careerProfileId, profileId));
    expect(edus).toHaveLength(1);
    expect(edus[0]!.institution).toBe('MIT');

    const evs = await db
      .select()
      .from(evidences)
      .where(eq(evidences.careerProfileId, profileId));
    expect(evs).toHaveLength(2);
    expect(evs[0]!.experienceId).toBe(exps[0]!.id);

    if (storageKey !== null) {
      await expect(storage.getSourceDocument(storageKey)).rejects.toThrow();
    }

    const [updated] = await db
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, importId));
    expect(updated?.status).toBe('confirmed');
  });

  it('should not duplicate anything when confirmed twice', async () => {
    const importId = await insertResumeImport('ready_for_review', VALID_DRAFT);

    await request(app.getHttpServer())
      .post(`/resume-imports/${importId}/confirm`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/resume-imports/${importId}/confirm`)
      .expect(409);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profile).toBeDefined();

    const evs = await db
      .select()
      .from(evidences)
      .where(eq(evidences.careerProfileId, profile!.id));
    expect(evs).toHaveLength(2);
  });

  it('should reject with 404 for a non-existent import', async () => {
    await request(app.getHttpServer())
      .post('/resume-imports/11111111-1111-4111-8111-111111111111/confirm')
      .expect(404);
  });

  it('should merge a second import into the existing profile', async () => {
    const draftA = {
      evidences: [
        { statement: 'Led a team of 5 engineers to deliver a microservices platform', experienceIndex: 0 },
        { statement: 'Unique statement from resume A', experienceIndex: 0 },
      ],
      experiences: [
        {
          company: 'Acme Corp',
          role: 'Senior Software Engineer',
          startedOn: '2020-01-15',
          endedOn: '2023-12-31',
        },
      ],
      education: [
        {
          institution: 'MIT',
          degree: 'BS Computer Science',
          startedOn: '2016-09-01',
          endedOn: '2020-06-15',
        },
      ],
      contactDetails: {
        fullName: 'Alice Anderson',
        email: 'alice@example.com',
        phone: '+5511999999991',
        links: [{ title: null, url: 'https://linkedin.com/in/alice' }],
      },
    };
    const draftB = {
      evidences: [
        { statement: 'Led a team of 5 engineers to deliver a microservices platform', experienceIndex: 0 },
        { statement: 'Shipped feature X at Beta', experienceIndex: 1 },
      ],
      experiences: [
        {
          company: 'Acme Corp',
          role: 'Senior Software Engineer',
          startedOn: '2020-01-15',
          endedOn: '2024-06-30',
        },
        {
          company: 'Beta Ltd',
          role: 'Staff Engineer',
          startedOn: '2024-07-01',
          endedOn: null,
        },
      ],
      education: [
        {
          institution: 'MIT',
          degree: 'BS Computer Science',
          startedOn: '2016-09-01',
          endedOn: '2020-06-15',
        },
      ],
      contactDetails: {
        fullName: 'Bob Brown',
        email: 'bob@example.com',
        phone: '+5511999999992',
        links: [{ title: null, url: 'https://linkedin.com/in/bob' }],
      },
    };
    const importA = await insertResumeImport('ready_for_review', draftA);
    const importB = await insertResumeImport('ready_for_review', draftB);

    await request(app.getHttpServer())
      .post(`/resume-imports/${importA}/confirm`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/resume-imports/${importB}/confirm`)
      .expect(200);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profile).toBeDefined();
    const profileId = profile!.id;

    const contacts = await db
      .select()
      .from(contactDetails)
      .where(eq(contactDetails.careerProfileId, profileId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.fullName).toBe('Bob Brown');
    expect(contacts[0]!.email).toBe('bob@example.com');

    const exps = await db
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, profileId));
    expect(exps).toHaveLength(2);
    const shared = exps.find((exp) => exp.company === 'Acme Corp');
    expect(shared).toBeDefined();
    expect(shared!.endedOn).toBe('2024-06-30');
    expect(exps.some((exp) => exp.company === 'Beta Ltd')).toBe(true);

    const edus = await db
      .select()
      .from(educationEntries)
      .where(eq(educationEntries.careerProfileId, profileId));
    expect(edus).toHaveLength(1);

    const evs = await db
      .select()
      .from(evidences)
      .where(eq(evidences.careerProfileId, profileId));
    expect(evs).toHaveLength(3);
    expect(
      evs.filter(
        (ev) => ev.statement === 'Led a team of 5 engineers to deliver a microservices platform',
      ),
    ).toHaveLength(1);
  });

  it('should not change counts when the same content is confirmed in two imports', async () => {
    const firstId = await insertResumeImport('ready_for_review', VALID_DRAFT);
    const secondId = await insertResumeImport('ready_for_review', VALID_DRAFT);

    await request(app.getHttpServer())
      .post(`/resume-imports/${firstId}/confirm`)
      .expect(200);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profile).toBeDefined();
    const profileId = profile!.id;

    async function readCounts(): Promise<{
      contacts: number;
      experiences: number;
      education: number;
      evidences: number;
    }> {
      const contacts = await db
        .select()
        .from(contactDetails)
        .where(eq(contactDetails.careerProfileId, profileId));
      const exps = await db
        .select()
        .from(experiences)
        .where(eq(experiences.careerProfileId, profileId));
      const edus = await db
        .select()
        .from(educationEntries)
        .where(eq(educationEntries.careerProfileId, profileId));
      const evs = await db
        .select()
        .from(evidences)
        .where(eq(evidences.careerProfileId, profileId));
      return {
        contacts: contacts.length,
        experiences: exps.length,
        education: edus.length,
        evidences: evs.length,
      };
    }

    const afterFirst = await readCounts();

    await request(app.getHttpServer())
      .post(`/resume-imports/${secondId}/confirm`)
      .expect(200);

    const afterSecond = await readCounts();
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond).toEqual({ contacts: 1, experiences: 1, education: 1, evidences: 2 });
  });

  it('should create two experiences when the role is renamed', async () => {
    const draftA = {
      evidences: [],
      experiences: [
        {
          company: 'Acme Corp',
          role: 'Senior Software Engineer',
          startedOn: '2020-01-15',
          endedOn: '2023-12-31',
        },
      ],
      education: [],
      contactDetails: {
        fullName: 'Alice Anderson',
        email: 'alice@example.com',
        phone: null,
        links: null,
      },
    };
    const draftB = {
      evidences: [],
      experiences: [
        {
          company: 'Acme Corp',
          role: 'Lead Software Engineer',
          startedOn: '2020-01-15',
          endedOn: '2024-06-30',
        },
      ],
      education: [],
      contactDetails: {
        fullName: 'Bob Brown',
        email: 'bob@example.com',
        phone: null,
        links: null,
      },
    };
    const firstId = await insertResumeImport('ready_for_review', draftA);
    const secondId = await insertResumeImport('ready_for_review', draftB);

    await request(app.getHttpServer())
      .post(`/resume-imports/${firstId}/confirm`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/resume-imports/${secondId}/confirm`)
      .expect(200);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profile).toBeDefined();
    const exps = await db
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, profile!.id));
    expect(exps).toHaveLength(2);
  });

  it('should not duplicate evidences without an experience', async () => {
    const statement = 'Organized community workshops every month';
    const draftA = {
      evidences: [{ statement }],
      experiences: [],
      education: [],
      contactDetails: {
        fullName: 'Alice Anderson',
        email: 'alice@example.com',
        phone: null,
        links: null,
      },
    };
    const draftB = {
      evidences: [{ statement }],
      experiences: [],
      education: [],
      contactDetails: {
        fullName: 'Bob Brown',
        email: 'bob@example.com',
        phone: null,
        links: null,
      },
    };
    const firstId = await insertResumeImport('ready_for_review', draftA);
    const secondId = await insertResumeImport('ready_for_review', draftB);

    await request(app.getHttpServer())
      .post(`/resume-imports/${firstId}/confirm`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/resume-imports/${secondId}/confirm`)
      .expect(200);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profile).toBeDefined();
    const evs = await db
      .select()
      .from(evidences)
      .where(eq(evidences.careerProfileId, profile!.id));
    expect(evs).toHaveLength(1);
    expect(evs[0]!.experienceId).toBeNull();
  });

  it('should confirm a draft whose dates carry only the year or the month', async () => {
    const draft = {
      evidences: [],
      experiences: [
        {
          company: 'Acme Corp',
          role: 'Engineer',
          startedOn: '2019',
          endedOn: '03/2023',
        },
      ],
      education: [
        {
          institution: 'State University',
          degree: 'BS',
          startedOn: '2015',
          endedOn: '2019',
        },
      ],
      contactDetails: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        links: null,
      },
    };
    const importId = await insertResumeImport('ready_for_review', draft);

    await request(app.getHttpServer())
      .post(`/resume-imports/${importId}/confirm`)
      .expect(200);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profile).toBeDefined();
    const exps = await db
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, profile!.id));
    expect(exps).toHaveLength(1);
    expect(exps[0]!.startedOn).toBe('2019');
    expect(exps[0]!.endedOn).toBe('2023-03');
    const edus = await db
      .select()
      .from(educationEntries)
      .where(eq(educationEntries.careerProfileId, profile!.id));
    expect(edus).toHaveLength(1);
    expect(edus[0]!.startedOn).toBe('2015');
    expect(edus[0]!.endedOn).toBe('2019');
  });

  it('should answer 422 and create nothing when a draft date cannot be read', async () => {
    const draft = {
      evidences: [],
      experiences: [
        {
          company: 'Acme Corp',
          role: 'Engineer',
          startedOn: 'Present',
          endedOn: null,
        },
      ],
      education: [],
      contactDetails: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        links: null,
      },
    };
    const importId = await insertResumeImport('ready_for_review', draft);

    const response = await request(app.getHttpServer())
      .post(`/resume-imports/${importId}/confirm`)
      .expect(422);

    expect(response.body.code).toBe('invalid_draft_date');
    expect(response.body.field).toBe('experiences[0].startedOn');
    const profiles = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profiles).toHaveLength(0);
  });

  it('should materialize skills, languages, certifications and titled links', async () => {
    const draft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        city: 'Quixadá, CE',
        links: [
          { title: 'LinkedIn', url: 'https://linkedin.com/in/jane' },
          { title: 'GitHub', url: 'https://github.com/jane' },
        ],
      },
      skills: [
        { name: 'Node.js', group: null },
        { name: 'React', group: 'Front-end' },
      ],
      languages: [{ name: 'English', level: 'Advanced' }],
      certifications: [{ name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' }],
    };
    const importId = await insertResumeImport('ready_for_review', draft);

    await request(app.getHttpServer()).post(`/resume-imports/${importId}/confirm`).expect(200);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    expect(profile).toBeDefined();
    const profileId = profile!.id;

    const skillRows = await db.select().from(skills).where(eq(skills.careerProfileId, profileId));
    expect(skillRows).toHaveLength(2);
    expect(skillRows.some((row) => row.name === 'Node.js' && row.group === null)).toBe(true);
    expect(skillRows.some((row) => row.name === 'React' && row.group === 'Front-end')).toBe(true);

    const languageRows = await db
      .select()
      .from(languages)
      .where(eq(languages.careerProfileId, profileId));
    expect(languageRows).toHaveLength(1);
    expect(languageRows[0]).toMatchObject({ name: 'English', level: 'Advanced' });

    const certificationRows = await db
      .select()
      .from(certifications)
      .where(eq(certifications.careerProfileId, profileId));
    expect(certificationRows).toHaveLength(1);
    expect(certificationRows[0]).toMatchObject({
      name: 'Scrum Foundations',
      issuer: 'CertiProf',
      year: '2021',
    });

    const contacts = await db
      .select()
      .from(contactDetails)
      .where(eq(contactDetails.careerProfileId, profileId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.city).toBe('Quixadá, CE');
    expect(contacts[0]!.links).toEqual([
      { title: 'LinkedIn', url: 'https://linkedin.com/in/jane' },
      { title: 'GitHub', url: 'https://github.com/jane' },
    ]);
  });

  it('should not duplicate skills, languages and certifications on reimport', async () => {
    const draftA = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: 'A', email: null, phone: null, links: null },
      skills: [{ name: 'Node.js', group: null }],
      languages: [{ name: 'English', level: 'Advanced' }],
      certifications: [{ name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' }],
    };
    const draftB = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: 'B', email: null, phone: null, links: null },
      skills: [
        { name: 'node.js', group: null },
        { name: 'React', group: null },
      ],
      languages: [
        { name: 'english', level: 'Fluent' },
        { name: 'Spanish', level: null },
      ],
      certifications: [
        { name: 'scrum foundations', issuer: 'Other', year: '2022' },
        { name: 'AWS SAA', issuer: null, year: null },
      ],
    };
    const firstId = await insertResumeImport('ready_for_review', draftA);
    const secondId = await insertResumeImport('ready_for_review', draftB);

    await request(app.getHttpServer()).post(`/resume-imports/${firstId}/confirm`).expect(200);
    await request(app.getHttpServer()).post(`/resume-imports/${secondId}/confirm`).expect(200);

    const [profile] = await db
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, LOCAL_USER_ID));
    const profileId = profile!.id;

    const skillRows = await db.select().from(skills).where(eq(skills.careerProfileId, profileId));
    expect(skillRows).toHaveLength(2);

    const languageRows = await db
      .select()
      .from(languages)
      .where(eq(languages.careerProfileId, profileId));
    expect(languageRows).toHaveLength(2);

    const certificationRows = await db
      .select()
      .from(certifications)
      .where(eq(certifications.careerProfileId, profileId));
    expect(certificationRows).toHaveLength(2);
  });
});

describe('GET /career-profile', () => {
  it('should return experiences, education and evidences with ids usable in POST /base-resumes', async () => {
    const importId = await insertResumeImport('ready_for_review', VALID_DRAFT);
    await request(app.getHttpServer()).post(`/resume-imports/${importId}/confirm`).expect(200);

    const response = await request(app.getHttpServer()).get('/career-profile').expect(200);

    expect(response.body.experiences).toHaveLength(1);
    expect(response.body.experiences[0].company).toBe('Acme Corp');
    expect(response.body.experiences[0].role).toBe('Senior Software Engineer');
    expect(response.body.educationEntries).toHaveLength(1);
    expect(response.body.educationEntries[0].institution).toBe('MIT');
    expect(response.body.evidences).toHaveLength(2);

    const experienceId = response.body.experiences[0].id as string;
    const evidenceIds = (response.body.evidences as Array<{ id: string }>).map((item) => item.id);
    await request(app.getHttpServer())
      .post('/base-resumes')
      .send({ name: 'From profile', sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }] })
      .expect(202);
  });

  it('should answer 404 without a confirmed profile and never include contact data', async () => {
    await request(app.getHttpServer()).get('/career-profile').expect(404);

    const importId = await insertResumeImport('ready_for_review', VALID_DRAFT);
    await request(app.getHttpServer()).post(`/resume-imports/${importId}/confirm`).expect(200);

    const response = await request(app.getHttpServer()).get('/career-profile').expect(200);
    const body = JSON.stringify(response.body).toLowerCase();
    expect(body).not.toContain('jane doe');
    expect(body).not.toContain('jane@example.com');
    expect(body).not.toContain('5511999999999');
    expect(response.body).not.toHaveProperty('contactDetails');
    expect(response.body).not.toHaveProperty('contact');
  });
});
