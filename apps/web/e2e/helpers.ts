import path from 'node:path';
import fs from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';

const API_PORT = 3101;
const API_BASE = `http://localhost:${String(API_PORT)}`;
const API_BASE_FOR_TEST = `http://127.0.0.1:${String(API_PORT)}`;
const E2E_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter_e2e';

export const E2E_INVALID_KEY_PREFIX = 'sk-e2e-invalid';
export const E2E_NO_BALANCE_KEY_PREFIX = 'sk-e2e-nobalance';
export const E2E_VALID_DEEPSEEK_KEY = 'sk-e2e-valid-key-0001';

export async function waitForAnimationsToSettle(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), {
      timeout: 5000,
    })
    .toBe(0);
}

export async function seedDeepSeekKey(page: Page): Promise<void> {
  await page.goto('/chave');
  await page.evaluate(
    async ({ apiBase, apiKey }: { apiBase: string; apiKey: string }) => {
      const saveResponse = await fetch(`${apiBase}/settings/deepseek-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!saveResponse.ok) {
        throw new Error(`Seeding DeepSeek key failed ${String(saveResponse.status)}: ${await saveResponse.text()}`);
      }
      const statusResponse = await fetch(`${apiBase}/settings/deepseek-key`);
      if (!statusResponse.ok) {
        throw new Error(`Confirming seeded key failed ${String(statusResponse.status)}: ${await statusResponse.text()}`);
      }
      const status = (await statusResponse.json()) as { configured: boolean };
      if (!status.configured) {
        throw new Error('Seeded DeepSeek key is not reported as configured');
      }
    },
    { apiBase: API_BASE, apiKey: E2E_VALID_DEEPSEEK_KEY },
  );
}

export async function resetE2eDatabase(): Promise<void> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const tables = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'users'`,
    );
    const names = tables.rows.map((row) => `"${row.tablename}"`).join(', ');
    if (names.length > 0) {
      await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}

export const RESUMES_DIR = path.resolve(process.cwd(), '../api/test/fixtures/resumes');
export const SINGLE_COLUMN_PDF = path.join(RESUMES_DIR, 'single-column.pdf');
export const SCANNED_PDF = path.join(RESUMES_DIR, 'scanned-no-text-layer.pdf');

export async function uploadResumeThroughTheScreen(page: Page, filePath: string): Promise<void> {
  const input = page.getByLabel('Arquivo do currículo');
  const submit = page.getByRole('button', { name: 'Enviar currículo' });
  await expect(async () => {
    await input.setInputFiles([]);
    await input.setInputFiles(filePath);
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await submit.click();
}

export async function seedResumeImportForSetup(page: Page, filePath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  return page.evaluate(
    async ({ apiBase, fileName, fileBytes }: { apiBase: string; fileName: string; fileBytes: number[] }) => {
      const blob = new Blob([new Uint8Array(fileBytes)], { type: 'application/pdf' });
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${apiBase}/resume-imports`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Upload failed ${String(response.status)}: ${await response.text()}`);
      }
      const data = (await response.json()) as { id: string };
      return data.id;
    },
    { apiBase: API_BASE, fileName, fileBytes: Array.from(fileBuffer) },
  );
}

async function readResumeImportState(page: Page, resumeImportId: string): Promise<'pending' | 'done' | 'failed'> {
  const response = await page.request.get(`${API_BASE_FOR_TEST}/resume-imports/${resumeImportId}`);
  if (!response.ok()) {
    return 'pending';
  }
  const data = (await response.json()) as { status: string; draft: unknown };
  if (data.status === 'ready_for_review' && data.draft !== null) {
    return 'done';
  }
  if (data.status === 'confirmed') {
    return 'done';
  }
  if (data.status === 'failed') {
    return 'failed';
  }
  return 'pending';
}

export async function waitForResumeImport(page: Page, resumeImportId: string): Promise<void> {
  await expect.poll(() => readResumeImportState(page, resumeImportId), {
    timeout: 60_000,
    intervals: [2_000],
  }).not.toBe('pending');
  const response = await page.request.get(`${API_BASE_FOR_TEST}/resume-imports/${resumeImportId}`);
  if (!response.ok()) {
    return;
  }
  const data = (await response.json()) as { status: string; failureReason: string | null };
  if (data.status === 'failed') {
    throw new Error(`Resume import failed: ${data.failureReason ?? 'unknown'}`);
  }
}

export async function followImportToReview(page: Page): Promise<void> {
  const reviewLink = page.getByRole('link', { name: 'Revisar o rascunho' });
  await reviewLink.waitFor({ timeout: 60_000 });
  await reviewLink.click();
  await page.getByRole('heading', { name: /Confira o que lemos/ }).waitFor({ timeout: 15_000 });
}

export async function navigateToReview(page: Page, resumeImportId: string): Promise<void> {
  await page.goto(`/revisao?resumeImportId=${encodeURIComponent(resumeImportId)}`);
  await page.getByRole('heading', { name: /Confira o que lemos/ }).waitFor({ timeout: 15_000 });
}

export async function navigateToVagaAndResumeStep(page: Page): Promise<void> {
  await page.goto('/vaga');
  const textarea = page.getByLabel('Anúncio da vaga');
  await textarea.fill(JOB_DESCRIPTION_TEXT);
  await page.getByRole('button', { name: 'Ver Requirements' }).click();
  await page.getByRole('heading', { name: 'Requirements da vaga' }).waitFor({ timeout: 10_000 });

  await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
  await page.waitForURL(/\/curriculo\?vaga=.+/);
}

export async function confirmReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Confirmar revisão' }).click();
  await page.getByRole('button', { name: /Confirmar e criar meu Career Profile/ }).click();
  await page.getByText('Seu Career Profile está pronto').waitFor({ timeout: 10_000 });
}

export async function setupConfirmedCareerProfile(page: Page): Promise<void> {
  await navigateToVagaAndResumeStep(page);
  await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
  const resumeImportId = await seedResumeImportForSetup(page, SINGLE_COLUMN_PDF);
  await waitForResumeImport(page, resumeImportId);
  await navigateToReview(page, resumeImportId);
  await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
  await confirmReview(page);
}

export async function readPendingJobDescriptionId(page: Page): Promise<string | null> {
  return page.evaluate(() => window.sessionStorage.getItem('cv-adapter.pending-job-description-id'));
}

export async function createBaseResumeForSetup(page: Page, name: string): Promise<string> {
  return page.evaluate(
    async ({ apiBase, resumeName }: { apiBase: string; resumeName: string }) => {
      const profileResponse = await fetch(`${apiBase}/career-profile`);
      if (!profileResponse.ok) {
        throw new Error(`Loading career profile failed ${String(profileResponse.status)}: ${await profileResponse.text()}`);
      }
      const profile = (await profileResponse.json()) as {
        experiences: Array<{ id: string }>;
        educationEntries: Array<{ id: string }>;
        evidences: Array<{ id: string }>;
      };
      const firstEvidence = profile.evidences[0];
      const secondEvidence = profile.evidences[1];
      if (firstEvidence === undefined || secondEvidence === undefined) {
        throw new Error('Career profile has fewer than two evidences');
      }
      const body = {
        name: resumeName,
        language: 'en',
        sections: [
          {
            kind: 'experience',
            experienceIds: profile.experiences.map((experience) => experience.id),
            evidenceIds: [firstEvidence.id],
          },
          { kind: 'skills', evidenceIds: [secondEvidence.id] },
          { kind: 'education', educationEntryIds: profile.educationEntries.map((entry) => entry.id) },
        ],
      };
      const createResponse = await fetch(`${apiBase}/base-resumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!createResponse.ok) {
        throw new Error(`Creating base resume failed ${String(createResponse.status)}: ${await createResponse.text()}`);
      }
      const created = (await createResponse.json()) as { id: string };
      return created.id;
    },
    { apiBase: API_BASE, resumeName: name },
  );
}

async function readResumeState(page: Page, resumeId: string): Promise<'pending' | 'done' | 'failed'> {
  const response = await page.request.get(`${API_BASE_FOR_TEST}/resumes/${resumeId}`);
  if (!response.ok()) {
    return 'pending';
  }
  const data = (await response.json()) as { generationStatus: string };
  if (data.generationStatus === 'ready') {
    return 'done';
  }
  if (data.generationStatus === 'failed') {
    return 'failed';
  }
  return 'pending';
}

export async function waitForResumeReady(page: Page, resumeId: string): Promise<void> {
  await expect.poll(() => readResumeState(page, resumeId), {
    timeout: 120_000,
    intervals: [2_000],
  }).not.toBe('pending');
  const response = await page.request.get(`${API_BASE_FOR_TEST}/resumes/${resumeId}`);
  if (!response.ok()) {
    return;
  }
  const data = (await response.json()) as { generationStatus: string; failureReason: string | null };
  if (data.generationStatus === 'failed') {
    throw new Error(`Resume generation failed: ${data.failureReason ?? 'unknown'}`);
  }
}

export async function exportResumeForSetup(page: Page, resumeId: string): Promise<string> {
  return page.evaluate(
    async ({ apiBase, id }: { apiBase: string; id: string }) => {
      const response = await fetch(`${apiBase}/resumes/${id}/exports`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Exporting resume failed ${String(response.status)}: ${await response.text()}`);
      }
      const created = (await response.json()) as { exportId: string };
      return created.exportId;
    },
    { apiBase: API_BASE, id: resumeId },
  );
}

export async function listResumesForSetup(page: Page): Promise<Array<{ id: string; exportsCount: number }>> {
  return page.evaluate(
    async ({ apiBase }: { apiBase: string }) => {
      const response = await fetch(`${apiBase}/resumes`);
      if (!response.ok) {
        throw new Error(`Listing resumes failed ${String(response.status)}: ${await response.text()}`);
      }
      const data = (await response.json()) as { resumes: Array<{ id: string; exports: unknown[] }> };
      return data.resumes.map((resume) => ({ id: resume.id, exportsCount: resume.exports.length }));
    },
    { apiBase: API_BASE },
  );
}

export async function apiStatusForSetup(page: Page, apiPath: string): Promise<number> {
  return page.evaluate(
    async ({ apiBase, path }: { apiBase: string; path: string }) => {
      const response = await fetch(`${apiBase}${path}`);
      return response.status;
    },
    { apiBase: API_BASE, path: apiPath },
  );
}

export async function isDeepSeekKeyConfigured(page: Page): Promise<boolean> {
  return page.evaluate(
    async ({ apiBase }: { apiBase: string }) => {
      const response = await fetch(`${apiBase}/settings/deepseek-key`);
      if (!response.ok) {
        throw new Error(`Reading key status failed ${String(response.status)}: ${await response.text()}`);
      }
      const status = (await response.json()) as { configured: boolean };
      return status.configured;
    },
    { apiBase: API_BASE },
  );
}

export async function navigateToAvaliacao(page: Page): Promise<void> {
  await page.getByRole('link', { name: /Avançar para Avaliação/ }).click();
  await page.waitForURL(/\/avaliacao/);
  await page.getByRole('heading', { name: 'Match Score' }).waitFor({ timeout: 30_000 });
}

export interface CareerProfileForSetup {
  readonly experienceId: string;
  readonly educationEntryIds: string[];
  readonly evidenceIds: string[];
  readonly evidenceStatements: string[];
}

export async function getCareerProfileForSetup(page: Page): Promise<CareerProfileForSetup> {
  return page.evaluate(
    async ({ apiBase }: { apiBase: string }) => {
      const response = await fetch(`${apiBase}/career-profile`);
      if (!response.ok) {
        throw new Error(`Loading career profile failed ${String(response.status)}: ${await response.text()}`);
      }
      const profile = (await response.json()) as {
        experiences: Array<{ id: string }>;
        educationEntries: Array<{ id: string }>;
        evidences: Array<{ id: string; statement: string; experienceId: string | null }>;
      };
      const experiences = profile.experiences.map((experience) => experience.id);
      const firstExperience = experiences[0];
      if (firstExperience === undefined) {
        throw new Error('Career profile misses experiences');
      }
      return {
        experienceId: firstExperience,
        educationEntryIds: profile.educationEntries.map((entry) => entry.id),
        evidenceIds: profile.evidences.map((evidence) => evidence.id),
        evidenceStatements: profile.evidences.map((evidence) => evidence.statement),
      };
    },
    { apiBase: API_BASE },
  );
}

export async function getCareerProfileIdForSetup(): Promise<string> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const rows = await client.query<{ id: string }>(`SELECT id FROM career_profiles LIMIT 1`);
    const id = rows.rows[0]?.id;
    if (id === undefined) {
      throw new Error('Career profile missing for setup');
    }
    return id;
  } finally {
    await client.end();
  }
}

