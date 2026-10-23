import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('should show covered text with ok tokens', () => {
    render(<StatusBadge status="covered" />);

    const badge = screen.getByText('Coberto');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-ok-soft');
    expect(badge).toHaveClass('text-ok');
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('should show partial text with warn tokens', () => {
    render(<StatusBadge status="partial" />);

    const badge = screen.getByText('Parcial');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-warn-soft');
    expect(badge).toHaveClass('text-warn');
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('should show gap text with neutral tokens', () => {
    render(<StatusBadge status="gap" />);

    const badge = screen.getByText('Gap');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-surface-2');
    expect(badge).toHaveClass('text-text-2');
    expect(badge.querySelector('svg')).not.toBeNull();
  });
});
