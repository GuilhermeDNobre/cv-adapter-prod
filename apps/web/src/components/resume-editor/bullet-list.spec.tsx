import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { deleteResumeBullet, moveResumeBullet } from '../../lib/api-client';
import { BulletList } from './bullet-list';
import { RESUME_ID, experienceEntryFixture, assumedBulletFixture, reviewBulletFixture, resumeDocumentFixture } from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, deleteResumeBullet: vi.fn(), moveResumeBullet: vi.fn(), updateBullet: vi.fn() };
});

vi.mock('./evidence-correction', () => ({
  EvidenceCorrection: () => null,
}));

const mockedMove = vi.mocked(moveResumeBullet);
const mockedDelete = vi.mocked(deleteResumeBullet);

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('BulletList', () => {
  it('should move the bullet and keep focus on the same button', async () => {
    const first = { ...assumedBulletFixture(), ordinal: 0 };
    const second = { ...reviewBulletFixture(), ordinal: 1 };
    const entry = experienceEntryFixture([first, second]);
    const fixture = resumeDocumentFixture();
    mockedMove.mockResolvedValue(fixture);
    render(
      <BulletList entry={entry} experienceId={entry.experienceId} resumeId={RESUME_ID} onDocumentChange={vi.fn()} onEmptyFocus={vi.fn()} />,
    );

    const downButtons = screen.getAllByRole('button', { name: /Mover para baixo o Bullet 1:/ });
    fireEvent.click(downButtons[0]!);
    await flushPromises();

    expect(mockedMove).toHaveBeenCalledWith(first.id, { direction: 'down' });
    expect(screen.getByText('Bullet movido.')).toBeInTheDocument();
    expect(globalThis.document.activeElement).toBe(downButtons[0]);
    mockedMove.mockReset();
  });

  it('should give each move and remove button a unique name with position and text', async () => {
    const first = { ...assumedBulletFixture(), ordinal: 0 };
    const second = { ...reviewBulletFixture(), ordinal: 1 };
    const entry = experienceEntryFixture([first, second]);
    mockedMove.mockResolvedValue(resumeDocumentFixture());
    render(
      <BulletList entry={entry} experienceId={entry.experienceId} resumeId={RESUME_ID} onDocumentChange={vi.fn()} onEmptyFocus={vi.fn()} />,
    );

    const upButton = screen.getByRole('button', { name: 'Mover para cima o Bullet 1: Cut API latency by 30% with caching.' });
    const downButton = screen.getByRole('button', { name: 'Mover para baixo o Bullet 2: Led a team of 20 engineers.' });
    const removeButton = screen.getByRole('button', { name: 'Remover o Bullet 1: Cut API latency by 30% with caching.' });
    expect(upButton).toBeInTheDocument();
    expect(downButton).toBeInTheDocument();
    expect(removeButton).toBeInTheDocument();
    const names = screen.getAllByRole('button', { name: /o Bullet \d+:/ }).map((button) => button.getAttribute('aria-label'));
    expect(new Set(names).size).toBe(names.length);
    mockedMove.mockReset();
  });

  it('should truncate the button label text after about 40 characters', async () => {
    const longText = 'Construí pipelines de dados em Python que processam 2 TB por dia para 40 lojas.';
    const longBullet = { ...assumedBulletFixture(), text: longText, ordinal: 0 };
    const entry = experienceEntryFixture([longBullet]);
    mockedMove.mockResolvedValue(resumeDocumentFixture());
    render(
      <BulletList entry={entry} experienceId={entry.experienceId} resumeId={RESUME_ID} onDocumentChange={vi.fn()} onEmptyFocus={vi.fn()} />,
    );

    const removeButton = screen.getByRole('button', { name: /Remover o Bullet 1:/ });
    const label = removeButton.getAttribute('aria-label') ?? '';
    expect(label).toContain('Remover o Bullet 1:');
    expect(label.endsWith('…')).toBe(true);
    expect(label).not.toContain(longText);
    mockedMove.mockReset();
  });

  it('should confirm removal with focus on Cancelar and focus the next item after confirm', async () => {
    const first = { ...assumedBulletFixture(), ordinal: 0 };
    const second = { ...reviewBulletFixture(), ordinal: 1 };
    const entry = experienceEntryFixture([first, second]);
    const fixture = resumeDocumentFixture();
    mockedDelete.mockResolvedValue(fixture);
    render(
      <BulletList entry={entry} experienceId={entry.experienceId} resumeId={RESUME_ID} onDocumentChange={vi.fn()} onEmptyFocus={vi.fn()} />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Remover o Bullet/ })[0]!);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(globalThis.document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remover Bullet' }));
    await flushPromises();

    expect(mockedDelete).toHaveBeenCalledWith(first.id);
    expect(screen.getByText('Bullet removido.')).toBeInTheDocument();
    mockedDelete.mockReset();
  });

  it('should focus the heading when the last bullet is removed', async () => {
    const only = { ...assumedBulletFixture(), ordinal: 0 };
    const entry = experienceEntryFixture([only]);
    const fixture = resumeDocumentFixture();
    const onEmpty = vi.fn();
    mockedDelete.mockResolvedValue(fixture);
    render(
      <BulletList entry={entry} experienceId={entry.experienceId} resumeId={RESUME_ID} onDocumentChange={vi.fn()} onEmptyFocus={onEmpty} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Remover o Bullet/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remover Bullet' }));
    await flushPromises();

    expect(onEmpty).toHaveBeenCalled();
    mockedDelete.mockReset();
  });
});
