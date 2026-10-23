import { test, expect } from '@playwright/test';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';
import {
  SINGLE_COLUMN_PDF,
  resetE2eDatabase,
  seedDeepSeekKey,
  uploadResumeThroughTheScreen,
  followImportToReview,
  confirmReview,
  createEvaluationForSetup,
  waitForEvaluationReady,
} from './helpers';

test.describe('Roteiro 1 — Caminho feliz', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });
  test('completa o funil até ver o Match Score', async ({ page }) => {
    let jobDescriptionId = '';

    await test.step('1. Colar a vaga na tela /vaga', async () => {
      await page.goto('/vaga');
      await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();

      const textarea = page.getByLabel('Anúncio da vaga');
      await textarea.fill(JOB_DESCRIPTION_TEXT);
      await page.getByRole('button', { name: 'Ver Requirements' }).click();

      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
      await expect(page.getByText('TypeScript', { exact: true })).toBeVisible();
      await expect(page.getByText('React', { exact: true })).toBeVisible();
      const href = await page.getByRole('link', { name: /Avançar para Currículo/ }).getAttribute('href');
      jobDescriptionId = new URL(href ?? '', 'http://localhost').searchParams.get('vaga') ?? '';
      expect(jobDescriptionId).not.toBe('');
    });

    await test.step('2. Ir para a etapa Currículo da mesma vaga', async () => {
      await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
      await expect(page).toHaveURL(new RegExp(`/curriculo\\?vaga=${jobDescriptionId}`));
    });

    await test.step('3. Enviar currículo na etapa Currículo', async () => {
      await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();

      await uploadResumeThroughTheScreen(page, SINGLE_COLUMN_PDF);

      await expect(page.getByRole('heading', { name: 'Currículo lido' })).toBeVisible({
        timeout: 60_000,
      });
      await followImportToReview(page);
      await expect(page).toHaveURL(/\/revisao/);
    });

    await test.step('4. Revisar o rascunho na tela /revisao', async () => {
      await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
      await expect(page.getByRole('textbox', { name: 'Empresa' })).toHaveValue('Tech Corp');
      await expect(page.getByRole('textbox', { name: 'Cargo' })).toHaveValue('Senior Developer');

      await confirmReview(page);
    });

    await test.step('5. Ver o Match Score na tela /avaliacao', async () => {
      const evaluationId = await createEvaluationForSetup(page, jobDescriptionId);
      await waitForEvaluationReady(page, evaluationId);
      await page.goto(`/avaliacao/${evaluationId}?vaga=${encodeURIComponent(jobDescriptionId)}`);
      await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 30_000 });

      await expect(page.getByText('de 100', { exact: true })).toBeVisible();

      const matchScoreSection = page.locator('[aria-label="Match Score"]');
      await expect(matchScoreSection).toBeVisible();
    });
  });
});