export async function createJobDescriptionForSetup(page: Page, text: string): Promise<string> {
  return page.evaluate(
    async ({ apiBase, jobText }: { apiBase: string; jobText: string }) => {
      const response = await fetch(`${apiBase}/job-descriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: jobText }),
      });
      if (!response.ok) {
        throw new Error(`Creating job description failed ${String(response.status)}: ${await response.text()}`);
      }
      const created = (await response.json()) as { id: string };
      return created.id;
    },
    { apiBase: API_BASE, jobText: text },
  );
}

export async function createEvaluationForSetup(page: Page, jobDescriptionId: string): Promise<string> {
  return page.evaluate(
    async ({ apiBase, jobId }: { apiBase: string; jobId: string }) => {
      const response = await fetch(`${apiBase}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDescriptionId: jobId }),
      });
      if (!response.ok) {
        throw new Error(`Creating evaluation failed ${String(response.status)}: ${await response.text()}`);
      }
      const created = (await response.json()) as { id: string };
      return created.id;
    },
    { apiBase: API_BASE, jobId: jobDescriptionId },
  );
}

async function readEvaluationState(page: Page, evaluationId: string): Promise<'pending' | 'done' | 'failed'> {
  const response = await page.request.get(`${API_BASE_FOR_TEST}/evaluations/${evaluationId}`);
  if (!response.ok()) {
    return 'pending';
  }
  const data = (await response.json()) as { status: string };
  if (data.status === 'ready') {
    return 'done';
  }
  if (data.status === 'failed') {
    return 'failed';
  }
  return 'pending';
}

