import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfiguracoesPage from './page';

const simulated = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: simulated.push }),
}));

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubSettingsServer(): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/settings/deepseek-key') && init?.method !== 'PUT') {
      return apiJson({ configured: true, lastFour: '5678' }, 200);
    }
    if (url.endsWith('/settings/deepseek-balance')) {
      return apiJson(
        { isAvailable: true, balances: [{ currency: 'CNY', totalBalance: '10.00' }] },
        200,
      );
    }
    return apiJson({ statusCode: 404, message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('ConfiguracoesPage against a simulated API server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    simulated.push.mockReset();
  });

  it('should show key, balance and erasure in order without exposing the full key', async () => {
    stubSettingsServer();
    render(<ConfiguracoesPage />);

    await screen.findByText(/Chave salva terminando em/);
    await screen.findByText('CNY: 10.00');

    const main = screen.getByRole('main');
    const text = main.textContent ?? '';
    const keyIndex = text.indexOf('Chave salva terminando em');
    const balanceIndex = text.indexOf('Saldo da DeepSeek');
    const erasureIndex = text.indexOf('Apagar dados');
    expect(keyIndex).toBeGreaterThan(-1);
    expect(balanceIndex).toBeGreaterThan(keyIndex);
    expect(erasureIndex).toBeGreaterThan(balanceIndex);

    expect(screen.getByText(/terminando em/)).toHaveTextContent('5678');
    expect(main.textContent).not.toContain('sk-live-full-key');
  });

  it('should keep balance visible when the key status says configured', async () => {
    stubSettingsServer();
    render(<ConfiguracoesPage />);

    await screen.findByRole('region', { name: 'Saldo da DeepSeek' });
    expect(screen.getByRole('region', { name: 'Apagar dados' })).toBeInTheDocument();
  });
});
