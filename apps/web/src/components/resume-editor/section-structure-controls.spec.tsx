import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { deleteResumeSection, updateResumeStructure } from '../../lib/api-client';
import { SectionStructureControls } from './section-structure-controls';
import { resumeDocumentFixture, summarySectionFixture, experienceSectionFixture } from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, deleteResumeSection: vi.fn(), updateResumeStructure: vi.fn() };
});

const mockedUpdateStructure = vi.mocked(updateResumeStructure);
const mockedDeleteSection = vi.mocked(deleteResumeSection);

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('SectionStructureControls', () => {
  it('should move the section and keep focus on the same button', async () => {
    const summary = summarySectionFixture();
    const experience = experienceSectionFixture();
    const fixture = resumeDocumentFixture({ sections: [summary, experience] });
    mockedUpdateStructure.mockResolvedValue(fixture);
    render(
      <SectionStructureControls
        section={experience}
        sections={[summary, experience]}
        resumeId={fixture.id}
        onDocumentChange={vi.fn()}
        onSectionRemoved={vi.fn()}
      />,
    );

    const upButton = screen.getByRole('button', { name: 'Mover Section para cima' });
    fireEvent.click(upButton);
    await flushPromises();

    expect(mockedUpdateStructure).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Section movida.');
    expect(globalThis.document.activeElement).toBe(upButton);
    mockedUpdateStructure.mockReset();
  });

  it('should confirm removal with focus on Cancelar and notify on confirm', async () => {
    const section = experienceSectionFixture();
    const fixture = resumeDocumentFixture({ sections: [section] });
    const onRemoved = vi.fn();
    mockedDeleteSection.mockResolvedValue(fixture);
    render(
      <SectionStructureControls
        section={section}
        sections={[section]}
        resumeId={fixture.id}
        onDocumentChange={vi.fn()}
        onSectionRemoved={onRemoved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover Section' }));
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(globalThis.document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remover Section' }));
    await flushPromises();

    expect(mockedDeleteSection).toHaveBeenCalledWith(section.id);
    expect(onRemoved).toHaveBeenCalled();
    mockedDeleteSection.mockReset();
  });
});
