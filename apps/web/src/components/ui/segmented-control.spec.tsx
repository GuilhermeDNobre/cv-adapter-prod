import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl } from './segmented-control';

describe('SegmentedControl', () => {
  it('should set aria-checked and call onChange', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={[
          { value: 'all', label: 'Todos', count: 9 },
          { value: 'covered', label: 'Cobertos', count: 5 },
        ]}
        value="all"
        onChange={onChange}
        ariaLabel="Filtro"
      />,
    );

    const all = screen.getByRole('radio', { name: /Todos/ });
    const covered = screen.getByRole('radio', { name: /Cobertos/ });
    expect(all).toHaveAttribute('aria-checked', 'true');
    expect(covered).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('9')).toBeInTheDocument();

    fireEvent.click(covered);
    expect(onChange).toHaveBeenCalledWith('covered');
  });
});
