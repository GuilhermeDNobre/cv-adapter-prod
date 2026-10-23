import { test, expect } from '@playwright/test';
import {
  E2E_INVALID_KEY_PREFIX,
  E2E_VALID_DEEPSEEK_KEY,
  resetE2eDatabase,
} from './helpers';

test.describe('Primeira abertura', () => {
  test('pede a chave, recusa a inválida e entra com a válida', async ({ page }) => {
    await resetE2eDatabase();
    await page.goto('/');
    await expect(page).toHaveURL(/\/chave/);
    await expect(page.getByRole('heading', { name: 'Informe sua chave da DeepSeek' })).toBeVisible();
    const keyField = page.getByLabel('Chave da DeepSeek');
    await keyField.fill(`${E2E_INVALID_KEY_PREFIX}-0001`);
    await page.getByRole('button', { name: 'Salvar chave' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'recusou essa chave' })).toBeVisible();
    await expect(page).toHaveURL(/\/chave/);
    await keyField.fill(E2E_VALID_DEEPSEEK_KEY);
    await page.getByRole('button', { name: 'Salvar chave' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'cv-adapter' })).toBeVisible();
    await page.goto('/vaga');
    await expect(page).toHaveURL(/\/vaga/);
    await expect(page.getByRole('heading', { name: 'Colar a vaga' })).toBeVisible();
  });
});