export async function waitForEvaluationReady(page: Page, evaluationId: string): Promise<void> {
  await expect.poll(() => readEvaluationState(page, evaluationId), {
    timeout: 120_000,
    intervals: [2_000],
  }).not.toBe('pending');
  const response = await page.request.get(`${API_BASE_FOR_TEST}/evaluations/${evaluationId}`);
  if (!response.ok()) {
    return;
  }
  const data = (await response.json()) as { status: string };
  if (data.status === 'failed') {
    throw new Error('Evaluation failed');
  }
}

export async function createBaseResumeWithEvidences(
  page: Page,
  name: string,
  evidenceIds: string[],
): Promise<string> {
  return page.evaluate(
    async ({ apiBase, resumeName, evidences }: { apiBase: string; resumeName: string; evidences: string[] }) => {
      const profileResponse = await fetch(`${apiBase}/career-profile`);
      if (!profileResponse.ok) {
        throw new Error(`Loading career profile failed ${String(profileResponse.status)}`);
      }
      const profile = (await profileResponse.json()) as {
        experiences: Array<{ id: string }>;
        educationEntries: Array<{ id: string }>;
      };
      const body = {
        name: resumeName,
        language: 'en',
        sections: [
          {
            kind: 'experience',
            experienceIds: profile.experiences.map((experience) => experience.id),
            evidenceIds: evidences,
          },
          { kind: 'education', educationEntryIds: profile.educationEntries.map((entry) => entry.id) },
        ],
      };
      const createResponse = await fetch(`${apiBase}/base-resumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!createResponse.ok) {
        throw new Error(`Creating base resume failed ${String(createResponse.status)}: ${await createResponse.text()}`);
      }
      const created = (await createResponse.json()) as { id: string };
      return created.id;
    },
    { apiBase: API_BASE, resumeName: name, evidences: evidenceIds },
  );
}

export async function createTailoredResumeForSetup(
  page: Page,
  baseResumeId: string,
  jobDescriptionId: string,
): Promise<string> {
  return page.evaluate(
    async ({ apiBase, baseId, jobId }: { apiBase: string; baseId: string; jobId: string }) => {
      const response = await fetch(`${apiBase}/tailored-resumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseResumeId: baseId, jobDescriptionId: jobId }),
      });
      if (!response.ok) {
        throw new Error(`Creating tailored resume failed ${String(response.status)}: ${await response.text()}`);
      }
      const created = (await response.json()) as { id: string };
      return created.id;
    },
    { apiBase: API_BASE, baseId: baseResumeId, jobId: jobDescriptionId },
  );
}

