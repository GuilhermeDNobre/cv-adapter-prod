import { test, expect } from '@playwright/test';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';
import {
  SINGLE_COLUMN_PDF,
  resetE2eDatabase,
  seedDeepSeekKey,
  uploadResumeThroughTheScreen,
  followImportToReview,
  confirmReview,
  setupConfirmedCareerProfile,
  createBaseResumeForSetup,
  waitForResumeReady,
} from './helpers';

test.describe('Wizard por cliques', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });

  test('carrega a vaga pela URL, importa e avanca sem reload', async ({ page }) => {
    let jobDescriptionId = '';

    await test.step('1. Colar a vaga poe o id na URL', async () => {
      await page.goto('/vaga');
      await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
      await page.getByRole('button', { name: 'Ver Requirements' }).click();
      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
      await expect(page).toHaveURL(/\/vaga\?vaga=.+/);
      jobDescriptionId = new URL(page.url()).searchParams.get('vaga') ?? '';
      expect(jobDescriptionId).not.toBe('');
    });

    await test.step('2. Avancar para Curriculo mantem a vaga e importa', async () => {
      await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
      await expect(page).toHaveURL(new RegExp(`/curriculo\\?vaga=${jobDescriptionId}`));
      await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
      await uploadResumeThroughTheScreen(page, SINGLE_COLUMN_PDF);
      await followImportToReview(page);
      await expect(page).toHaveURL(new RegExp(`vaga=${jobDescriptionId}`));
      await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
      await confirmReview(page);
    });

    await test.step('3. Continuar a adaptacao volta a etapa Curriculo e a Vaga guarda os Requirements', async () => {
      await page.getByRole('link', { name: 'Continuar a adaptação' }).click();
      await expect(page).toHaveURL(new RegExp(`/curriculo\\?vaga=${jobDescriptionId}`));
      await expect(page.getByText(/Seu Career Profile está pronto, mas ainda não há Base Resume/)).toBeVisible();
      await page.getByRole('navigation', { name: 'Etapas' }).getByRole('link', { name: /Vaga.*concluída/ }).click();
      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Anúncio da vaga' })).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/vaga\\?vaga=${jobDescriptionId}`));
    });

    await test.step('4. Avancar para Avaliacao destrava sem reload', async () => {
      await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
      await expect(page).toHaveURL(new RegExp(`/curriculo\\?vaga=${jobDescriptionId}`));
      await page.getByRole('link', { name: /Avançar para Avaliação/ }).click();
      await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('link', { name: /Avançar para Adaptar/ })).toBeVisible({ timeout: 10_000 });
    });

    await test.step('5. Avancar para Adaptar leva vaga e avaliacao', async () => {
      await page.getByRole('link', { name: /Avançar para Adaptar/ }).click();
      await expect(page.getByRole('heading', { name: 'Adaptar' })).toBeVisible();
      const url = new URL(page.url());
      expect(url.searchParams.get('vaga')).toBe(jobDescriptionId);
      expect(url.searchParams.get('avaliacao')).not.toBeNull();
    });
  });

  test('comeca pelo cartao da home e escolhe um curriculo salvo sem enviar de novo', async ({ page }) => {
    let chosenBaseId = '';

    await test.step('1. Deixar dois Base Resumes salvos', async () => {
      await setupConfirmedCareerProfile(page);
      const firstBaseId = await createBaseResumeForSetup(page, 'E2E base backend');
      chosenBaseId = await createBaseResumeForSetup(page, 'E2E base dados');
      await waitForResumeReady(page, firstBaseId);
      await waitForResumeReady(page, chosenBaseId);
    });

    await test.step('2. O cartao Adaptar para uma vaga abre a Vaga', async () => {
      await page.goto('/');
      await page.getByRole('link', { name: 'Adaptar para uma vaga' }).click();
      await expect(page).toHaveURL(/\/vaga$/);
      await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
      await page.getByRole('button', { name: 'Ver Requirements' }).click();
      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
    });

    await test.step('3. A etapa Curriculo lista os salvos e guarda o escolhido na URL', async () => {
      await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
      await expect(page).toHaveURL(/\/curriculo\?vaga=.+/);
      await expect(page.getByRole('radio')).toHaveCount(2, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Enviar um currículo novo' })).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByLabel('Arquivo do currículo')).toBeHidden();
      await page.getByRole('radio', { name: 'E2E base dados' }).check();
      await expect(page.getByRole('radio', { name: 'E2E base dados' })).toBeChecked();
      await expect(page).toHaveURL(new RegExp(`base=${chosenBaseId}`));
    });

    await test.step('4. Avaliacao e Adaptar levam o Base Resume escolhido', async () => {
      await page.getByRole('link', { name: /Avançar para Avaliação/ }).click();
      await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 60_000 });
      await expect(page).toHaveURL(new RegExp(`base=${chosenBaseId}`));
      await page.getByRole('link', { name: /Avançar para Adaptar/ }).click();
      await expect(page.getByRole('heading', { name: 'Adaptar' })).toBeVisible();
      expect(new URL(page.url()).searchParams.get('base')).toBe(chosenBaseId);
      await expect(page.getByLabel('Base Resume de partida')).toHaveValue(chosenBaseId, { timeout: 15_000 });
    });
  });
});
