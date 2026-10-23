import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type Download, type Page } from '@playwright/test';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';
import {
  resetE2eDatabase,
  seedDeepSeekKey,
  setupConfirmedCareerProfile,
  createBaseResumeForSetup,
  waitForResumeReady,
  createEvaluationForSetup,
  waitForEvaluationReady,
} from './helpers';

const BASE_RESUME_NAME = 'E2E backend focus';
const EDITED_BULLET_TEXT = 'Built scalable TypeScript applications for 5 years, edited by the person in this resume.';
const AI_INSTRUCTION_TEXT = 'Deixe os bullets mais curtos.';
const APPROVED_SUGGESTION_MARK = 'Draft experience with React';
const UNAPPROVED_SUGGESTION_MARK = '42%';

// The web package cannot declare @firecrawl/pdf-inspector (its package.json is out
// of scope for this task), so the test runs the copy installed for the API as a CLI.
const PDF_INSPECTOR_BIN = path.resolve(
  process.cwd(),
  '../api/node_modules/@firecrawl/pdf-inspector/bin/pdf-inspector.mjs',
);

function extractPdfMarkdown(pdfPath: string): string {
  return execFileSync('node', [PDF_INSPECTOR_BIN, pdfPath], { encoding: 'utf8' });
}

async function readPdfDownload(download: Download): Promise<{ pdf: Buffer; text: string }> {
  const suggested = download.suggestedFilename();
  const filePath = path.join(os.tmpdir(), `cv-adapter-e2e-${String(Date.now())}-${suggested}`);
  await download.saveAs(filePath);
  const pdf = fs.readFileSync(filePath);
  try {
    return { pdf, text: extractPdfMarkdown(filePath).replace(/\s+/g, ' ') };
  } finally {
    fs.rmSync(filePath);
  }
}

let tailoredIdForExport = '';
let jobIdForExport = '';
let evaluationIdForExport = '';

test.describe('Currículo completo — do Base Resume ao PDF', () => {
  test.setTimeout(300_000);
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });
  test('gera o Tailored, edita, reescreve, aprova e baixa o PDF', async ({ page }) => {
    await test.step('1. Criar o Base Resume e ver a pré-visualização paginada', async () => {
      await createBaseAndCheckPreview(page);
    });

    await test.step('2. Colar a vaga e gerar o Tailored Resume', async () => {
      await pasteJobAndGenerateTailored(page);
    });

    await test.step('3. Editar um Bullet do Tailored', async () => {
      await editTailoredBullet(page);
    });

    await test.step('4. Mover e remover um Bullet e ver o que mudou', async () => {
      await moveAndRemoveBullet(page);
    });

    await test.step('5. Pedir à IA para reescrever a Section de forma assíncrona', async () => {
      await askAiToRewriteSection(page);
    });

    await test.step('6. Aprovar uma Suggestion e manter a outra como rascunho', async () => {
      await approveDraftSuggestion(page);
    });

    await test.step('7. Exportar e baixar o PDF com só a Suggestion aprovada', async () => {
      await exportAndCheckPdf(page);
    });
  });
});