export async function getResumeDocumentForSetup(
  page: Page,
  resumeId: string,
): Promise<{
  adaptationPlan: unknown;
  adaptationChanges: { addedEvidences: Array<{ id: string; statement: string }>; removedEvidences: Array<{ id: string; statement: string }> } | null;
  sections: Array<{ entries: Array<{ bullets: Array<{ id: string; text: string; evidenceId: string | null }> }> }>;
}> {
  return page.evaluate(
    async ({ apiBase, id }: { apiBase: string; id: string }) => {
      const response = await fetch(`${apiBase}/resumes/${id}`);
      if (!response.ok) {
        throw new Error(`Loading resume failed ${String(response.status)}: ${await response.text()}`);
      }
      const document = (await response.json()) as {
        adaptationPlan: unknown;
        adaptationChanges: { addedEvidences: Array<{ id: string; statement: string }>; removedEvidences: Array<{ id: string; statement: string }> } | null;
        sections: Array<{ entries: Array<{ bullets: Array<{ id: string; text: string; evidenceId: string | null }> }> }>;
      };
      return { adaptationPlan: document.adaptationPlan, adaptationChanges: document.adaptationChanges, sections: document.sections };
    },
    { apiBase: API_BASE, id: resumeId },
  );
}

export const KNOWN_REMOVED_STATEMENT = 'Migrated legacy monolith to Kubernetes with zero downtime';

