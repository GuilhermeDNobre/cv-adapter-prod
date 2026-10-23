import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { getCareerProfile, getDeepSeekKeyStatus, listResumes } from '../lib/api-client';
import { ERASE_EVERYTHING_MESSAGE } from '../components/data-erasure-panel';
import HomePage from './page';

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
}));

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return {
    ...actual,
    getDeepSeekKeyStatus: vi.fn(),
    getCareerProfile: vi.fn(),
    listResumes: vi.fn(),
  };
});

const mockedStatus = vi.mocked(getDeepSeekKeyStatus);
const replace = simulated.replace;

async function renderWithKey(): Promise<void> {
  mockedStatus.mockResolvedValue({ configured: true, lastFour: '5678' });
  render(<HomePage />);
  await screen.findByRole('link', { name: 'Adaptar para uma vaga' });
}

describe('HomePage', () => {
  afterEach(() => {
    mockedStatus.mockReset();
    replace.mockReset();
    window.history.pushState({}, '', '/');
  });

  it('should redirect to chave when no key is configured', async () => {
    mockedStatus.mockResolvedValue({ configured: false, lastFour: null });

    render(<HomePage />);

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/chave');
    });
  });

  it('should offer the three entry cards as links inside one navigation', async () => {
    await renderWithKey();

    const navigation = screen.getByRole('navigation', { name: 'O que você quer fazer' });
    const links = within(navigation).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/vaga',
      '/curriculos',
      '/configuracoes',
    ]);
  });

  it('should start the single flow at the vaga from the adapt card', async () => {
    await renderWithKey();

    const adapt = screen.getByRole('link', { name: 'Adaptar para uma vaga' });
    expect(adapt).toHaveAttribute('href', '/vaga');
    expect(adapt).toHaveAccessibleDescription(/escolha um currículo salvo ou envie um novo/);
  });

  it('should send the resume card to the resume area instead of the import step', async () => {
    await renderWithKey();

    const resumes = screen.getByRole('link', { name: 'Meus currículos' });
    expect(resumes).toHaveAttribute('href', '/curriculos');
    expect(resumes).toHaveAccessibleDescription(/gerencie os currículos que você já salvou/);
    expect(screen.queryByRole('link', { name: 'Enviar currículo' })).not.toBeInTheDocument();
  });

  it('should describe the settings card', async () => {
    await renderWithKey();

    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAccessibleDescription(
      'Chave da DeepSeek, saldo da conta e apagar dados.',
    );
  });

  it('should not read the career profile or the resumes on the home page', async () => {
    await renderWithKey();

    expect(getCareerProfile).not.toHaveBeenCalled();
    expect(listResumes).not.toHaveBeenCalled();
  });

  it('should show the erasure confirmation when dados=zerados is present', async () => {
    window.history.pushState({}, '', '/?dados=zerados');

    await renderWithKey();

    expect(screen.getByRole('status')).toHaveTextContent(ERASE_EVERYTHING_MESSAGE);
  });

  it('should keep the status region empty without the parameter', async () => {
    await renderWithKey();

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('should preserve the vaga id in the adapt card', async () => {
    const vagaId = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
    window.history.pushState({}, '', `/?vaga=${vagaId}`);

    await renderWithKey();

    expect(screen.getByRole('link', { name: 'Adaptar para uma vaga' })).toHaveAttribute(
      'href',
      `/vaga?vaga=${vagaId}`,
    );
    expect(screen.getByRole('link', { name: 'Meus currículos' })).toHaveAttribute(
      'href',
      '/curriculos',
    );
  });
});
