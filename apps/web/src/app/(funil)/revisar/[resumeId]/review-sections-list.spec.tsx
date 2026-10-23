import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReviewSectionsList } from './review-sections-list';
import { resumeDocumentFixture } from '../../../../components/resume-editor/editor-fixtures';

describe('ReviewSectionsList', () => {
  it('should render sections in ordinal order with edit labels', () => {
    const onSectionSelect = vi.fn();
    render(
      <ReviewSectionsList document={resumeDocumentFixture()} onSectionSelect={onSectionSelect} />,
    );

    expect(screen.getByRole('heading', { name: 'Seções' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar seção Summary' })).toBeInTheDocument();
  });

  it('should notify the section selection through the edit button', () => {
    const onSectionSelect = vi.fn();
    const document = resumeDocumentFixture();
    const sectionId = document.sections[0]?.id ?? '';
    render(<ReviewSectionsList document={document} onSectionSelect={onSectionSelect} />);

    const label = screen.getByRole('button', { name: 'Editar seção Summary' });
    fireEvent.click(label);

    expect(onSectionSelect).toHaveBeenCalledWith(sectionId);
  });
});
