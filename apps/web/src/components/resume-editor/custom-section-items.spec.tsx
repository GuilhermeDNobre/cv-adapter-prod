import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { addCustomSectionItem, deleteCustomSectionEntry } from '../../lib/api-client';
import { CustomSectionItems } from './custom-section-items';
import { resumeDocumentFixture } from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, addCustomSectionItem: vi.fn(), deleteCustomSectionEntry: vi.fn() };
});

const mockedAdd = vi.mocked(addCustomSectionItem);
const mockedDelete = vi.mocked(deleteCustomSectionEntry);

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

function customSection() {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    kind: 'custom' as const,
    title: 'Talks',
    ordinal: 3,
    entries: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ordinal: 0,
        experienceId: null,
        educationEntryId: null,
        heading: 'First talk',
        company: null,
        role: null,
        institution: null,
        degree: null,
        period: null,
        bullets: [],
      },
    ],
    comments: [],
  };
}

describe('CustomSectionItems', () => {
  it('should add an item and announce it', async () => {
    const fixture = resumeDocumentFixture();
    mockedAdd.mockResolvedValue(fixture);
    render(<CustomSectionItems section={customSection()} onDocumentChange={vi.fn()} onEmptyFocus={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Novo item da Custom Section'), { target: { value: 'Second talk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    await flushPromises();

    expect(mockedAdd).toHaveBeenCalled();
    expect(screen.getByText('Item adicionado.')).toBeInTheDocument();
    mockedAdd.mockReset();
  });

  it('should confirm removal with focus on Cancelar', async () => {
    const fixture = resumeDocumentFixture();
    mockedDelete.mockResolvedValue(fixture);
    render(<CustomSectionItems section={customSection()} onDocumentChange={vi.fn()} onEmptyFocus={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover o item 1: First talk' }));
    expect(globalThis.document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remover item' }));
    await flushPromises();

    expect(mockedDelete).toHaveBeenCalled();
    mockedDelete.mockReset();
  });

  it('should give each remove button a unique name with position and text', async () => {
    const section = {
      ...customSection(),
      entries: [
        { ...customSection().entries[0]!, ordinal: 0, heading: 'First talk' },
        {
          ...customSection().entries[0]!,
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ordinal: 1,
          heading: 'Second talk about streaming pipelines',
        },
      ],
    };
    mockedDelete.mockResolvedValue(resumeDocumentFixture());
    render(<CustomSectionItems section={section} onDocumentChange={vi.fn()} onEmptyFocus={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Remover o item 1: First talk' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover o item 2: Second talk about streaming pipelines' })).toBeInTheDocument();
    mockedDelete.mockReset();
  });
});
