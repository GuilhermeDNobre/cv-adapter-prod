import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test, expect, type Download } from '@playwright/test';
import { Client } from 'pg';
import {
  resetE2eDatabase,
  seedDeepSeekKey,
  setupTailoredWithKnownChanges,
  seedContactLinksForSetup,
  SEEDED_LINKEDIN_URL,
  SEEDED_GITHUB_URL,
  getCareerProfileForSetup,
  getCareerProfileIdForSetup,
  createBaseResumeWithEvidences,
  createJobDescriptionForSetup,
  createEvaluationForSetup,
  waitForEvaluationReady,
  createTailoredResumeForSetup,
  waitForResumeReady,
} from './helpers';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';

const E2E_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter_e2e';

const PDF_INSPECTOR_BIN = path.resolve(
  process.cwd(),
  '../api/node_modules/@firecrawl/pdf-inspector/bin/pdf-inspector.mjs',
);

function extractPdfMarkdown(pdfPath: string): string {
  return execFileSync('node', [PDF_INSPECTOR_BIN, pdfPath], { encoding: 'utf8' });
}

const require = createRequire(__filename);
const inspector = require('../../api/node_modules/@firecrawl/pdf-inspector/index.js') as {
  extractTextWithPositions: (buffer: Buffer) => Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    itemType: string;
    linkUrl?: string;
  }>;
  extractText: (buffer: Buffer) => string;
  classifyPdf: (buffer: Buffer) => { pageCount: number };
};

interface PositionedItem {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly page: number;
  readonly itemType: string;
  readonly linkUrl?: string;
}

function itemsOf(pdf: Buffer): PositionedItem[] {
  return inspector.extractTextWithPositions(pdf) as PositionedItem[];
}

function pageCountOf(pdf: Buffer): number {
  return inspector.classifyPdf(pdf).pageCount;
}

