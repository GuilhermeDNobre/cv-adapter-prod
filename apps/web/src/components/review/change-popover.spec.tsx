import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChangePopover } from './change-popover';

const HOST_RECT = { top: 100, left: 200, width: 120, height: 30 };

function renderOpenPopover(props = {}) {
  const onOpenChange = vi.fn();
  const onAccept = vi.fn();
  const onReject = vi.fn();
  const onRequestFocus = vi.fn();
  render(
    <ChangePopover
      bulletText="Cut latency by 30%."
      beforeText="Slow endpoint without caching."
      coverages={[
        { requirementId: '11111111-1111-4111-8111-111111111111', literalTerm: 'Kubernetes' },
        { requirementId: '22222222-2222-4222-8222-222222222222', literalTerm: 'TypeScript' },
      ]}
      hostRect={HOST_RECT}
      open
      onOpenChange={onOpenChange}
      onAccept={onAccept}
      onReject={onReject}
      onRequestFocus={onRequestFocus}
      {...props}
    />,
  );
  return { onOpenChange, onAccept, onReject, onRequestFocus };
}

describe('ChangePopover', () => {
  it('should show the bullet text and the covered requirements', async () => {
    renderOpenPopover();

    expect(await screen.findByText('Cut latency by 30%.')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('should show a fallback when no requirement is covered', async () => {
    renderOpenPopover({ coverages: [] });

    expect(await screen.findByText('Nenhum Requirement coberto.')).toBeInTheDocument();
  });

  it('should call accept and reject actions', async () => {
    const { onAccept, onReject } = renderOpenPopover();

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Aceitar' }));
    });
    expect(onAccept).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rejeitar' }));
    });
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('should close with Escape', async () => {
    const { onOpenChange } = renderOpenPopover();

    await screen.findByRole('button', { name: 'Aceitar' });
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should render nothing actionable when closed', () => {
    render(
      <ChangePopover
        bulletText="Cut latency by 30%."
        coverages={[]}
        hostRect={HOST_RECT}
        open={false}
        onOpenChange={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Aceitar' })).not.toBeInTheDocument();
  });

  it('should show the actions immediately without waiting for the animation to end', () => {
    renderOpenPopover();

    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument();
  });

  it('should keep the popover open on the focus scroll of the opening frame', async () => {
    const { onOpenChange } = renderOpenPopover();

    await screen.findByRole('button', { name: 'Aceitar' });
    await act(async () => {
      fireEvent.scroll(window);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('should close on scroll without moving focus', async () => {
    const { onOpenChange, onRequestFocus } = renderOpenPopover();

    await screen.findByRole('button', { name: 'Aceitar' });
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    await act(async () => {
      fireEvent.scroll(window);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRequestFocus).not.toHaveBeenCalled();
  });

  it('should do nothing on scroll without an open popover', async () => {
    const onOpenChange = vi.fn();
    render(
      <ChangePopover
        bulletText="Cut latency by 30%."
        coverages={[]}
        hostRect={HOST_RECT}
        open={false}
        onOpenChange={onOpenChange}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    await act(async () => {
      fireEvent.scroll(window);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('should remove the scroll listeners when the popover closes', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ChangePopover
        bulletText="Cut latency by 30%."
        coverages={[]}
        hostRect={HOST_RECT}
        open
        onOpenChange={onOpenChange}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Aceitar' });
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    await act(async () => {
      rerender(
        <ChangePopover
          bulletText="Cut latency by 30%."
          coverages={[]}
          hostRect={HOST_RECT}
          open={false}
          onOpenChange={onOpenChange}
          onAccept={vi.fn()}
          onReject={vi.fn()}
        />,
      );
    });
    await act(async () => {
      fireEvent.scroll(window);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('should show the title, pending status and a close action', async () => {
    renderOpenPopover();

    expect(await screen.findByText('Alteração no currículo')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });

  it('should show the new text in the Depois block', async () => {
    renderOpenPopover();

    expect(await screen.findByText('Depois')).toBeInTheDocument();
    expect(screen.getByText('Cut latency by 30%.')).toBeInTheDocument();
  });

  it('should show the origin statement in the Antes block', async () => {
    renderOpenPopover();

    expect(await screen.findByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Slow endpoint without caching.')).toBeInTheDocument();
  });

  it('should focus Aceitar when the popover opens', async () => {
    renderOpenPopover();

    const accept = await screen.findByRole('button', { name: 'Aceitar' });
    await waitFor(() => expect(document.activeElement).toBe(accept));
  });

  it('should size the popover to 340px with the large shadow', async () => {
    renderOpenPopover();

    const dialog = await screen.findByRole('dialog', { name: 'Alteração no currículo' });
    expect(dialog.className).toMatch(/w-\[340px\]/);
    expect(dialog.className).toMatch(/shadow-lg/);
  });
});
