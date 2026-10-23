import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { SiteHeader } from './site-header';

const navigationState = vi.hoisted(() => ({ pathname: '/' }));
const themeState = vi.hoisted(() => ({
  resolvedTheme: 'light' as string | undefined,
  setTheme: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: themeState.resolvedTheme,
    setTheme: themeState.setTheme,
  }),
}));

describe('SiteHeader', () => {
  afterEach(() => {
    navigationState.pathname = '/';
    themeState.resolvedTheme = 'light';
    themeState.setTheme.mockReset();
  });

  it('should show the product name and a link to settings', () => {
    render(<SiteHeader />);

    expect(screen.getByText('cv-adapter')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'href',
      '/configuracoes',
    );
  });

  it('should link to the resume list next to settings', () => {
    render(<SiteHeader />);

    const resumesLink = screen.getByRole('link', { name: 'Currículos' });
    expect(resumesLink).toHaveAttribute('href', '/curriculos');
    const navigation = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(navigation).toContainElement(resumesLink);
    expect(navigation).toContainElement(screen.getByRole('link', { name: 'Configurações' }));
  });

  it('should expose the navigation landmark', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
  });

  it('should link home and mark the current route with aria-current', () => {
    navigationState.pathname = '/curriculos';
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Currículos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Currículos' })).toHaveClass('bg-surface-2');
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Configurações' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('should toggle from light to dark', () => {
    themeState.resolvedTheme = 'light';
    render(<SiteHeader />);

    const toggle = screen.getByRole('button', { name: 'Usar tema escuro' });
    expect(toggle).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(themeState.setTheme).toHaveBeenCalledWith('dark');
  });

  it('should toggle from dark to light', () => {
    themeState.resolvedTheme = 'dark';
    render(<SiteHeader />);

    const toggle = screen.getByRole('button', { name: 'Usar tema claro' });
    fireEvent.click(toggle);
    expect(themeState.setTheme).toHaveBeenCalledWith('light');
  });

  it('should render a neutral label on the server when the theme is unresolved', () => {
    themeState.resolvedTheme = undefined;
    const html = renderToString(<SiteHeader />);

    expect(html).toContain('aria-label="Alternar tema"');
  });

  it('should show the light-dismiss label after mount with resolvedTheme dark', () => {
    themeState.resolvedTheme = 'dark';
    render(<SiteHeader />);

    expect(screen.getByRole('button', { name: 'Usar tema claro' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alternar tema' })).not.toBeInTheDocument();
  });
});
