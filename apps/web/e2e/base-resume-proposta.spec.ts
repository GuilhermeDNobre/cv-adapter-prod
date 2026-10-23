import { test, expect } from '@playwright/test';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';
import {
  SINGLE_COLUMN_PDF,
  resetE2eDatabase,
  seedDeepSeekKey,
  uploadResumeThroughTheScreen,
  followImportToReview,
  confirmReview,
  approveProposalThroughTheScreen,
} from './helpers';

const PT_FIRST_EVIDENCE = 'Liderei equipe de desenvolvimento com entregas mensais';
const PT_SECOND_EVIDENCE = 'Gerenciei projeto com equipe responsavel por resultados';
const PT_MARKERS = ['Liderei', 'Gerenciei', 'equipe', 'mensais'];

test.describe('Base Resume a partir do envio', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });

  test('inicio envia curriculo, confere proposta, aprova e cola a vaga', async ({ page }) => {
    await test.step('1. Inicio ate a revisao com Evidences por experiencia', async () => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'cv-adapter' })).toBeVisible();
      await page.getByRole('link', { name: 'Meus currículos' }).click();
      await expect(page).toHaveURL(/\/curriculos$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Meus currículos' })).toBeVisible();
      await page.getByRole('link', { name: 'Enviar currículo' }).click();
      await expect(page).toHaveURL(/\/importacao$/);
      await expect(page.getByRole('heading', { name: 'Envie o currículo que você já tem' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Etapas' })).toHaveCount(0);
      await uploadResumeThroughTheScreen(page, SINGLE_COLUMN_PDF);
      await expect(page.getByRole('heading', { name: 'Currículo lido' })).toBeVisible({ timeout: 60_000 });
      await followImportToReview(page);
      await expect(page.getByRole('heading', { name: 'Confira o que lemos do seu currículo' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
      await expect(page.getByRole('textbox', { name: 'Empresa' })).toHaveValue('Tech Corp');
      await expect(page.getByRole('textbox', { name: 'Cargo' })).toHaveValue('Senior Developer');
      const evidenceFields = page.getByLabel('O que você fez ou conquistou');
      await expect(evidenceFields).toHaveCount(2, { timeout: 10_000 });
      await expect(evidenceFields.nth(0)).toHaveValue('Built scalable TypeScript applications for 5 years');
      await expect(evidenceFields.nth(1)).toHaveValue('Led React migration for enterprise dashboard');
    });

    await test.step('2. Confirmar, aprovar a proposta e chegar ao Pronto', async () => {
      await confirmReview(page);
      await page.getByRole('link', { name: 'Conferir o Base Resume' }).click();
      await approveProposalThroughTheScreen(page);
    });

    await test.step('3. Colar a primeira vaga', async () => {
      await page.getByRole('link', { name: /Colar a primeira vaga/ }).click();
      await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();
      await expect(page).toHaveURL(/\/vaga/);
    });
  });

  test('comeca pela vaga, envia curriculo e volta a mesma vaga', async ({ page }) => {
    let jobDescriptionId = '';
    await test.step('1. Colar a vaga sem Career Profile', async () => {
      await page.goto('/vaga');
      await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();
      await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
      await page.getByRole('button', { name: 'Ver Requirements' }).click();
      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
      await expect(page).toHaveURL(/\/vaga\?vaga=.+/);
      jobDescriptionId = new URL(page.url()).searchParams.get('vaga') ?? '';
      expect(jobDescriptionId).not.toBe('');
    });

    await test.step('2. Avancar para Curriculo e enviar sem nada salvo', async () => {
      await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
      await expect(page).toHaveURL(new RegExp(`/curriculo\\?vaga=${jobDescriptionId}`));
      await expect(page.getByText(/Você ainda não tem currículo salvo/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Envie o currículo que você já tem' })).toBeVisible();
      await uploadResumeThroughTheScreen(page, SINGLE_COLUMN_PDF);
      await expect(page.getByRole('heading', { name: 'Currículo lido' })).toBeVisible({ timeout: 60_000 });
      await followImportToReview(page);
      await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
      await confirmReview(page);
    });

    await test.step('3. Voltar a mesma vaga com Requirements sem colar de novo', async () => {
      await page.getByRole('link', { name: 'Continuar a adaptação' }).click();
      await expect(page).toHaveURL(new RegExp(`/curriculo\\?vaga=${jobDescriptionId}`));
      await expect(page.getByRole('link', { name: /Avançar para Avaliação/ })).toHaveAttribute(
        'href',
        new RegExp(`/avaliacao\\?vaga=${jobDescriptionId}`),
      );
      await page.getByRole('navigation', { name: 'Etapas' }).getByRole('link', { name: /Vaga.*concluída/ }).click();
      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(new RegExp(`/vaga\\?vaga=${jobDescriptionId}`));
      await expect(page.getByRole('textbox', { name: 'Anúncio da vaga' })).toHaveCount(0);
      await expect(page.getByText('TypeScript', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('React', { exact: true }).first()).toBeVisible();
    });
  });

  test('nega um Gap e desfaz', async ({ page }) => {
    await test.step('1. Colar vaga e importar por cliques', async () => {
      await page.goto('/vaga');
      await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
      await page.getByRole('button', { name: 'Ver Requirements' }).click();
      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
      await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
      await expect(page.getByRole('heading', { name: 'Envie o currículo que você já tem' })).toBeVisible();
      await uploadResumeThroughTheScreen(page, SINGLE_COLUMN_PDF);
      await expect(page.getByRole('heading', { name: 'Currículo lido' })).toBeVisible({ timeout: 60_000 });
      await followImportToReview(page);
      await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
      await confirmReview(page);
      await page.getByRole('link', { name: 'Continuar a adaptação' }).click();
      await expect(page).toHaveURL(/\/curriculo\?vaga=.+/);
    });

    await test.step('2. Abrir a Avaliacao pronta', async () => {
      await page.getByRole('link', { name: /Avançar para Avaliação/ }).click();
      await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 60_000 });
    });

    await test.step('3. Negar o Gap e desfazer', async () => {
      const scoreLabel = page.getByRole('img', { name: /Match Score/ });
      await expect(scoreLabel).toBeVisible();
      const scoreBefore = await scoreLabel.getAttribute('aria-label');
      expect(scoreBefore).not.toBeNull();
      await page.getByRole('button', { name: 'Não tenho isso' }).first().click();
      await expect(page.getByText('Respondido').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Você respondeu que não tem isso.')).toBeVisible();
      const scoreDenied = await scoreLabel.getAttribute('aria-label');
      expect(scoreDenied).toBe(scoreBefore);
      await page.getByRole('button', { name: 'Desfazer' }).first().click();
      await expect(page.getByText('Resposta desfeita. O item volta a ser um Gap.')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Não tenho isso' }).first()).toBeVisible({ timeout: 15_000 });
      const scoreAfter = await scoreLabel.getAttribute('aria-label');
      expect(scoreAfter).toBe(scoreBefore);
    });
  });

  test('adapta em ingles a partir de base em portugues sem portugues no preview', async ({ page }) => {
    test.setTimeout(300_000);
    await test.step('1. Enviar e reescrever Evidences em portugues', async () => {
      await page.goto('/');
      await page.getByRole('link', { name: 'Meus currículos' }).click();
      await page.getByRole('link', { name: 'Enviar currículo' }).click();
      await expect(page.getByRole('heading', { name: 'Envie o currículo que você já tem' })).toBeVisible();
      await uploadResumeThroughTheScreen(page, SINGLE_COLUMN_PDF);
      await expect(page.getByRole('heading', { name: 'Currículo lido' })).toBeVisible({ timeout: 60_000 });
      await followImportToReview(page);
      await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
      const evidenceFields = page.getByLabel('O que você fez ou conquistou');
      await expect(evidenceFields).toHaveCount(2, { timeout: 10_000 });
      await evidenceFields.nth(0).fill(PT_FIRST_EVIDENCE);
      await evidenceFields.nth(1).click();
      await evidenceFields.nth(1).fill(PT_SECOND_EVIDENCE);
      await page.getByRole('textbox', { name: 'Empresa' }).click();
      await expect(page.getByText('Salvando suas alterações.')).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByLabel('O que você fez ou conquistou').nth(0)).toHaveValue(PT_FIRST_EVIDENCE);
      await confirmReview(page);
      await page.getByRole('link', { name: 'Conferir o Base Resume' }).click();
      await approveProposalThroughTheScreen(page);
    });

    await test.step('2. Colar vaga em ingles e gerar em ingles', async () => {
      await page.getByRole('link', { name: /Colar a primeira vaga/ }).click();
      await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();
      await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
      await page.getByRole('button', { name: 'Ver Requirements' }).click();
      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
      await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
      await expect(page.getByRole('radio')).toHaveCount(1, { timeout: 15_000 });
      await expect(page.getByRole('radio').first()).toBeChecked();
      await page.getByRole('link', { name: /Avançar para Avaliação/ }).click();
      await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('link', { name: /Avançar para Adaptar/ }).click();
      await expect(page.getByRole('heading', { name: 'Adaptar' })).toBeVisible();
      await page.getByLabel('Idioma do currículo').selectOption('en');
      await page.getByRole('button', { name: 'Gerar currículo para esta vaga' }).click();
      await page.waitForURL(/\/revisar\/.+/);
    });

    await test.step('3. Preview sem portugues', async () => {
      const frame = page.frameLocator('iframe[title="Pré-visualização do currículo"]');
      await expect(frame.locator('body')).toContainText('delivery', { timeout: 120_000 });
      const previewText = await frame.locator('body').innerText();
      for (const marker of PT_MARKERS) {
        expect(previewText).not.toContain(marker);
      }
      expect(previewText.toLowerCase()).toContain('delivery');
    });
  });
});
