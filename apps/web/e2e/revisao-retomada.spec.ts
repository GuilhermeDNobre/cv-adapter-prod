import { test, expect } from '@playwright/test';
import {
  SINGLE_COLUMN_PDF,
  resetE2eDatabase,
  seedDeepSeekKey,
  followImportToReview,
  navigateToVagaAndResumeStep,
  uploadResumeThroughTheScreen,
} from './helpers';

const CORRECTED_ROLE = 'Staff Engineer';

test.describe('Roteiro 3 — Revisão retomada', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });
  test('retoma a revisão depois de sair e voltar', async ({ page }) => {
    await test.step('1. Completar o funil até a revisão', async () => {
      await navigateToVagaAndResumeStep(page);
      await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
      await uploadResumeThroughTheScreen(page, SINGLE_COLUMN_PDF);
      await followImportToReview(page);
    });

    await test.step('2. Corrigir o cargo lido do currículo', async () => {
      const role = page.getByRole('textbox', { name: 'Cargo' });
      await expect(role).toHaveValue('Senior Developer', { timeout: 10_000 });
      await role.fill(CORRECTED_ROLE);
      await page.getByRole('textbox', { name: 'Empresa' }).click();
      await expect(page.getByText('Salvando suas alterações.')).toHaveCount(0, { timeout: 15_000 });
    });

    const reviewUrl = page.url();

    await test.step('3. Sair da revisão no meio', async () => {
      await page.goto('/importacao');
      await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
    });

    await test.step('4. Voltar e encontrar a correção onde ficou', async () => {
      await page.goto(reviewUrl);
      await expect(page.getByRole('textbox', { name: 'Cargo' })).toHaveValue(CORRECTED_ROLE, {
        timeout: 15_000,
      });
      await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE');
      await expect(page.getByRole('textbox', { name: 'Empresa' })).toHaveValue('Tech Corp');
    });
  });
});
