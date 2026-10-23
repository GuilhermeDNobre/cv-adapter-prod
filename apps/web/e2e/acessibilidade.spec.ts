import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';
import {
  SINGLE_COLUMN_PDF,
  resetE2eDatabase,
  seedDeepSeekKey,
  seedResumeImportForSetup,
  waitForResumeImport,
  navigateToReview,
  navigateToVagaAndResumeStep,
  confirmReview,
  setupConfirmedCareerProfile,
  createBaseResumeForSetup,
  waitForResumeReady,
  setupTailoredWithKnownChanges,
  createEvaluationForSetup,
  waitForEvaluationReady,
  waitForAnimationsToSettle,
} from './helpers';

function seriousOrCritical(violations: Array<{ impact?: string | null }>): Array<{ impact?: string | null }> {
  return violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
}

test.describe('Acessibilidade', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });
  test('varredura axe na tela inicial com os cartões', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Adaptar para uma vaga' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Meus currículos' })).toBeVisible();

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('varredura axe nas telas da área de currículos', async ({ page }) => {
    await page.goto('/curriculos');
    await expect(page.getByRole('heading', { level: 1, name: 'Meus currículos' })).toBeVisible();
    await expect(page.getByText(/cria seu Career Profile e um Base Resume novo/)).toBeVisible();
    await waitForAnimationsToSettle(page);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

    await page.goto('/importacao');
    await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Etapas' })).toHaveCount(0);
    await waitForAnimationsToSettle(page);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  });

  test('navegação por teclado nos cartões da tela inicial', async ({ page }) => {
    await page.goto('/');
    const adapt = page.getByRole('link', { name: 'Adaptar para uma vaga' });
    await expect(adapt).toBeVisible();
    await adapt.focus();
    await expect(adapt).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Meus currículos' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('main').getByRole('link', { name: 'Configurações' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/curriculos$/);
  });

  test('varredura axe na tela /vaga', async ({ page }) => {
    await page.goto('/vaga');
    await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('varredura axe na tela /revisao', async ({ page }) => {
    await navigateToVagaAndResumeStep(page);

    await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
    const resumeImportId = await seedResumeImportForSetup(page, SINGLE_COLUMN_PDF);
    await waitForResumeImport(page, resumeImportId);
    await navigateToReview(page, resumeImportId);
    await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('varredura axe na tela /avaliacao', async ({ page }) => {
    await page.goto('/vaga');
    await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
    await page.getByRole('button', { name: 'Ver Requirements' }).click();
    await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
    const href = await page.getByRole('link', { name: /Avançar para Currículo/ }).getAttribute('href');
    const jobDescriptionId = new URL(href ?? '', 'http://localhost').searchParams.get('vaga') ?? '';
    expect(jobDescriptionId).not.toBe('');

    await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
    await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
    const resumeImportId = await seedResumeImportForSetup(page, SINGLE_COLUMN_PDF);
    await waitForResumeImport(page, resumeImportId);
    await navigateToReview(page, resumeImportId);
    await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
    await confirmReview(page);
    const evaluationId = await createEvaluationForSetup(page, jobDescriptionId);
    await waitForEvaluationReady(page, evaluationId);
    await page.goto(`/avaliacao/${evaluationId}?vaga=${encodeURIComponent(jobDescriptionId)}`);
    await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 30_000 });

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('navegação por teclado na tela /revisao', async ({ page }) => {
    await navigateToVagaAndResumeStep(page);

    await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
    const resumeImportId = await seedResumeImportForSetup(page, SINGLE_COLUMN_PDF);
    await waitForResumeImport(page, resumeImportId);
    await navigateToReview(page, resumeImportId);
    await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'cv-adapter' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'cv-adapter' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Início' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Início' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Currículos' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Currículos' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Configurações' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Configurações' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /Usar tema/ })).toBeFocused();
    await expect(page.getByRole('button', { name: /Usar tema/ })).toBeVisible();

    // Dev-only elements such as the Next dev-tools portal sit between the header and main.
    const maxTabsToMain = 5;
    for (let i = 0; i < maxTabsToMain; i++) {
      await page.keyboard.press('Tab');
      if ((await page.locator('main :focus').count()) === 1) {
        break;
      }
    }
    await expect(page.locator('main :focus')).toBeVisible();

    const focusableCount = 15;
    for (let i = 0; i < focusableCount; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator('main :focus');
      await expect(focused).toBeVisible();
    }
  });

  test('navegação por teclado na tela /avaliacao', async ({ page }) => {
    await page.goto('/vaga');
    await page.getByLabel('Anúncio da vaga').fill(JOB_DESCRIPTION_TEXT);
    await page.getByRole('button', { name: 'Ver Requirements' }).click();
    await expect(page.getByRole('heading', { name: 'Requirements da vaga' })).toBeVisible();
    const href = await page.getByRole('link', { name: /Avançar para Currículo/ }).getAttribute('href');
    const jobDescriptionId = new URL(href ?? '', 'http://localhost').searchParams.get('vaga') ?? '';
    expect(jobDescriptionId).not.toBe('');

    await page.getByRole('link', { name: /Avançar para Currículo/ }).click();
    await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
    const resumeImportId = await seedResumeImportForSetup(page, SINGLE_COLUMN_PDF);
    await waitForResumeImport(page, resumeImportId);
    await navigateToReview(page, resumeImportId);
    await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue('JANET DOE', { timeout: 10_000 });
    await confirmReview(page);
    const evaluationId = await createEvaluationForSetup(page, jobDescriptionId);
    await waitForEvaluationReady(page, evaluationId);
    await page.goto(`/avaliacao/${evaluationId}?vaga=${encodeURIComponent(jobDescriptionId)}`);
    await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 30_000 });

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      const count = await focused.count();
      for (let j = 0; j < count; j++) {
        const el = focused.nth(j);
        if (await el.isVisible()) {
          await expect(el).toBeVisible();
          break;
        }
      }
    }
  });

  test('varredura axe no editor de currículo', async ({ page }) => {
    await setupConfirmedCareerProfile(page);
    const baseId = await createBaseResumeForSetup(page, 'E2E axe editor');
    await waitForResumeReady(page, baseId);
    await page.goto(`/curriculos/${baseId}`);
    await expect(page.getByRole('heading', { name: 'E2E axe editor' })).toBeVisible();
    await expect(page.getByTitle('Pré-visualização do currículo')).toBeVisible();

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('varredura axe na lista de currículos', async ({ page }) => {
    await setupConfirmedCareerProfile(page);
    const baseId = await createBaseResumeForSetup(page, 'E2E axe lista');
    await waitForResumeReady(page, baseId);
    await page.goto('/curriculos');
    await expect(page.getByRole('heading', { level: 1, name: 'Meus currículos' })).toBeVisible();
    await expect(page.getByText('E2E axe lista')).toBeVisible();

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('axe sem serious ou critical nas seis etapas do wizard', async ({ page }) => {
    const seed = await setupTailoredWithKnownChanges(page);
    await waitForResumeReady(page, seed.tailoredId);
    const query = `vaga=${encodeURIComponent(seed.jobDescriptionId)}&avaliacao=${encodeURIComponent(seed.evaluationId)}`;

    await page.goto('/vaga');
    await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();
    await waitForAnimationsToSettle(page);
    expect(seriousOrCritical((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations)).toEqual([]);

    await page.goto(`/curriculo?${query}`);
    await expect(page.getByRole('heading', { name: 'Escolha o currículo' })).toBeVisible();
    await expect(page.getByRole('radio').first()).toBeVisible({ timeout: 15_000 });
    await waitForAnimationsToSettle(page);
    expect(seriousOrCritical((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations)).toEqual([]);

    await page.goto(`/avaliacao/${seed.evaluationId}?vaga=${encodeURIComponent(seed.jobDescriptionId)}`);
    await expect(page.getByRole('heading', { name: 'Match Score' })).toBeVisible({ timeout: 30_000 });
    await waitForAnimationsToSettle(page);
    expect(seriousOrCritical((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations)).toEqual([]);

    await page.goto(`/adaptar?${query}`);
    await expect(page.getByRole('heading', { name: 'Adaptar' })).toBeVisible();
    await waitForAnimationsToSettle(page);
    expect(seriousOrCritical((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations)).toEqual([]);

    await page.goto(`/revisar/${seed.tailoredId}?${query}`);
    await expect(page.frameLocator('iframe[title="Pré-visualização do currículo"]').locator('[data-change="added"]')).toHaveCount(2, { timeout: 30_000 });
    await waitForAnimationsToSettle(page);
    expect(seriousOrCritical((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations)).toEqual([]);

    await page.goto(`/exportar/${seed.tailoredId}?${query}`);
    await expect(page.getByRole('heading', { name: 'Exportar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Exportar PDF' })).toBeVisible({ timeout: 30_000 });
    await waitForAnimationsToSettle(page);
    expect(seriousOrCritical((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations)).toEqual([]);
  });

  test('axe com popover de alteração aberto', async ({ page }) => {
    const seed = await setupTailoredWithKnownChanges(page);
    await waitForResumeReady(page, seed.tailoredId);
    await page.goto(`/revisar/${seed.tailoredId}?vaga=${encodeURIComponent(seed.jobDescriptionId)}&avaliacao=${encodeURIComponent(seed.evaluationId)}`);
    await expect(page.frameLocator('iframe[title="Pré-visualização do currículo"]').locator('[data-change="added"]')).toHaveCount(2, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Próxima alteração' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Alteração no currículo' })).toBeVisible({ timeout: 15_000 });

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(seriousOrCritical(results.violations)).toEqual([]);
  });

  test('axe com drawer de Section aberto', async ({ page }) => {
    const seed = await setupTailoredWithKnownChanges(page);
    await waitForResumeReady(page, seed.tailoredId);
    await page.goto(`/revisar/${seed.tailoredId}?vaga=${encodeURIComponent(seed.jobDescriptionId)}&avaliacao=${encodeURIComponent(seed.evaluationId)}`);
    await expect(page.frameLocator('iframe[title="Pré-visualização do currículo"]').locator('[data-section-id]')).not.toHaveCount(0, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Configurações do documento' }).click();
    await expect(page.getByRole('button', { name: 'Fechar' })).toBeVisible({ timeout: 15_000 });

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(seriousOrCritical(results.violations)).toEqual([]);
  });

  test('axe com reducedMotion reduce emulado', async ({ page }) => {
    const seed = await setupTailoredWithKnownChanges(page);
    await waitForResumeReady(page, seed.tailoredId);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/revisar/${seed.tailoredId}?vaga=${encodeURIComponent(seed.jobDescriptionId)}&avaliacao=${encodeURIComponent(seed.evaluationId)}`);
    await expect(page.frameLocator('iframe[title="Pré-visualização do currículo"]').locator('[data-change="added"]')).toHaveCount(2, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Próxima alteração' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Alteração no currículo' })).toBeVisible({ timeout: 15_000 });

    await waitForAnimationsToSettle(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(seriousOrCritical(results.violations)).toEqual([]);
  });
});
