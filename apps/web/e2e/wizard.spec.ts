import { test, expect } from '@playwright/test';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';
import {
  SINGLE_COLUMN_PDF,
  resetE2eDatabase,
  seedDeepSeekKey,
  uploadResumeThroughTheScreen,
  followImportToReview,
  confirmReview,
  createBaseResumeWithEvidences,
  getCareerProfileForSetup,
  waitForResumeReady,
  createEvaluationForSetup,
  waitForEvaluationReady,
} from './helpers';

test.describe('Wizard do funil', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });

  test('percorre as seis etapas com bloqueios, reload e redirecionamento', async ({ page }) => {
    await test.step('1. Vaga é a primeira etapa, com Avançar bloqueado e motivo visível', async () => {
      await page.goto('/vaga');
      await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();
      const steps = page.getByRole('navigation', { name: 'Etapas' });
      await expect(steps.getByRole('listitem').first()).toContainText('Vaga');
      await expect(steps.locator('[aria-current="step"]')).toContainText('Vaga');
      await expect(page.getByRole('link', { name: /Voltar para/ })).toHaveCount(0);
      const advance = page.getByRole('button', { name: /Avançar para Currículo/ });
      await expect(advance).toBeDisabled();
      await expect(page.getByText('Cole o anúncio da vaga para continuar.')).toBeVisible();

      await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
      await page.getByRole('button', { name: 'Ver Requirements' }).click();
      await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
      await expect(page.getByText('TypeScript', { exact: true }).first()).toBeVisible();
    });

    await test.step('2. Currículo bloqueado e depois concluído', async () => {
      await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
      await expect(page).toHaveURL(/\/curriculo\?vaga=.+/);
      await expect(page.getByRole('heading', { name: 'Envie o currículo que você já tem' })).toBeVisible();
      const steps = page.getByRole('navigation', { name: 'Etapas' });
      await expect(steps.locator('[aria-current="step"]')).toContainText('Currículo');
      await expect(page.getByRole('button', { name: /Avançar para Avaliação/ })).toBeDisabled();
      await expect(page.getByText('Envie o currículo e confirme a revisão para continuar.')).toBeVisible();

      await uploadResumeThroughTheScreen(page, SINGLE_COLUMN_PDF);
      await followImportToReview(page);
      await expect(page.getByRole('navigation', { name: 'Etapas' }).locator('[aria-current="step"]')).toContainText('Currículo');
      await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
      await confirmReview(page);
      await page.getByRole('link', { name: 'Continuar a adaptação' }).click();
      await expect(page).toHaveURL(/\/curriculo\?vaga=.+/);
    });

    let jobDescriptionId = '';
    let evaluationId = '';
    let tailoredId = '';

    await test.step('3. Avaliação pronta', async () => {
      const continueLink = page.getByRole('link', { name: 'Avançar para Avaliação' });
      const href = await continueLink.getAttribute('href');
      expect(href).toContain('/avaliacao?vaga=');
      jobDescriptionId = new URL(href ?? '', 'http://localhost').searchParams.get('vaga') ?? '';
      expect(jobDescriptionId).not.toBe('');
      evaluationId = await createEvaluationForSetup(page, jobDescriptionId);
      await waitForEvaluationReady(page, evaluationId);
      await page.goto(`/avaliacao/${evaluationId}?vaga=${encodeURIComponent(jobDescriptionId)}`);
      await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('de 100', { exact: true })).toBeVisible();
    });

    await test.step('4. Adaptar gera o Tailored Resume', async () => {
      const profile = await getCareerProfileForSetup(page);
      const firstEvidence = profile.evidenceIds[0] ?? '';
      expect(firstEvidence).not.toBe('');
      const baseId = await createBaseResumeWithEvidences(page, 'E2E wizard base', [firstEvidence]);
      await waitForResumeReady(page, baseId);

      await page.goto(`/adaptar?vaga=${encodeURIComponent(jobDescriptionId)}&avaliacao=${encodeURIComponent(evaluationId)}`);
      await expect(page.getByRole('heading', { name: 'Adaptar' })).toBeVisible();
      await page.getByRole('button', { name: 'Gerar currículo para esta vaga' }).click();
      await page.waitForURL(/\/revisar\/.+/);
      tailoredId = new URL(page.url()).pathname.split('/revisar/')[1] ?? '';
      expect(tailoredId).not.toBe('');
      await expect(page.getByText(/Tailored Resume · Pronto|Pronto/)).toBeVisible({ timeout: 120_000 });
    });

    await test.step('5. Revisar mantém a etapa no reload e redireciona da rota antiga', async () => {
      await expect(page).toHaveURL(/\/revisar\/.+/);
      await expect(page.getByRole('navigation', { name: 'Etapas' })).toBeVisible();
      const current = page.getByRole('navigation', { name: 'Etapas' }).locator('[aria-current="step"]');
      await expect(current).toContainText('Revisar');

      await page.reload();
      await expect(page).toHaveURL(/\/revisar\/.+/);
      await expect(page.getByRole('navigation', { name: 'Etapas' }).locator('[aria-current="step"]')).toContainText('Revisar');

      await page.goto(`/curriculos/${tailoredId}?vaga=${encodeURIComponent(jobDescriptionId)}&avaliacao=${encodeURIComponent(evaluationId)}`);
      await expect(page).toHaveURL(/\/revisar\/.+/);
      await expect(page.getByRole('navigation', { name: 'Etapas' }).locator('[aria-current="step"]')).toContainText('Revisar');
    });

    await test.step('6. Exportar mostra o painel', async () => {
      await page.goto(`/exportar/${tailoredId}?vaga=${encodeURIComponent(jobDescriptionId)}&avaliacao=${encodeURIComponent(evaluationId)}`);
      await expect(page.getByRole('heading', { name: 'Exportar' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Etapas' }).locator('[aria-current="step"]')).toContainText('Exportar');
      await expect(page.getByRole('heading', { name: 'Exportar PDF' })).toBeVisible({ timeout: 30_000 });
    });

    await test.step('7. Reabrir pela lista mostra Vaga e Avaliação concluídas', async () => {
      await page.goto(`/curriculos/${tailoredId}`);
      await expect(page).toHaveURL(/\/revisar\/.+/);
      const steps = page.getByRole('navigation', { name: 'Etapas' });
      await expect(steps.locator('[aria-current="step"]')).toContainText('Revisar');
      const vagaDone = steps.getByRole('link', { name: /Vaga.*concluída/ });
      await expect(vagaDone).toBeVisible({ timeout: 30_000 });
      const curriculoDone = steps.getByRole('link', { name: /Currículo.*concluída/ });
      await expect(curriculoDone).toHaveAttribute('href', new RegExp(`/curriculo\\?vaga=${jobDescriptionId}`));
      const avaliacaoDone = steps.getByRole('link', { name: /Avaliação.*concluída/ });
      await expect(avaliacaoDone).toBeVisible();
      await expect(avaliacaoDone).toHaveAttribute('href', new RegExp(`/avaliacao/${evaluationId}\\?vaga=${jobDescriptionId}`));
    });

    await test.step('8. Voltar da Avaliação pronta para o Currículo avisa citando Avaliação', async () => {
      await page.goto(`/avaliacao/${evaluationId}?vaga=${encodeURIComponent(jobDescriptionId)}`);
      await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /Voltar para Currículo/ }).click();
      await expect(page.getByRole('heading', { name: /Voltar pode invalidar/ })).toBeVisible();
      await expect(page.getByText(/pode deixar de concluir/)).toContainText('Avaliação');
      await page.getByRole('button', { name: 'Cancelar' }).click();
    });
  });
});
