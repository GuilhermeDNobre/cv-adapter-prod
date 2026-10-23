import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BriefcaseBusiness, Settings } from 'lucide-react';
import { HomeEntryCard } from './home-entry-card';

describe('HomeEntryCard', () => {
  it('should make the whole card one link named by its title and described by its text', () => {
    render(
      <HomeEntryCard
        href="/vaga"
        icon={BriefcaseBusiness}
        title="Adaptar para uma vaga"
        description="Cole o anúncio e veja a avaliação."
        variant="primary"
      />,
    );

    const link = screen.getByRole('link', { name: 'Adaptar para uma vaga' });
    expect(link).toHaveAttribute('href', '/vaga');
    expect(link).toHaveAccessibleDescription('Cole o anúncio e veja a avaliação.');
    expect(link).toContainElement(screen.getByText('Cole o anúncio e veja a avaliação.'));
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('should hide the icon from assistive technology', () => {
    const { container } = render(
      <HomeEntryCard
        href="/configuracoes"
        icon={Settings}
        title="Configurações"
        description="Chave da DeepSeek."
      />,
    );

    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('should keep a visible focus ring on the card', () => {
    render(
      <HomeEntryCard
        href="/configuracoes"
        icon={Settings}
        title="Configurações"
        description="Chave da DeepSeek."
      />,
    );

    const link = screen.getByRole('link', { name: 'Configurações' });
    expect(link).toHaveClass('focus-visible:outline', 'focus-visible:outline-focus');
  });

  it('should give the primary card the filled icon tile and the secondary the soft one', () => {
    const { container } = render(
      <>
        <HomeEntryCard
          href="/vaga"
          icon={BriefcaseBusiness}
          title="Adaptar para uma vaga"
          description="Primária."
          variant="primary"
        />
        <HomeEntryCard href="/configuracoes" icon={Settings} title="Configurações" description="Secundária." />
      </>,
    );

    const tiles = Array.from(container.querySelectorAll('a > span[aria-hidden="true"]'));
    expect(tiles[0]).toHaveClass('bg-accent', 'text-accent-fg');
    expect(tiles[1]).toHaveClass('bg-accent-soft', 'text-accent-text');
  });
});
