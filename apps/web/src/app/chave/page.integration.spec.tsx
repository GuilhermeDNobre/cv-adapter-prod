import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChavePage from './page';

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
}));

const replace = simulated.replace;

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubSaveKey(status: number, body: unknown): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/settings/deepseek-key')) {
      return apiJson(body, status);
    }
    return apiJson({ statusCode: 404, message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function typeAndSubmit(key: string): void {
  fireEvent.change(screen.getByLabelText('Chave da DeepSeek'), { target: { value: key } });
  const field = screen.getByLabelText('Chave da DeepSeek');
  const form = field.closest('form');
  if (form === null) throw new Error('Expected the key form');
  fireEvent.submit(form);
}

describe('ChavePage against a simulated API server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockReset();
  });

  it('should save an accepted key and move to the home page', async () => {
    stubSaveKey(200, {
      status: { configured: true, lastFour: '5678' },
      balance: { isAvailable: true, balances: [{ currency: 'CNY', totalBalance: '10.00' }] },
    });
    render(<ChavePage />);

    typeAndSubmit('sk-live-key');

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/');
    });
  });

  it('should stay and warn when the accepted key has zero balance', async () => {
    stubSaveKey(200, {
      status: { configured: true, lastFour: '0000' },
      balance: { isAvailable: false, balances: [{ currency: 'CNY', totalBalance: '0.00' }] },
    });
    render(<ChavePage />);

    typeAndSubmit('sk-empty');

    await screen.findByText(/saldo.*está zerado/);
    expect(replace).not.toHaveBeenCalled();
  });

  it('should stay and explain the refusal when the key is rejected', async () => {
    stubSaveKey(422, { statusCode: 422, code: 'ai_key_rejected', message: 'rejected' });
    render(<ChavePage />);

    typeAndSubmit('sk-wrong');

    await screen.findByText(/recusou essa chave/);
    expect(replace).not.toHaveBeenCalled();
  });

  it('should say it could not check when the verification is unavailable', async () => {
    stubSaveKey(503, { statusCode: 503, code: 'ai_unavailable', message: 'down' });
    render(<ChavePage />);

    typeAndSubmit('sk-live');

    await screen.findByText(/Não foi possível conferir a chave agora/);
    expect(replace).not.toHaveBeenCalled();
  });
});
