import { test, expect } from '@playwright/test';
import { JOB_DESCRIPTION_TEXT } from './fixtures/test-data';
import {
  resetE2eDatabase,
  seedDeepSeekKey,
  setupConfirmedCareerProfile,
  createJobDescriptionForSetup,
  createBaseResumeForSetup,
  waitForResumeReady,
  exportResumeForSetup,
  listResumesForSetup,
  apiStatusForSetup,
  isDeepSeekKeyConfigured,
} from './helpers';

const BASE_RESUME_NAME = 'E2E backend focus';

test.describe('Apagar currículos', () => {
  test('some com currículos e exportações e preserva perfil, vagas e chave', async ({ page }) => {
    await test.step('1. Deixar um currículo com exportação existindo', async () => {
      await resetE2eDatabase();
      await seedDeepSeekKey(page);
      await setupConfirmedCareerProfile(page);
      const baseId = await createBaseResumeForSetup(page, BASE_RESUME_NAME);
      await waitForResumeReady(page, baseId);
      await exportResumeForSetup(page, baseId);
      const resumes = await listResumesForSetup(page);
      expect(resumes.length).toBeGreaterThan(0);
      expect(resumes.every((resume) => resume.exportsCount > 0)).toBe(true);
    });

    await test.step('2. Apagar currículos nas Configurações', async () => {
      const jobId = await createJobDescriptionForSetup(page, JOB_DESCRIPTION_TEXT);
      expect(jobId).not.toBe('');
      await page.goto('/configuracoes');
      await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
      await page.getByRole('button', { name: 'Apagar currículos' }).click();
      await page.getByRole('button', { name: 'Confirmar apagar currículos' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Currículos apagados' })).toBeVisible();
      await expect(await listResumesForSetup(page)).toEqual([]);
      await expect(await apiStatusForSetup(page, '/career-profile')).toBe(200);
      await expect(await apiStatusForSetup(page, `/job-descriptions/${jobId ?? ''}`)).toBe(200);
      await expect(await isDeepSeekKeyConfigured(page)).toBe(true);
    });

    await test.step('3. Confirmar a lista vazia e o funil abrindo', async () => {
      await page.goto('/curriculos');
      await expect(page.getByRole('heading', { name: 'Nenhum currículo ainda' })).toBeVisible();
      await page.goto('/vaga');
      await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();
    });
  });
});
