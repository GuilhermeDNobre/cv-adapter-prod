import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetworkError } from '../lib/api-client';
import { getDeepSeekKeyStatus } from '../lib/api-client';
import { DeepSeekKeyGate } from './deepseek-key-gate';

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
}));

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return { ...actual, getDeepSeekKeyStatus: vi.fn() };
});

const mockedStatus = vi.mocked(getDeepSeekKeyStatus);
const replace = simulated.replace;

describe('DeepSeekKeyGate', () => {
  afterEach(() => {
    mockedStatus.mockReset();
    replace.mockReset();
  });

  it('should announce checking while the key status is loading', () => {
    mockedStatus.mockReturnValue(new Promise(() => undefined));

    render(
      <DeepSeekKeyGate>
        <p>conteúdo do funil</p>
      </DeepSeekKeyGate>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Verificando a chave');
  });

  it('should redirect to chave when no key is configured', async () => {
    mockedStatus.mockResolvedValue({ configured: false, lastFour: null });

    render(
      <DeepSeekKeyGate>
        <p>conteúdo do funil</p>
      </DeepSeekKeyGate>,
    );

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/chave');
    });
    expect(screen.queryByText('conteúdo do funil')).not.toBeInTheDocument();
  });

  it('should render children when a key is configured', async () => {
    mockedStatus.mockResolvedValue({ configured: true, lastFour: '5678' });

    render(
      <DeepSeekKeyGate>
        <p>conteúdo do funil</p>
      </DeepSeekKeyGate>,
    );

    await screen.findByText('conteúdo do funil');
    expect(replace).not.toHaveBeenCalled();
  });

  it('should show the cv-adapter is down and not redirect when the API does not answer', async () => {
    mockedStatus.mockRejectedValue(new NetworkError());

    render(
      <DeepSeekKeyGate>
        <p>conteúdo do funil</p>
      </DeepSeekKeyGate>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível falar com o cv-adapter');
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('conteúdo do funil')).not.toBeInTheDocument();
  });
});
