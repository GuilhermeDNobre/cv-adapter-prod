import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootLayout from './layout';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { readonly children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('geist/font/sans', () => ({
  GeistSans: { variable: 'geist-sans-mock' },
}));

vi.mock('geist/font/mono', () => ({
  GeistMono: { variable: 'geist-mono-mock' },
}));

describe('RootLayout', () => {
  it('should render the header with settings on every screen', () => {
    render(
      <RootLayout>
        <p>conteúdo da tela</p>
      </RootLayout>,
    );

    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'href',
      '/configuracoes',
    );
    expect(screen.getByText('conteúdo da tela')).toBeInTheDocument();
  });
});
