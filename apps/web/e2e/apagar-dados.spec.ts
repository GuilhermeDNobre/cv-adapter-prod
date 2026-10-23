import { test, expect } from '@playwright/test';
import {
  SINGLE_COLUMN_PDF,
  confirmReview,
  navigateToReview,
  navigateToVagaAndResumeStep,
  resetE2eDatabase,
  seedDeepSeekKey,
  seedResumeImportForSetup,
  waitForResumeImport,
} from './helpers';

test.describe('Apagar dados', () => {
  test('zerar tudo exige a palavra, mantém a chave e some com o perfil', async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
    await navigateToVagaAndResumeStep(page);
    await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
    const resumeImportId = await seedResumeImportForSetup(page, SINGLE_COLUMN_PDF);
    await waitForResumeImport(page, resumeImportId);
    await navigateToReview(page, resumeImportId);
    await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
    await confirmReview(page);
    const reviewUrl = `/revisao?resumeImportId=${encodeURIComponent(resumeImportId)}`;
    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
    const wipeButton = page.getByRole('button', { name: 'Zerar tudo' });
    await expect(wipeButton).toBeDisabled();
    await page.getByLabel('Digite APAGAR para habilitar').fill('APAGA');
    await expect(wipeButton).toBeDisabled();
    await page.getByLabel('Digite APAGAR para habilitar').fill('APAGAR');
    await expect(wipeButton).toBeEnabled();
    await wipeButton.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar zerar tudo' }).click();
    await expect(page).toHaveURL(/\/\?dados=zerados$/);
    await expect(page.getByRole('status').filter({ hasText: 'Todos os dados foram apagados' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'continua salva' })).toBeVisible();
    await page.goto('/vaga');
    await expect(page).toHaveURL(/\/vaga/);
    await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();
    await page.goto(reviewUrl);
    await expect(page.getByRole('alert').filter({ hasText: 'Não encontramos esse rascunho' })).toBeVisible();
    await expect(page.getByText('JANET DOE')).toHaveCount(0);
  });
});
