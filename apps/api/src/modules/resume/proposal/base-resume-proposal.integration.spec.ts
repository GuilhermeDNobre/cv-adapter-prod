import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import {
  careerProfiles,
  certifications,
  educationEntries,
  evidences,
  experiences,
  languages,
  resumeBullets,
  resumeEntries,
  resumeImports,
  resumeSectionSkills,
  resumeSections,
  resumes,
  skills,
  users,
} from 'schema';
import { BaseResumeProposalService } from './base-resume-proposal.service';
import { BaseResumeService } from '../base-resume.service';
import { ResumeRepository } from '../resume.repository';
import { ResumeDocumentRepository } from '../resume-document.repository';
import { CareerProfileService } from '../../career-profile/career-profile.service';

const TEST_DATABASE = 'cv_adapter_proposal_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

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

let pool: Pool;
let db: NodePgDatabase<typeof schema>;

function makeFakeAiClient() {
  return {
    complete: vi.fn(async (request: { payload: { evidences: Array<{ id: string; statement: string }> } }) => ({
      bullets: request.payload.evidences.map((evidence) => ({
        evidenceId: evidence.id,
        text: `Rewritten: ${evidence.statement}`,
      })),
    })),
  };
}

function makeNoopStorage() {
  return {
    putSourceDocument: vi.fn(),
    getSourceDocument: vi.fn(),
    removeSourceDocument: vi.fn(async () => undefined),
    removeSourceDocumentsOf: vi.fn(async () => undefined),
  };
}