export async function insertRemovedEvidenceForSetup(): Promise<{ id: string; statement: string }> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const profileRows = await client.query<{ id: string }>(`SELECT id FROM career_profiles LIMIT 1`);
    const profileId = profileRows.rows[0]?.id;
    const experienceRows = await client.query<{ id: string }>(`SELECT id FROM experiences LIMIT 1`);
    const experienceId = experienceRows.rows[0]?.id;
    if (profileId === undefined || experienceId === undefined) {
      throw new Error('Career profile or experience missing for removed evidence seed');
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO evidences (career_profile_id, experience_id, statement) VALUES ($1, $2, $3) RETURNING id`,
      [profileId, experienceId, KNOWN_REMOVED_STATEMENT],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined) {
      throw new Error('Failed to insert removed evidence');
    }
    return { id, statement: KNOWN_REMOVED_STATEMENT };
  } finally {
    await client.end();
  }
}

interface StoredAdaptationPlan {
  readonly allocations?: Array<{ sectionKind: string; evidenceIds: string[] }>;
  readonly coverages?: unknown;
  readonly baseEvidenceIds?: unknown;
  readonly addedEvidenceIds?: unknown;
  readonly removedEvidenceIds?: unknown;
}

export async function rewriteTailoredPlanForKnownChanges(
  tailoredId: string,
  baseEvidenceIds: string[],
  allocatedEvidenceIds: string[],
): Promise<void> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    let plan: StoredAdaptationPlan | null = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const current = await client.query<{ adaptation_plan: unknown }>(
        `SELECT adaptation_plan FROM resumes WHERE id = $1`,
        [tailoredId],
      );
      const row = current.rows[0] as { adaptation_plan?: unknown } | undefined;
      const candidate = (row?.adaptation_plan ?? null) as StoredAdaptationPlan | null;
      if (candidate !== null && typeof candidate === 'object') {
        plan = candidate;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (plan === null) {
      throw new Error(`Tailored resume misses an adaptation plan tailoredId=${tailoredId}`);
    }
    const allocations = (plan.allocations ?? []).map((allocation) => ({
      sectionKind: allocation.sectionKind,
      evidenceIds: allocatedEvidenceIds,
    }));
    const nextPlan = {
      ...plan,
      allocations,
      baseEvidenceIds,
    };
    await client.query(`UPDATE resumes SET adaptation_plan = $1 WHERE id = $2`, [
      JSON.stringify(nextPlan),
      tailoredId,
    ]);
  } finally {
    await client.end();
  }
}

export async function deleteTailoredBulletsForEvidence(
  tailoredId: string,
  evidenceId: string,
): Promise<void> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM resume_bullets WHERE id IN (
        SELECT b.id FROM resume_bullets b
        JOIN resume_entries e ON e.id = b.entry_id
        JOIN resume_sections s ON s.id = e.section_id
        WHERE s.resume_id = $1 AND b.evidence_id = $2
      )`,
      [tailoredId, evidenceId],
    );
  } finally {
    await client.end();
  }
}