async function createBaseAndCheckPreview(page: Page): Promise<void> {
  await setupConfirmedCareerProfile(page);
  const baseId = await createBaseResumeForSetup(page, BASE_RESUME_NAME);
  await waitForResumeReady(page, baseId);
  await page.goto(`/curriculos/${baseId}`);
  await expect(page).toHaveURL(/\/revisar\/.+/);
  await expect(page.getByRole('heading', { name: BASE_RESUME_NAME })).toBeVisible();
  await expect(page.getByTitle('Pré-visualização do currículo')).toBeVisible();
  await expect(page.getByText(/página/)).toBeVisible({ timeout: 30_000 });
  await expect(page.frameLocator('iframe[title="Pré-visualização do currículo"]').locator('.pagedjs_page')).not.toHaveCount(0, { timeout: 30_000 });
  const previewFit = await page.evaluate(() => {
    const iframe = document.querySelector(
      'iframe[title="Pré-visualização do currículo"]',
    ) as HTMLIFrameElement | null;
    const doc = iframe?.contentDocument;
    if (doc === null || doc === undefined) return null;
    const pageElement = doc.querySelector('.pagedjs_page');
    if (pageElement === null) return null;
    return {
      pageRight: pageElement.getBoundingClientRect().right,
      frameWidth: doc.documentElement.clientWidth,
    };
  });
  expect(previewFit).not.toBeNull();
  expect(previewFit?.pageRight).toBeLessThanOrEqual((previewFit?.frameWidth ?? 0) + 1);
  await page.frameLocator('iframe[title="Pré-visualização do currículo"]').getByText('Professional Experience').first().click();
  await expect(page.getByRole('region', { name: 'Painel da Section Professional Experience' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
}

async function pasteJobAndGenerateTailored(page: Page): Promise<void> {
  await page.goto('/vaga');
  await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
  await page.getByRole('button', { name: 'Ver Requirements' }).click();
  await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
  await expect(page.getByText('TypeScript', { exact: true })).toBeVisible();
  const href = await page.getByRole('link', { name: /Avançar para Currículo/ }).getAttribute('href');
  jobIdForExport = new URL(href ?? '', 'http://localhost').searchParams.get('vaga') ?? '';
  expect(jobIdForExport).not.toBe('');
  evaluationIdForExport = await createEvaluationForSetup(page, jobIdForExport);
  await waitForEvaluationReady(page, evaluationIdForExport);
  await page.goto(`/avaliacao/${evaluationIdForExport}?vaga=${encodeURIComponent(jobIdForExport)}`);
  await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Avançar para Adaptar' }).click();
  await page.waitForURL(/\/adaptar\?.+/);
  await page.getByRole('button', { name: 'Gerar currículo para esta vaga' }).click();
  await page.waitForURL(/\/revisar\/.+/);
  tailoredIdForExport = new URL(page.url()).pathname.split('/revisar/')[1] ?? '';
  expect(tailoredIdForExport).not.toBe('');
  await waitForResumeReady(page, tailoredIdForExport);
  await expect(page.getByText(/Tailored Resume · Pronto/)).toBeVisible();
  await page.getByRole('button', { name: 'Cobertura' }).click();
  await expect(page.getByRole('heading', { name: 'Cobertura da vaga' })).toBeVisible();
  await expect(page.getByText('TypeScript', { exact: true })).toBeVisible();
  await expect(page.getByText('Coberto', { exact: true })).toBeVisible();
  await expect(page.getByText('Gap', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/de \d+ alterações/)).toBeVisible();
}

async function openExperienceDrawer(page: Page): Promise<void> {
  const drawerOpen = await page.getByRole('region', { name: 'Painel da Section Professional Experience' }).count();
  if (drawerOpen === 0) {
    await page.frameLocator('iframe[title="Pré-visualização do currículo"]').getByText('Professional Experience').first().click();
    await expect(page.getByRole('region', { name: 'Painel da Section Professional Experience' })).toBeVisible();
  }
}

async function editTailoredBullet(page: Page): Promise<void> {
  await openExperienceDrawer(page);
  const sectionPanel = page.getByRole('region', { name: 'Painel da Section Professional Experience' });
  await sectionPanel.getByRole('button', { name: 'Editar' }).first().click();
  await sectionPanel.getByLabel('Texto do Bullet').fill(EDITED_BULLET_TEXT);
  await sectionPanel.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(sectionPanel.getByText('Bullet salvo.')).toBeVisible();
  await expect(sectionPanel.getByText('Editado por você neste currículo.')).toBeVisible();
}

async function moveAndRemoveBullet(page: Page): Promise<void> {
  const sectionPanel = page.getByRole('region', { name: 'Painel da Section Professional Experience' });
  await expect(sectionPanel.getByRole('button', { name: /^Mover para baixo o Bullet 1:/ }).first()).toBeEnabled();
  await sectionPanel.getByRole('button', { name: /^Mover para baixo o Bullet 1:/ }).first().click();
  await expect(sectionPanel.getByText('Bullet movido.')).toBeVisible();
  await sectionPanel.getByRole('button', { name: /^Remover o Bullet 2:/ }).first().click();
  await expect(sectionPanel.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await sectionPanel.getByRole('button', { name: 'Confirmar remover Bullet' }).click();
  await expect(sectionPanel.getByText('Bullet removido.')).toBeVisible();
}

async function askAiToRewriteSection(page: Page): Promise<void> {
  const sectionPanel = page.getByRole('region', { name: 'Painel da Section Professional Experience' });
  await sectionPanel.getByLabel('O que mudar nesta seção?').fill(AI_INSTRUCTION_TEXT);
  await sectionPanel.getByRole('button', { name: 'Aplicar' }).click();
  await expect(sectionPanel.getByText('Reescrevendo…')).toBeVisible();
  await expect(page.getByText('Reescrita concluída. O documento está pronto.')).toBeVisible({ timeout: 120_000 });
  await expect(sectionPanel.getByRole('button', { name: 'Desfazer' })).toBeVisible();
  await expect(sectionPanel.getByText('Can you provide the source for "42%"?')).toBeVisible();
}

async function approveDraftSuggestion(page: Page): Promise<void> {
  const sectionPanel = page.getByRole('region', { name: 'Painel da Section Professional Experience' });
  await expect(sectionPanel.getByText('Do you have experience with React?')).toBeVisible();
  await expect(sectionPanel.getByRole('button', { name: 'Aprovar' })).toHaveCount(2);
  await sectionPanel.getByRole('button', { name: 'Aprovar' }).nth(1).click();
  await expect(sectionPanel.getByRole('button', { name: 'Aprovar' })).toHaveCount(1);
  await expect(sectionPanel.getByText(APPROVED_SUGGESTION_MARK)).toBeVisible();
}

async function exportAndCheckPdf(page: Page): Promise<void> {
  await page.goto(`/exportar/${tailoredIdForExport}?vaga=${encodeURIComponent(jobIdForExport)}&avaliacao=${encodeURIComponent(evaluationIdForExport)}`);
  await expect(page.getByRole('heading', { name: 'Exportar' })).toBeVisible();
  await page.getByRole('button', { name: 'Exportar PDF' }).click();
  await expect(page.getByRole('button', { name: 'Baixar PDF exportado' })).toBeVisible({ timeout: 60_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PDF exportado' }).click();
  const { pdf, text } = await readPdfDownload(await downloadPromise);
  expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  expect(text).toContain('JANET DOE');
  expect(text).toContain(APPROVED_SUGGESTION_MARK);
  expect(text).not.toContain(UNAPPROVED_SUGGESTION_MARK);
}