async function readPdfDownload(download: Download): Promise<{ pdf: Buffer; markdown: string }> {
  const suggested = download.suggestedFilename();
  const filePath = path.join(os.tmpdir(), `cv-adapter-export-${String(Date.now())}-${suggested}`);
  await download.saveAs(filePath);
  try {
    const pdf = fs.readFileSync(filePath);
    const markdown = extractPdfMarkdown(filePath).replace(/\s+/g, ' ');
    return { pdf, markdown };
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

test.describe('Exportação no Template novo', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });

  test('PDF em ordem de leitura, com links, sem destaque e em 1 página', async ({ page }) => {
    const seed = await setupTailoredWithKnownChanges(page);
    await seedContactLinksForSetup();
    await waitForResumeReady(page, seed.tailoredId);

    await test.step('1. Exportar pelo wizard e baixar o PDF', async () => {
      await page.goto(`/exportar/${seed.tailoredId}?vaga=${encodeURIComponent(seed.jobDescriptionId)}&avaliacao=${encodeURIComponent(seed.evaluationId)}`);
      await expect(page.getByRole('heading', { name: 'Exportar' })).toBeVisible();
      await page.getByRole('button', { name: 'Exportar PDF' }).click();
      await expect(page.getByRole('button', { name: 'Baixar PDF exportado' })).toBeVisible({ timeout: 60_000 });
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Baixar PDF exportado' }).click();
      const { pdf, markdown } = await readPdfDownload(await downloadPromise);
      expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');

      await test.step('2. Ordem empresa → período → cargo', async () => {
        const companyIndex = markdown.indexOf('University');
        const periodIndex = markdown.indexOf('2016-01-01');
        const roleIndex = markdown.indexOf('Computer Science');
        expect(companyIndex).toBeGreaterThanOrEqual(0);
        expect(periodIndex).toBeGreaterThanOrEqual(0);
        expect(roleIndex).toBeGreaterThanOrEqual(0);
        expect(companyIndex).toBeLessThan(periodIndex);
        expect(periodIndex).toBeLessThan(roleIndex);
      });

      await test.step('3. Links clicáveis do contato semeado', async () => {
        const items = itemsOf(pdf);
        const linkUrls = items.map((item) => item.linkUrl ?? '').filter((url) => url !== '');
        const hasLinkedIn = linkUrls.some((url) => url.includes('linkedin.com'));
        const hasGitHub = linkUrls.some((url) => url.includes('github.com'));
        expect(hasLinkedIn).toBe(true);
        expect(hasGitHub).toBe(true);
        expect(markdown).toContain('LinkedIn');
        expect(markdown).toContain('GitHub');
        expect(linkUrls).toContain(SEEDED_LINKEDIN_URL);
        expect(linkUrls).toContain(SEEDED_GITHUB_URL);
      });

      await test.step('4. Sem texto ou marca de destaque', async () => {
        expect(markdown).not.toContain('Alteração:');
        expect(markdown).not.toContain('data-change');
        expect(markdown).not.toContain('Aceitar');
        expect(markdown).not.toContain('Rejeitar');
      });

      await test.step('5. Uma página', async () => {
        const count = pageCountOf(pdf);
        expect(count).toBe(1);
      });
    });
  });

  test('volume do curriculo.tex cabe em 1 página no dense', async ({ page }) => {
    const skillBullets = [
      'Languages: JavaScript and TypeScript, Java and Python for backend APIs and frontend apps in production.',
      'Backend: Fastify, NestJS, Spring Boot and Node.js with REST, OpenAPI docs and automated test suites.',
      'Frontend: React, Next.js, HTML5, CSS3 and Tailwind CSS with responsive layouts and design systems.',
      'Data and messaging: PostgreSQL, MongoDB, Redis and RabbitMQ running in Docker with backups.',
      'DevOps and tools: Git and GitHub, Docker, CI and CD with GitHub Actions, Scrum teams and reviews.',
    ];
    const experienceBullets = [
      'Designed and shipped a SaaS platform alone from zero to production with billing, auth and transactional email.',
      'Built a REST API in Fastify and TypeScript with MongoDB and object storage, documented in OpenAPI Swagger.',
      'Integrated PIX and card payments with HMAC webhook validation, retries and reconciliation jobs daily.',
      'Built a multi-step React wizard with validated forms, interactive maps and motion for user onboarding.',
      'Covered the product with unit and integration tests across backend and web, over sixty suites in CI.',
      'Ran CI and CD on every push with automated builds, tests and deploys plus AI-assisted code reviews.',
    ];
    const extraBullets = [
      ...skillBullets,
      ...experienceBullets,
      'Tutored students learning to code with games and AI, reviewing exercises with 1:1 support weekly.',
      'Built a product catalog SPA in vanilla JavaScript and Bootstrap, improving the store web presence.',
      'Built a NestJS and PostgreSQL REST API for IT asset tracking with modular object-oriented design.',
      'Built Spring Boot REST APIs for Pix keys and bank transfer simulation with Postgres and Docker.',
      'Portuguese: native speaker, English: advanced level (C1) for work.',
      'Software engineering student seeking a fullstack internship with React, Node.js and NestJS delivery.',
    ];
    expect(extraBullets).toHaveLength(17);

    await page.goto('/chave');
    const { setupConfirmedCareerProfile } = await import('./helpers');
    await setupConfirmedCareerProfile(page);
    await seedContactLinksForSetup();
    const profile = await getCareerProfileForSetup(page);
    const careerProfileId = await getCareerProfileIdForSetup();
    const client = new Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
      const insertedIds: string[] = [];
      for (const statement of extraBullets) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO evidences (career_profile_id, experience_id, statement) VALUES ($1, $2, $3) RETURNING id`,
          [careerProfileId, profile.experienceId, statement],
        );
        const id = inserted.rows[0]?.id;
        if (id !== undefined) insertedIds.push(id);
      }
      expect(insertedIds).toHaveLength(17);
      const baseId = await createBaseResumeWithEvidences(page, 'E2E tex volume base', insertedIds);
      await waitForResumeReady(page, baseId);
      await client.query(`UPDATE resumes SET template = 'dense' WHERE id = $1`, [baseId]);
      const jobDescriptionId = await createJobDescriptionForSetup(page, JOB_DESCRIPTION_TEXT);
      const evaluationId = await createEvaluationForSetup(page, jobDescriptionId);
      await waitForEvaluationReady(page, evaluationId);
      const tailoredId = await createTailoredResumeForSetup(page, baseId, jobDescriptionId);
      await waitForResumeReady(page, tailoredId);
      await client.query(`UPDATE resumes SET template = 'dense' WHERE id = $1`, [tailoredId]);
      const volumeChars =
        extraBullets.reduce((total, bullet) => total + bullet.length, 0) +
        'Henrique Carvalho Pereira'.length +
        'henrique.carvalho7@example.com'.length +
        '(11) 91234-5678'.length;
      expect(volumeChars).toBeGreaterThan(1500);
      expect(extraBullets).toHaveLength(17);

      await page.goto(`/exportar/${tailoredId}?vaga=${encodeURIComponent(jobDescriptionId)}&avaliacao=${encodeURIComponent(evaluationId)}`);
      await expect(page.getByRole('heading', { name: 'Exportar' })).toBeVisible();
      await page.getByRole('button', { name: 'Exportar PDF' }).click();
      await expect(page.getByRole('button', { name: 'Baixar PDF exportado' })).toBeVisible({ timeout: 60_000 });
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Baixar PDF exportado' }).click();
      const { pdf } = await readPdfDownload(await downloadPromise);
      const count = pageCountOf(pdf);
      expect(count).toBe(1);
    } finally {
      await client.end();
    }
  });
});
