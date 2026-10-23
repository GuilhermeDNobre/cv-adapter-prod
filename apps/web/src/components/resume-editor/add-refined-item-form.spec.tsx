import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { addCustomSectionItem } from '../../lib/api-client';
import { refineSectionItem } from '../../lib/api-client-adapt';
import { AddRefinedItemForm } from './add-refined-item-form';
import {
  RESUME_ID,
  experienceSectionFixture,
  resumeDocumentFixture,
  summarySectionFixture,
} from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, addCustomSectionItem: vi.fn() };
});

vi.mock('../../lib/api-client-adapt', () => ({
  refineSectionItem: vi.fn(),
}));

const mockedRefine = vi.mocked(refineSectionItem);
const mockedAdd = vi.mocked(addCustomSectionItem);

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('AddRefinedItemForm', () => {
  it('should refine the plain text and show original beside refined marked as unconfirmed', async () => {
    mockedRefine.mockResolvedValue({ refined: 'Led the checkout migration.' });
    const section = experienceSectionFixture();
    render(<AddRefinedItemForm section={section} onDocumentChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Novo item da Section'), {
      target: { value: 'did checkout stuff' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refinar com a IA' }));
    await flushPromises();

    expect(mockedRefine).toHaveBeenCalledWith(section.id, { text: 'did checkout stuff' });
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.getByText('did checkout stuff')).toBeInTheDocument();
    expect(screen.getByText('Refinada pela IA')).toBeInTheDocument();
    expect(screen.getByText('Led the checkout migration.')).toBeInTheDocument();
    expect(screen.getByText('Não confirmado')).toBeInTheDocument();
    mockedRefine.mockReset();
    mockedAdd.mockReset();
  });

  it('should save the refined text with createEvidence', async () => {
    mockedRefine.mockResolvedValue({ refined: 'Led the checkout migration.' });
    const fixture = resumeDocumentFixture();
    mockedAdd.mockResolvedValue(fixture);
    const onDocumentChange = vi.fn();
    const section = experienceSectionFixture();
    const entryId = section.entries[0]?.id ?? '';
    render(<AddRefinedItemForm section={section} onDocumentChange={onDocumentChange} />);

    fireEvent.change(screen.getByLabelText('Novo item da Section'), {
      target: { value: 'did checkout stuff' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refinar com a IA' }));
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Usar refinado' }));
    await flushPromises();

    expect(mockedAdd).toHaveBeenCalledWith(
      section.id,
      expect.objectContaining({ text: 'Led the checkout migration.', entryId, createEvidence: true }),
    );
    expect(onDocumentChange).toHaveBeenCalledWith(fixture);
    expect(screen.getByText('Item adicionado.')).toBeInTheDocument();
    mockedRefine.mockReset();
    mockedAdd.mockReset();
  });

  it('should edit the refined text before saving', async () => {
    mockedRefine.mockResolvedValue({ refined: 'Led the checkout migration.' });
    mockedAdd.mockResolvedValue(resumeDocumentFixture());
    const section = experienceSectionFixture();
    render(<AddRefinedItemForm section={section} onDocumentChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Novo item da Section'), {
      target: { value: 'did checkout stuff' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refinar com a IA' }));
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Editar o texto refinado'), {
      target: { value: 'Led the checkout migration with metrics.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Usar refinado' }));
    await flushPromises();

    expect(mockedAdd).toHaveBeenCalledWith(
      section.id,
      expect.objectContaining({
        text: 'Led the checkout migration with metrics.',
        createEvidence: true,
      }),
    );
    mockedRefine.mockReset();
    mockedAdd.mockReset();
  });

  it('should discard the refined version without saving', async () => {
    mockedRefine.mockResolvedValue({ refined: 'Led the checkout migration.' });
    const section = summarySectionFixture();
    render(<AddRefinedItemForm section={section} onDocumentChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Novo item da Section'), {
      target: { value: 'did stuff' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refinar com a IA' }));
    await flushPromises();

    expect(screen.getByText('Não confirmado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.queryByText('Não confirmado')).not.toBeInTheDocument();
    expect(mockedAdd).not.toHaveBeenCalled();
    expect(RESUME_ID).toBeDefined();
    mockedRefine.mockReset();
  });
});
