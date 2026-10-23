import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader } from './card';

describe('Card', () => {
  it('should render with surface tokens', () => {
    render(
      <Card>
        <span>conteúdo</span>
      </Card>,
    );

    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    const card = screen.getByText('conteúdo').parentElement;
    expect(card).toHaveClass('bg-surface');
    expect(card).toHaveClass('border-border');
  });

  it('should render a header separated by border', () => {
    render(
      <Card>
        <CardHeader>
          <span>título</span>
        </CardHeader>
      </Card>,
    );

    expect(screen.getByText('título')).toBeInTheDocument();
    const header = screen.getByText('título').parentElement;
    expect(header).toHaveClass('border-b');
    expect(header).toHaveClass('border-border');
  });
});
