import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiError, getDeepSeekBalance } from '../lib/api-client';
import { AI_ERROR_MESSAGES } from '../lib/ai-error-messages';
import { DeepSeekBalancePanel } from './deepseek-balance-panel';

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return { ...actual, getDeepSeekBalance: vi.fn() };
});

const mockedBalance = vi.mocked(getDeepSeekBalance);

describe('DeepSeekBalancePanel', () => {
  afterEach(() => {
    mockedBalance.mockReset();
  });

  it('should show balances when the query succeeds', async () => {
    mockedBalance.mockResolvedValue({
      isAvailable: true,
      balances: [{ currency: 'CNY', totalBalance: '10.00' }],
    });

    render(<DeepSeekBalancePanel />);

    await screen.findByText('CNY: 10.00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should warn explicitly when the balance is zero', async () => {
    mockedBalance.mockResolvedValue({
      isAvailable: false,
      balances: [{ currency: 'CNY', totalBalance: '0.00' }],
    });

    render(<DeepSeekBalancePanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('está zerado');
  });

  it('should say the balance could not be checked without hiding the section', async () => {
    mockedBalance.mockRejectedValue(new ApiError(503, 'down'));

    render(<DeepSeekBalancePanel />);

    await screen.findByText('Não foi possível consultar o saldo agora.');
    expect(screen.getByRole('region', { name: 'Saldo da DeepSeek' })).toBeInTheDocument();
  });

  it('should show the AI error message when the key is rejected', async () => {
    mockedBalance.mockRejectedValue(new ApiError(422, 'rejected', { code: 'ai_key_rejected' }));

    render(<DeepSeekBalancePanel />);

    await screen.findByText(AI_ERROR_MESSAGES.ai_key_rejected);
    expect(
      screen.queryByText('Não foi possível consultar o saldo agora.'),
    ).not.toBeInTheDocument();
  });
});