function makeNoopQueue() {
  return { add: vi.fn(async () => undefined) };
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

describe('base resume proposal integration', () => {
  it('should confirm, generate the proposal, read it back and approve it as a base resume', async () => {
    const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
    try {
      await expect(redis.ping()).resolves.toBe('PONG');
    } finally {
      redis.disconnect();
    }

    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });

    const [profile] = await db.insert(careerProfiles).values({ userId: ownerId }).returning();
    if (profile === undefined) {
      throw new Error('Failed to create career profile');
    }

    const [firstExperience] = await db
      .insert(experiences)
      .values({
        careerProfileId: profile.id,
        company: 'Acme',
        role: 'Engineer',
        startedOn: '2020-01',
        endedOn: null,
      })
      .returning();
    const [secondExperience] = await db
      .insert(experiences)
      .values({
        careerProfileId: profile.id,
        company: 'Globex',
        role: 'Senior Engineer',
        startedOn: '2022-01',
        endedOn: null,
      })
      .returning();
    if (firstExperience === undefined || secondExperience === undefined) {
      throw new Error('Failed to create experiences');
    }

    const [firstEvidence] = await db
      .insert(evidences)
      .values({
        careerProfileId: profile.id,
        experienceId: firstExperience.id,
        statement: 'Led a team of five engineers',
      })
      .returning();
    const [secondEvidence] = await db
      .insert(evidences)
      .values({
        careerProfileId: profile.id,
        experienceId: secondExperience.id,
        statement: 'Shipped checkout flow',
      })
      .returning();
    if (firstEvidence === undefined || secondEvidence === undefined) {
      throw new Error('Failed to create evidences');
    }

    const [education] = await db
      .insert(educationEntries)
      .values({
        careerProfileId: profile.id,
        institution: 'USP',
        degree: 'Computer Science',
        startedOn: '2016',
        endedOn: '2019',
      })
      .returning();
    const [skill] = await db
      .insert(skills)
      .values({ careerProfileId: profile.id, name: 'Node.js', group: null })
      .returning();
    await db.insert(languages).values({ careerProfileId: profile.id, name: 'English', level: 'Advanced' });
    await db
      .insert(certifications)
      .values({ careerProfileId: profile.id, name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' });
    if (education === undefined || skill === undefined) {
      throw new Error('Failed to create education or skill');
    }

    const style = { writingMethod: 'xyz', tone: 'direct', averageBulletWords: 12 } as const;
    const [resumeImport] = await db
      .insert(resumeImports)
      .values({
        userId: ownerId,
        storageKey: null,
        status: 'confirmed',
        draft: { sectionOrder: ['experience', 'education', 'skills'] },
        writingStyle: style,
      })
      .returning();
    if (resumeImport === undefined) {
      throw new Error('Failed to create resume import');
    }

    const proposals = new BaseResumeProposalService(db as never, makeFakeAiClient() as never);
    await proposals.markGenerating(resumeImport.id);
    await proposals.buildAndStoreProposal(resumeImport.id, ownerId);

    const fetched = await proposals.getProposal(resumeImport.id, ownerId);
    expect(fetched.status).toBe('ready');
    expect(fetched.failureReason).toBeNull();
    expect(fetched.proposal).not.toBeNull();
    expect(fetched.proposal!.sections.map((section) => section.kind)).toEqual([
      'experience',
      'education',
      'skills',
      'languages',
      'certifications',
    ]);

    const experienceSection = fetched.proposal!.sections.find((section) => section.kind === 'experience');
    const bullets = experienceSection!.entries.flatMap((entry) => entry.bullets);
    expect(bullets).toHaveLength(2);
    const byEvidence = new Map(bullets.map((bullet) => [bullet.evidenceId, bullet]));
    expect(byEvidence.get(firstEvidence.id)?.original).toBe('Led a team of five engineers');
    expect(byEvidence.get(firstEvidence.id)?.text).toContain('Rewritten');
    expect(byEvidence.get(secondEvidence.id)?.original).toBe('Shipped checkout flow');

    const skillsSection = fetched.proposal!.sections.find((section) => section.kind === 'skills');
    expect(skillsSection?.skillIds).toEqual([skill.id]);

    const documents = new ResumeDocumentRepository(db as never);
    const repository = new ResumeRepository(db as never, documents as never);
    const baseResumes = new BaseResumeService(db as never, repository as never, makeNoopQueue() as never);

    const created = await baseResumes.createBaseResume(ownerId, {
      name: fetched.proposal!.name,
      language: fetched.proposal!.language,
      writingMethod: fetched.proposal!.style.writingMethod,
      tone: fetched.proposal!.style.tone,
      sections: fetched.proposal!.sections.map((section) => {
        if (section.kind === 'skills') {
          return { kind: section.kind, skillIds: section.skillIds ?? [] };
        }
        if (section.kind === 'education') {
          return {
            kind: section.kind,
            entries: section.entries.map((entry) => ({
              educationEntryId: entry.educationEntryId ?? null,
              bullets: [],
            })),
          };
        }
        return {
          kind: section.kind,
          entries: section.entries.map((entry) => ({
            experienceId: entry.experienceId ?? null,
            bullets: entry.bullets.map((bullet) => ({
              evidenceId: bullet.evidenceId,
              text: bullet.text,
            })),
          })),
        };
      }),
    });

    const [resume] = await db.select().from(resumes).where(eq(resumes.id, created.id));
    expect(resume?.writingMethod).toBe('xyz');
    expect(resume?.tone).toBe('direct');

    const createdSections = await db.select().from(resumeSections).where(eq(resumeSections.resumeId, created.id));
    const createdSkillsSection = createdSections.find((section) => section.kind === 'skills');
    expect(createdSkillsSection).toBeDefined();
    const links = await db
      .select()
      .from(resumeSectionSkills)
      .where(eq(resumeSectionSkills.sectionId, createdSkillsSection!.id));
    expect(links.map((link) => link.skillId)).toEqual([skill.id]);

    const createdEntries = await db
      .select()
      .from(resumeEntries)
      .where(
        eq(
          resumeEntries.sectionId,
          createdSections.find((section) => section.kind === 'experience')!.id,
        ),
      );
    expect(createdEntries.length).toBeGreaterThan(0);
    const createdBullets = await db.select().from(resumeBullets);
    expect(createdBullets.some((bullet) => bullet.text.includes('Rewritten'))).toBe(true);
  }, 120_000);

  it('should confirm a reviewable import through the career profile service', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const [resumeImport] = await db
      .insert(resumeImports)
      .values({
        userId: ownerId,
        storageKey: null,
        status: 'ready_for_review',
        draft: {
          evidences: [{ statement: 'Led a team', experienceIndex: 0 }],
          experiences: [{ company: 'Acme', role: 'Engineer', startedOn: '2020-01', endedOn: null }],
          education: [],
          contactDetails: { fullName: 'Ada', email: null, phone: null, city: null, links: null },
        },
      })
      .returning();
    if (resumeImport === undefined) {
      throw new Error('Failed to create reviewable import');
    }

    const careerProfilesService = new CareerProfileService(db as never, makeNoopStorage() as never);
    await careerProfilesService.confirmResumeImport(resumeImport.id, ownerId);

    const [confirmed] = await db.select().from(resumeImports).where(eq(resumeImports.id, resumeImport.id));
    expect(confirmed?.status).toBe('confirmed');
  }, 120_000);
});
