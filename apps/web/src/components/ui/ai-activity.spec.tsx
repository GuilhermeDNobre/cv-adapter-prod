import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiActivity } from './ai-activity';

describe('AiActivity', () => {
  it('should show the message with a counter', () => {
    render(<AiActivity message="Lendo o arquivo…" current={2} total={4} />);

    expect(screen.getByText('Lendo o arquivo…')).toBeInTheDocument();
    expect(screen.getByText('2 de 4')).toBeInTheDocument();
  });

  it('should expose role progressbar with aria-valuenow when there is progress', () => {
    render(<AiActivity message="Cruzando as Evidences…" progress={50} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
  });

  it('should omit counter and progressbar when not provided', () => {
    render(<AiActivity message="Gerando…" />);

    expect(screen.getByText('Gerando…')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
