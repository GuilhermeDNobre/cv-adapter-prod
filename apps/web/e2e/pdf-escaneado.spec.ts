import { test, expect } from '@playwright/test';
import {
  SCANNED_PDF,
  resetE2eDatabase,
  seedDeepSeekKey,
  navigateToVagaAndResumeStep,
  uploadResumeThroughTheScreen,
} from './helpers';

const NO_TEXT_LAYER_FRAGMENTS = [
  'Seu PDF é uma digitalização',
  'não tem camada de texto',
  'exportar o PDF a partir do arquivo editável',
];

test.describe('Roteiro 2 — PDF escaneado recusado', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eDatabase();
    await seedDeepSeekKey(page);
  });
  test('recusa PDF sem camada de texto com mensagem específica', async ({ page }) => {
    await test.step('1. Colar a vaga e ir para a etapa Currículo', async () => {
      await navigateToVagaAndResumeStep(page);
    });

    await test.step('2. Enviar o PDF escaneado pela tela', async () => {
      await expect(page.getByRole('heading', { name: /Envie o currículo/ })).toBeVisible();
      await uploadResumeThroughTheScreen(page, SCANNED_PDF);
    });

    await test.step('3. Ler a recusa específica de no_text_layer', async () => {
      const failure = page.getByRole('alert').filter({ hasText: 'digitalização' });
      await expect(failure).toBeVisible({ timeout: 60_000 });
      for (const fragment of NO_TEXT_LAYER_FRAGMENTS) {
        await expect(failure).toContainText(fragment);
      }
      await expect(failure).not.toContainText('Não reconhecemos esse arquivo');
      await expect(failure).not.toContainText('não parece um currículo');
    });

    await test.step('4. Poder tentar de novo sem recarregar a página', async () => {
      await expect(page.getByRole('button', { name: /Voltar ao envio|Enviar outro/ })).toBeVisible();
    });
  });
});
