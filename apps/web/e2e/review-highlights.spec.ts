import { test, expect } from '@playwright/test';
import {
  resetE2eDatabase,
  seedDeepSeekKey,
  setupTailoredWithKnownChanges,
  waitForResumeReady,
} from './helpers';

test.describe('Revisão por destaque', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });

  test('teclado, rejeitar, desfazer, restaurar, persistência e popover colado', async ({ page }) => {
    const seed = await setupTailoredWithKnownChanges(page);
    await waitForResumeReady(page, seed.tailoredId);
    expect(seed.addedStatement).not.toBe('');
    expect(seed.secondAddedStatement).not.toBe('');
    expect(seed.removedStatement).not.toBe('');

    await test.step('1. Abrir um destaque só pelo teclado', async () => {
      await page.goto(`/revisar/${seed.tailoredId}?vaga=${encodeURIComponent(seed.jobDescriptionId)}&avaliacao=${encodeURIComponent(seed.evaluationId)}`);
      const highlights = page.frameLocator('iframe[title="Pré-visualização do currículo"]').locator('button.change-trigger');
      await expect(highlights).toHaveCount(2, { timeout: 30_000 });
      await expect(page.getByText('1 de 2 alterações')).toBeVisible();
      await expect(highlights.nth(1)).toHaveAttribute('data-change', 'added');
      await expect(page.getByText('1 página', { exact: true })).toBeVisible({ timeout: 30_000 });

      await highlights.nth(1).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Alteração no currículo' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Rejeitar' })).toBeVisible();
    });

    await test.step('1b. Destaque tem estilo computado alinhado ao topo', async () => {
      const computed = await page
        .frameLocator('iframe[title="Pré-visualização do currículo"]')
        .locator('button.change-trigger')
        .nth(1)
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return { display: style.display, verticalAlign: style.verticalAlign };
        });
      expect(computed.display).toBe('inline-block');
      expect(computed.verticalAlign).toBe('top');
    });

    await test.step('2. Popover fica junto do trecho', async () => {
      const popoverBox = await page.getByRole('dialog', { name: 'Alteração no currículo' }).boundingBox();
      const highlightBox = await page
        .frameLocator('iframe[title="Pré-visualização do currículo"]')
        .locator('button.change-trigger')
        .nth(1)
        .boundingBox();
      expect(popoverBox).not.toBeNull();
      expect(highlightBox).not.toBeNull();
      if (popoverBox !== null && highlightBox !== null) {
        const verticalGap =
          popoverBox.y >= highlightBox.y + highlightBox.height
            ? popoverBox.y - (highlightBox.y + highlightBox.height)
            : highlightBox.y >= popoverBox.y + popoverBox.height
              ? highlightBox.y - (popoverBox.y + popoverBox.height)
              : 0;
        const horizontalGap =
          popoverBox.x >= highlightBox.x + highlightBox.width
            ? popoverBox.x - (highlightBox.x + highlightBox.width)
            : highlightBox.x >= popoverBox.x + popoverBox.width
              ? highlightBox.x - (popoverBox.x + popoverBox.width)
              : 0;
        const gap = Math.hypot(verticalGap, horizontalGap);
        expect(gap).toBeLessThan(24);
      }
    });

    await test.step('3. Rejeitar tira o Bullet do iframe e desfazer traz de volta', async () => {
      const frame = page.frameLocator('iframe[title="Pré-visualização do currículo"]');
      await expect(frame.getByText(seed.secondAddedStatement.slice(0, 30))).toBeVisible();
      await page.getByRole('button', { name: 'Rejeitar' }).click();
      await expect(frame.getByText(seed.secondAddedStatement.slice(0, 30))).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByText('Alteração rejeitada.').first()).toBeVisible();

      const undoToast = page.getByRole('button', { name: 'Desfazer' });
      await expect(undoToast).toBeVisible();
      await undoToast.click();
      await expect(frame.getByText(seed.secondAddedStatement.slice(0, 30))).toBeVisible({ timeout: 15_000 });
    });

    await test.step('4. Restaurar pelo chip insere o Bullet', async () => {
      const removedChip = page.getByRole('button', { name: /retirada/ });
      await expect(removedChip).toBeVisible();
      await removedChip.click();
      await expect(page.getByRole('dialog', { name: 'Evidences retiradas' })).toBeVisible();
      await expect(page.getByText(seed.removedStatement.slice(0, 30))).toBeVisible();
      await page.getByRole('button', { name: 'Restaurar' }).first().click();
      await expect(page.getByText('Evidence restaurada.').first()).toBeVisible();
      const frame = page.frameLocator('iframe[title="Pré-visualização do currículo"]');
      await expect(frame.getByText(seed.removedStatement.slice(0, 30))).toBeVisible({ timeout: 15_000 });
    });

    await test.step('5. Recarregar mantém as decisões', async () => {
      const frame = page.frameLocator('iframe[title="Pré-visualização do currículo"]');
      await frame.locator('button.change-trigger').first().focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Alteração no currículo' })).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole('dialog', { name: 'Alteração no currículo' }).getByText(seed.addedStatement, { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Rejeitar' }).click();
      await expect(frame.getByText(seed.addedStatement.slice(0, 30))).toHaveCount(0, { timeout: 15_000 });

      await page.reload();
      await expect(page.frameLocator('iframe[title="Pré-visualização do currículo"]').locator('button.change-trigger')).toHaveCount(1, { timeout: 30_000 });
      await expect(page.getByText('1 página', { exact: true })).toBeVisible({ timeout: 30_000 });
      const reloadedFrame = page.frameLocator('iframe[title="Pré-visualização do currículo"]');
      await expect(reloadedFrame.getByText(seed.addedStatement.slice(0, 30))).toHaveCount(0);
      await expect(reloadedFrame.getByText(seed.secondAddedStatement.slice(0, 30))).toBeVisible();
      await expect(reloadedFrame.getByText(seed.removedStatement.slice(0, 30))).toBeVisible();
    });
  });
});