export interface TailoredWithKnownChanges {
  readonly baseId: string;
  readonly tailoredId: string;
  readonly jobDescriptionId: string;
  readonly evaluationId: string;
  readonly addedEvidenceId: string;
  readonly addedStatement: string;
  readonly secondAddedEvidenceId: string;
  readonly secondAddedStatement: string;
  readonly removedEvidenceId: string;
  readonly removedStatement: string;
}

export async function setupTailoredWithKnownChanges(page: Page): Promise<TailoredWithKnownChanges> {
  await setupConfirmedCareerProfile(page);
  const profile = await getCareerProfileForSetup(page);
  const firstEvidence = profile.evidenceIds[0];
  const secondEvidence = profile.evidenceIds[1];
  if (firstEvidence === undefined || secondEvidence === undefined) {
    throw new Error('Career profile has fewer than two evidences');
  }
  const addedExtra = await insertRemovedEvidenceForSetup();
  const baseId = await createBaseResumeWithEvidences(page, 'E2E review base', [secondEvidence]);
  await waitForResumeReady(page, baseId);
  const jobDescriptionId = await createJobDescriptionForSetup(page, JOB_DESCRIPTION_TEXT);
  const evaluationId = await createEvaluationForSetup(page, jobDescriptionId);
  await waitForEvaluationReady(page, evaluationId);
  const tailoredId = await createTailoredResumeForSetup(page, baseId, jobDescriptionId);
  await waitForResumeReady(page, tailoredId);
  await rewriteTailoredPlanForKnownChanges(tailoredId, [secondEvidence], [firstEvidence, addedExtra.id]);
  await deleteTailoredBulletsForEvidence(tailoredId, secondEvidence);
  const document = await getResumeDocumentForSetup(page, tailoredId);
  const addedIds = document.adaptationChanges?.addedEvidences.map((item) => item.id) ?? [];
  const removedIds = document.adaptationChanges?.removedEvidences.map((item) => item.id) ?? [];
  if (!addedIds.includes(firstEvidence) || !addedIds.includes(addedExtra.id) || !removedIds.includes(secondEvidence)) {
    throw new Error(`Known changes seed mismatch added=${addedIds.join(',')} removed=${removedIds.join(',')}`);
  }
  const addedStatement =
    document.adaptationChanges?.addedEvidences.find((item) => item.id === firstEvidence)?.statement ?? '';
  const secondAddedStatement =
    document.adaptationChanges?.addedEvidences.find((item) => item.id === addedExtra.id)?.statement ?? '';
  const profileAfter = await getCareerProfileForSetup(page);
  const removedStatement =
    profileAfter.evidenceStatements[profileAfter.evidenceIds.indexOf(secondEvidence)] ?? '';
  return {
    baseId,
    tailoredId,
    jobDescriptionId,
    evaluationId,
    addedEvidenceId: firstEvidence,
    addedStatement,
    secondAddedEvidenceId: addedExtra.id,
    secondAddedStatement,
    removedEvidenceId: secondEvidence,
    removedStatement,
  };
}

