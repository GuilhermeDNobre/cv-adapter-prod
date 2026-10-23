import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SectionDrawer } from './section-drawer';
import { SectionPanel } from '../resume-editor/section-panel';
import {
  RESUME_ID,
  experienceSectionFixture,
  summarySectionFixture,
} from '../resume-editor/editor-fixtures';

describe('SectionDrawer', () => {
  it('should show a single visible title in the resume language', async () => {
    const section = experienceSectionFixture();
    render(
      <SectionDrawer open onOpenChange={vi.fn()} title="Experiência Profissional">
        <SectionPanel
          section={section}
          sections={[summarySectionFixture(), section]}
          resumeId={RESUME_ID}
          language="pt"
          onDocumentChange={vi.fn()}
          onSectionRemoved={vi.fn()}
        />
      </SectionDrawer>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Experiência Profissional' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Editar seção')).toBeInTheDocument();
    expect(screen.getByText('Cut API latency by 30% with caching.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Experience' })).not.toBeInTheDocument();
  });

  it('should look like a drawer on the right side', async () => {
    render(
      <SectionDrawer open onOpenChange={vi.fn()} title="Experience">
        <p>Drawer body.</p>
      </SectionDrawer>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Experience' });
    expect(dialog.className).toMatch(/right-0/);
    expect(dialog.className).toMatch(/min\(440px/);
  });

  it('should close with Escape', async () => {
    const onOpenChange = vi.fn();
    render(
      <SectionDrawer open onOpenChange={onOpenChange} title="Experience">
        <p>Drawer body.</p>
      </SectionDrawer>,
    );

    await screen.findByText('Drawer body.');
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should call the focus return when closed', async () => {
    const onRequestFocus = vi.fn();
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(true);
      return (
        <SectionDrawer
          open={open}
          onOpenChange={(next) => {
            if (!next) setOpen(false);
          }}
          title="Experience"
          onRequestFocus={onRequestFocus}
        >
          <p>Drawer body.</p>
        </SectionDrawer>
      );
    }
    render(<Harness />);

    await screen.findByText('Drawer body.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    });
    expect(onRequestFocus).toHaveBeenCalledTimes(1);
  });

  it('should show the drawer content immediately without waiting for the animation to end', () => {
    render(
      <SectionDrawer open onOpenChange={vi.fn()} title="Experience">
        <p>Drawer body.</p>
      </SectionDrawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Experience' })).toBeInTheDocument();
    expect(screen.getByText('Drawer body.')).toBeInTheDocument();
  });
});
