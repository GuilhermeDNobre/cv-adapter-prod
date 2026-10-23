import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '../lib/api-client';
import { saveDeepSeekKey } from '../lib/api-client';
import { DeepSeekKeyForm } from './deepseek-key-form';

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return { ...actual, saveDeepSeekKey: vi.fn() };
});

const mockedSave = vi.mocked(saveDeepSeekKey);

function acceptedBalance(isAvailable: boolean) {
  return {
    status: { configured: true, lastFour: '5678' },
    balance: { isAvailable, balances: [{ currency: 'CNY', totalBalance: '10.00' }] },
  };
}

function typeKey(value: string): void {
  fireEvent.change(screen.getByLabelText('Chave da DeepSeek'), { target: { value } });
}

function submitForm(): void {
  const field = screen.getByLabelText('Chave da DeepSeek');
  const form = field.closest('form');
  if (form === null) throw new Error('Expected the key form to be rendered');
  fireEvent.submit(form);
}

describe('DeepSeekKeyForm', () => {
  afterEach(() => {
    mockedSave.mockReset();
  });

  it('should render the key field hidden with an associated label', () => {
    render(<DeepSeekKeyForm />);

    const field = screen.getByLabelText('Chave da DeepSeek');
    expect(field).toHaveAttribute('type', 'password');
  });

  it('should toggle between hidden and visible key', () => {
    render(<DeepSeekKeyForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));

    expect(screen.getByLabelText('Chave da DeepSeek')).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));

    expect(screen.getByLabelText('Chave da DeepSeek')).toHaveAttribute('type', 'password');
  });

  it('should explain the cost and where to create a key', () => {
    render(<DeepSeekKeyForm />);

    expect(screen.getByText(/custo é cobrado da sua conta na DeepSeek/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Crie uma chave na DeepSeek/ })).toHaveAttribute(
      'href',
      'https://platform.deepseek.com/api_keys',
    );
  });

  it('should show the refusal message and not call onSaved when the key is rejected', async () => {
    const onSaved = vi.fn();
    mockedSave.mockRejectedValue(
      new ApiError(422, 'rejected', { code: 'ai_key_rejected', message: 'rejected' }),
    );
    render(<DeepSeekKeyForm onSaved={onSaved} />);

    typeKey('sk-wrong');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('recusou essa chave');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('should say it could not check when DeepSeek is down', async () => {
    mockedSave.mockRejectedValue(new ApiError(503, 'down', { code: 'ai_unavailable' }));
    render(<DeepSeekKeyForm />);

    typeKey('sk-live');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível conferir a chave agora');
  });

  it('should save with zero balance, warn and report unavailable', async () => {
    const onSaved = vi.fn();
    mockedSave.mockResolvedValue(acceptedBalance(false));
    render(<DeepSeekKeyForm onSaved={onSaved} />);

    typeKey('sk-empty');
    submitForm();

    await screen.findByText(/saldo.*está zerado/);
    expect(onSaved).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should save an accepted key and report availability', async () => {
    const onSaved = vi.fn();
    mockedSave.mockResolvedValue(acceptedBalance(true));
    render(<DeepSeekKeyForm onSaved={onSaved} />);

    typeKey('sk-live');
    submitForm();

    await screen.findByText('Chave salva.');
    expect(onSaved).toHaveBeenCalledWith(true);
  });
});