export const SEEDED_LINKEDIN_URL = 'https://linkedin.com/in/janet-doe';
export const SEEDED_GITHUB_URL = 'https://github.com/janetdoe';

export async function seedContactLinksForSetup(): Promise<void> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE contact_details SET links = $1::jsonb, phone = $2 WHERE career_profile_id IN (SELECT id FROM career_profiles)`,
      [JSON.stringify([SEEDED_LINKEDIN_URL, SEEDED_GITHUB_URL]), '(11) 91234-5678'],
    );
  } finally {
    await client.end();
  }
}

export async function readResumeContactForSetup(
  page: Page,
  resumeId: string,
): Promise<{ name: string; links: string[] }> {
  return page.evaluate(
    async ({ apiBase, id }: { apiBase: string; id: string }) => {
      const response = await fetch(`${apiBase}/resumes/${id}`);
      if (!response.ok) {
        throw new Error(`Loading resume failed ${String(response.status)}`);
      }
      const document = (await response.json()) as {
        contact: { name: string; links: string[] | null };
      };
      return { name: document.contact.name, links: document.contact.links ?? [] };
    },
    { apiBase: API_BASE, id: resumeId },
  );
}

async function readProposalState(page: Page, resumeImportId: string): Promise<'pending' | 'done' | 'failed'> {
  const response = await page.request.get(`${API_BASE_FOR_TEST}/resume-imports/${resumeImportId}/base-resume-proposal`);
  if (!response.ok()) {
    return 'pending';
  }
  const data = (await response.json()) as { status: string };
  if (data.status === 'ready') {
    return 'done';
  }
  if (data.status === 'failed') {
    return 'failed';
  }
  return 'pending';
}

export async function waitForBaseResumeProposal(page: Page, resumeImportId: string): Promise<void> {
  await expect.poll(() => readProposalState(page, resumeImportId), {
    timeout: 120_000,
    intervals: [2_000],
  }).not.toBe('pending');
  const response = await page.request.get(`${API_BASE_FOR_TEST}/resume-imports/${resumeImportId}/base-resume-proposal`);
  if (!response.ok()) {
    return;
  }
  const data = (await response.json()) as { status: string; failureReason: string | null };
  if (data.status === 'failed') {
    throw new Error(`Base resume proposal failed: ${data.failureReason ?? 'unknown'}`);
  }
}

export async function approveProposalThroughTheScreen(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Confira o Base Resume montado' })).toBeVisible();
  const useRewritten = page.getByRole('button', { name: 'Usar reescrita' });
  await expect(useRewritten.first()).toBeVisible({ timeout: 120_000 });
  const total = await useRewritten.count();
  for (let index = 0; index < total; index++) {
    await useRewritten.first().click();
    await expect(page.getByText('Reescrita escolhida').first()).toBeVisible({ timeout: 10_000 });
  }
  await expect(page.getByText('Todos os bullets decididos. Pronto para aprovar.')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Aprovar Base Resume' }).click();
  await expect(page.getByRole('heading', { name: 'Base Resume salvo' })).toBeVisible({ timeout: 30_000 });
  const continueHref = await page.getByRole('link', { name: 'Continuar' }).getAttribute('href');
  const resumeId = new URL(continueHref ?? '', 'http://localhost').searchParams.get('resumeId') ?? '';
  await page.getByRole('link', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Seu currículo base está pronto' })).toBeVisible({ timeout: 15_000 });
  return resumeId;
}
