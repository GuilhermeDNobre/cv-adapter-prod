import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('should render unchecked without mixed state', () => {
    render(<Checkbox checked={false} label="Backend Engineer" onChange={vi.fn()} />);

    const box = screen.getByRole('checkbox', { name: 'Backend Engineer' });
    expect(box).not.toBeChecked();
    expect(box).not.toHaveAttribute('aria-checked', 'mixed');
  });

  it('should render checked state', () => {
    render(<Checkbox checked label="Backend Engineer" onChange={vi.fn()} />);

    const box = screen.getByRole('checkbox', { name: 'Backend Engineer' });
    expect(box).toBeChecked();
    expect(box).not.toHaveAttribute('aria-checked', 'mixed');
  });

  it('should expose mixed state through aria-checked when partially selected', () => {
    render(
      <Checkbox checked={false} indeterminate label="Group" onChange={vi.fn()} />,
    );

    const box = screen.getByRole('checkbox', { name: 'Group' });
    expect(box).toHaveAttribute('aria-checked', 'mixed');
  });

  it('should toggle through the whole row', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} label="Backend Engineer" meta="Acme" onChange={onChange} />);

    fireEvent.click(screen.getByText('Backend Engineer'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('should name a standalone group box through aria-label with a 28px target', () => {
    render(
      <Checkbox
        checked={false}
        indeterminate
        ariaLabel="Marcar todas as Experiências"
        onChange={vi.fn()}
      />,
    );

    const box = screen.getByRole('checkbox', { name: 'Marcar todas as Experiências' });
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    const target = box.closest('label');
    expect(target?.className).toContain('h-7');
    expect(target?.className).toContain('w-7');
  });

  it('should link a disabled reason through aria-describedby', () => {
    render(
      <Checkbox
        checked={false}
        disabled
        label="Locked item"
        disabledReason="Disponível após confirmar o Career Profile."
        onChange={vi.fn()}
      />,
    );

    const box = screen.getByRole('checkbox', { name: 'Locked item' });
    expect(box).toBeDisabled();
    const describedBy = box.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    const reason = document.getElementById(describedBy ?? '');
    expect(reason?.textContent).toBe('Disponível após confirmar o Career Profile.');
  });

  it('should stay keyboard focusable when enabled', () => {
    render(<Checkbox checked={false} label="Backend Engineer" onChange={vi.fn()} />);

    const box = screen.getByRole('checkbox', { name: 'Backend Engineer' });
    box.focus();
    expect(document.activeElement).toBe(box);
  });
});
