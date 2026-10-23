import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createResumeSection, getResume } from '../../lib/api-client';
import { AddCustomSectionForm } from './add-custom-section-form';
import { resumeDocumentFixture, summarySectionFixture } from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, createResumeSection: vi.fn(), getResume: vi.fn() };
});

const mockedCreate = vi.mocked(createResumeSection);
const mockedGet = vi.mocked(getResume);

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('AddCustomSectionForm', () => {
  it('should create the section and reload the document', async () => {
    const document = resumeDocumentFixture();
    mockedCreate.mockResolvedValue({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    mockedGet.mockResolvedValue(document);
    const onChange = vi.fn();
    render(<AddCustomSectionForm resumeId={document.id} sections={[summarySectionFixture()]} onDocumentChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Título da nova Custom Section'), { target: { value: 'Awards' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Custom Section' }));
    await flushPromises();

    expect(mockedCreate).toHaveBeenCalled();
    expect(mockedGet).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(document);
    mockedCreate.mockReset();
    mockedGet.mockReset();
  });
});
