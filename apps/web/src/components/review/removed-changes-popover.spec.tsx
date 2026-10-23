import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RemovedChangesPopover } from './removed-changes-popover';

describe('RemovedChangesPopover', () => {
  it('should render nothing when there is nothing removed', () => {
    render(<RemovedChangesPopover removed={[]} onRestore={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /retirada/ })).not.toBeInTheDocument();
  });

  it('should list the removed evidences with restore actions', async () => {
    const onRestore = vi.fn();
    render(
      <RemovedChangesPopover
        removed={[
          { id: '33333333-3333-4333-8333-333333333333', statement: 'Removed one.' },
          { id: '44444444-4444-4444-8444-444444444444', statement: 'Removed two.' },
        ]}
        onRestore={onRestore}
      />,
    );

    expect(screen.getByRole('button', { name: '2 retiradas' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '2 retiradas' }));
    });

    expect(await screen.findByText('Removed one.')).toBeInTheDocument();
    expect(screen.getByText('Removed two.')).toBeInTheDocument();

    const restoreButtons = screen.getAllByRole('button', { name: 'Restaurar' });
    expect(restoreButtons).toHaveLength(2);

    await act(async () => {
      fireEvent.click(restoreButtons[0] as HTMLElement);
    });
    expect(onRestore).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
  });

  it('should use the singular label for one removal', () => {
    render(
      <RemovedChangesPopover
        removed={[{ id: '33333333-3333-4333-8333-333333333333', statement: 'Removed one.' }]}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '1 retirada' })).toBeInTheDocument();
  });

  it('should show the trigger immediately without waiting for the animation to end', () => {
    render(
      <RemovedChangesPopover
        removed={[{ id: '33333333-3333-4333-8333-333333333333', statement: 'Removed one.' }]}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '1 retirada' })).toBeInTheDocument();
    expect(screen.queryByText('Removed one.')).not.toBeInTheDocument();
  });
});
