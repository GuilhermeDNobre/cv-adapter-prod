import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, buttonClasses, IconButton } from './button';

describe('Button', () => {
  it('should default to primary variant', () => {
    render(<Button>Continuar</Button>);

    const button = screen.getByRole('button', { name: 'Continuar' });
    expect(button).toHaveClass('bg-accent');
    expect(button).toHaveClass('text-accent-fg');
  });

  it('should apply token classes per variant', () => {
    const { rerender } = render(<Button variant="primary">A</Button>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('bg-accent');

    rerender(<Button variant="secondary">A</Button>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('bg-surface');
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('border-border-strong');

    rerender(<Button variant="ghost">A</Button>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('text-text-2');

    rerender(<Button variant="danger">A</Button>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('bg-danger');
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('focus-visible:outline-danger');

    rerender(<Button variant="danger-ghost">A</Button>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('text-danger-text');
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('hover:bg-danger-soft');
  });

  it('should size md, sm and xs by height', () => {
    const { rerender } = render(<Button size="md">A</Button>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('h-9');

    rerender(<Button size="sm">A</Button>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('h-8');

    rerender(<Button size="xs">A</Button>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('h-[30px]');
  });

  it('should disable with dashed border and not-allowed cursor', () => {
    render(<Button disabled>Salvar</Button>);

    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:border-dashed');
    expect(button).toHaveClass('disabled:cursor-not-allowed');
    expect(button).toHaveClass('disabled:bg-surface-2');
    expect(button).toHaveClass('disabled:text-text-3');
  });

  it('should forward aria-describedby', () => {
    render(<Button aria-describedby="reason">Avançar</Button>);

    expect(screen.getByRole('button', { name: 'Avançar' })).toHaveAttribute(
      'aria-describedby',
      'reason',
    );
  });

  it('should render icons on both sides', () => {
    render(
      <Button iconLeft={<span data-testid="left" />} iconRight={<span data-testid="right" />}>
        Avançar
      </Button>,
    );

    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });

  it('should expose buttonClasses for links', () => {
    expect(buttonClasses('primary', 'md')).toContain('bg-accent');
    expect(buttonClasses('secondary', 'sm')).toContain('bg-surface');
    expect(buttonClasses('danger', 'xs')).toContain('bg-danger');
  });
});

describe('IconButton', () => {
  it('should require an accessible label and press with scale 0.94', () => {
    render(<IconButton aria-label="Usar tema escuro">M</IconButton>);

    const button = screen.getByRole('button', { name: 'Usar tema escuro' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('h-8');
    expect(button).toHaveClass('w-8');
    expect(button).toHaveClass('motion-safe:active:scale-[0.94]');
  });
});
