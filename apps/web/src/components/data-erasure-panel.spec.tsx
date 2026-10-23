import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { eraseData } from '../lib/api-client';
import { DataErasurePanel, ERASE_EVERYTHING_MESSAGE } from './data-erasure-panel';

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return { ...actual, eraseData: vi.fn() };
});

const simulated = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: simulated.push }),
}));

const mockedErase = vi.mocked(eraseData);
const push = simulated.push;

describe('DataErasurePanel', () => {
  afterEach(() => {
    mockedErase.mockReset();
    push.mockReset();
  });

  it('should describe the three scopes and that the key stays saved', () => {
    render(<DataErasurePanel />);

    expect(screen.getByText(/Remove todas as vagas coladas/)).toBeInTheDocument();
    expect(screen.getByText(/Tailored Resumes daquelas vagas/)).toBeInTheDocument();
    expect(screen.getByText(/Remove contatos, experiências/)).toBeInTheDocument();
    expect(screen.getByText(/e todos os currículos/)).toBeInTheDocument();
    expect(screen.getByText(/Remove todos os Base Resumes/)).toBeInTheDocument();
    expect(screen.getByText(/de todas as opções acima/)).toBeInTheDocument();
    expect(screen.getByText(/A chave da DeepSeek continua salva/)).toBeInTheDocument();
  });

  it('should open an alertdialog with focus on Cancelar and return focus to the trigger', async () => {
    render(<DataErasurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Apagar vagas e avaliações' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar apagar vagas' })).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    expect(document.activeElement).toBe(cancel);

    fireEvent.click(cancel);

    expect(
      screen.queryByRole('button', { name: 'Confirmar apagar vagas' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Apagar vagas e avaliações' }),
    );
    expect(mockedErase).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('should confirm the erasure inside a status region', async () => {
    mockedErase.mockResolvedValue({ scope: 'job_descriptions' });
    render(<DataErasurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Apagar vagas e avaliações' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar apagar vagas' }));

    await screen.findByText(/Vagas e avaliações apagadas/);
    expect(mockedErase).toHaveBeenCalledWith('job_descriptions');
    expect(screen.getByRole('status')).toHaveTextContent('Vagas e avaliações apagadas.');
    expect(push).not.toHaveBeenCalled();
  });

  it('should confirm the career profile erasure without navigating', async () => {
    mockedErase.mockResolvedValue({ scope: 'career_profile' });
    render(<DataErasurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Apagar Career Profile' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar apagar perfil' }));

    await screen.findByText(/Career Profile apagado/);
    expect(mockedErase).toHaveBeenCalledWith('career_profile');
    expect(screen.getByRole('status')).toHaveTextContent('Career Profile apagado');
    expect(push).not.toHaveBeenCalled();
  });

  it('should confirm the resumes erasure and return focus to its trigger', async () => {
    mockedErase.mockResolvedValue({ scope: 'resumes' });
    render(<DataErasurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Apagar currículos' }));
    expect(await screen.findByRole('button', { name: 'Confirmar apagar currículos' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar apagar currículos' }));

    await screen.findByText(/Currículos apagados/);
    expect(mockedErase).toHaveBeenCalledWith('resumes');
    expect(screen.getByRole('status')).toHaveTextContent('Currículos apagados');
    expect(push).not.toHaveBeenCalled();
  });

  it('should navigate home after wiping everything with the exact word', async () => {
    mockedErase.mockResolvedValue({ scope: 'everything' });
    render(<DataErasurePanel />);

    const wipe = screen.getByRole('button', { name: 'Zerar tudo' });
    expect(wipe).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Digite APAGAR para habilitar'), {
      target: { value: 'APAGA' },
    });
    expect(screen.getByRole('button', { name: 'Zerar tudo' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Digite APAGAR para habilitar'), {
      target: { value: 'APAGAR' },
    });

    const enabled = screen.getByRole('button', { name: 'Zerar tudo' });
    expect(enabled).toBeEnabled();

    fireEvent.click(enabled);

    const confirmWipe = await screen.findByRole('button', { name: 'Confirmar zerar tudo' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(confirmWipe);

    await vi.waitFor(() => {
      expect(mockedErase).toHaveBeenCalledWith('everything');
    });
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith('/?dados=zerados');
    });
    expect(screen.queryByText(ERASE_EVERYTHING_MESSAGE)).not.toBeInTheDocument();
  });

  it('should stay on settings with an error when wiping everything fails', async () => {
    mockedErase.mockRejectedValue(new Error('boom'));
    render(<DataErasurePanel />);

    fireEvent.change(screen.getByLabelText('Digite APAGAR para habilitar'), {
      target: { value: 'APAGAR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zerar tudo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar zerar tudo' }));

    await screen.findByText(/Não foi possível apagar agora/);
    expect(mockedErase).toHaveBeenCalledWith('everything');
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(ERASE_EVERYTHING_MESSAGE)).not.toBeInTheDocument();
  });

  it('should stay disabled for a nearly correct word', () => {
    render(<DataErasurePanel />);

    fireEvent.change(screen.getByLabelText('Digite APAGAR para habilitar'), {
      target: { value: 'apagar' },
    });

    expect(screen.getByRole('button', { name: 'Zerar tudo' })).toBeDisabled();
  });

  it('should cancel the confirmation with Escape and return focus to the trigger', async () => {
    render(<DataErasurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Apagar vagas e avaliações' }));

    const cancel = await screen.findByRole('button', { name: 'Cancelar' });
    expect(document.activeElement).toBe(cancel);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.keyDown(cancel, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: 'Confirmar apagar vagas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Apagar vagas e avaliações' }),
    );
    expect(mockedErase).not.toHaveBeenCalled();
  });

  it('should use danger tokens for destructive actions', async () => {
    render(<DataErasurePanel />);

    for (const name of ['Apagar vagas e avaliações', 'Apagar Career Profile', 'Apagar currículos', 'Zerar tudo']) {
      const trigger = screen.getByRole('button', { name: name });
      expect(trigger).toHaveClass('bg-danger');
      expect(trigger).not.toHaveClass('bg-blue-700');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Apagar vagas e avaliações' }));

    const confirm = await screen.findByRole('button', { name: 'Confirmar apagar vagas' });
    expect(confirm).toHaveClass('bg-danger');
    expect(confirm).not.toHaveClass('bg-blue-700');
  });
});
