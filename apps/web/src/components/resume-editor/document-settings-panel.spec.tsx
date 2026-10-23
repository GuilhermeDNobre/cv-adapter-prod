import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { deleteResume, updateResumeSettings } from '../../lib/api-client';
import { DocumentSettingsPanel } from './document-settings-panel';
import { resumeDocumentFixture } from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, deleteResume: vi.fn(), updateResumeSettings: vi.fn() };
});

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
}));

const mockedSettings = vi.mocked(updateResumeSettings);
const mockedDelete = vi.mocked(deleteResume);
const replace = simulated.replace;
const onDocumentChange = vi.fn();

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('DocumentSettingsPanel', () => {
  afterEach(() => {
    mockedSettings.mockReset();
    mockedDelete.mockReset();
    replace.mockReset();
    onDocumentChange.mockReset();
  });

  it('should save the changed template through the settings endpoint', async () => {
    const nextDocument = { ...resumeDocumentFixture(), template: 'dense' as const };
    mockedSettings.mockResolvedValue(nextDocument);
    render(
      <DocumentSettingsPanel resume={resumeDocumentFixture()} onDocumentChange={onDocumentChange} />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Template' }), {
      target: { value: 'dense' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    await flushPromises();

    expect(mockedSettings).toHaveBeenCalledWith(
      resumeDocumentFixture().id,
      expect.objectContaining({ template: 'dense', name: 'Backend focus' }),
    );
    expect(onDocumentChange).toHaveBeenCalledWith(nextDocument);
    expect(screen.getByRole('status')).toHaveTextContent('Configurações do documento salvas.');
  });

  it('should send the renamed title and keep the page heading in sync through the document', async () => {
    const nextDocument = { ...resumeDocumentFixture(), name: 'Foco em liderança' };
    mockedSettings.mockResolvedValue(nextDocument);
    render(
      <DocumentSettingsPanel resume={resumeDocumentFixture()} onDocumentChange={onDocumentChange} />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome do currículo' }), {
      target: { value: 'Foco em liderança' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    await flushPromises();

    expect(mockedSettings).toHaveBeenCalledWith(
      resumeDocumentFixture().id,
      expect.objectContaining({ name: 'Foco em liderança' }),
    );
    expect(onDocumentChange).toHaveBeenCalledWith(nextDocument);
  });

  it('should warn that a method or tone change rewrites the affected bullets', () => {
    render(
      <DocumentSettingsPanel resume={resumeDocumentFixture()} onDocumentChange={onDocumentChange} />,
    );

    expect(screen.getByText(/reescreve os Bullets afetados/)).toBeInTheDocument();
  });

  it('should ask for confirmation before deleting and return focus on cancel', () => {
    render(
      <DocumentSettingsPanel resume={resumeDocumentFixture()} onDocumentChange={onDocumentChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apagar este currículo' }));

    expect(screen.getByRole('button', { name: 'Confirmar apagar currículo' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(
      screen.queryByRole('button', { name: 'Confirmar apagar currículo' }),
    ).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Apagar este currículo' }),
    );
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('should delete the resume and return to the list after confirmation', async () => {
    mockedDelete.mockResolvedValue(undefined);
    render(
      <DocumentSettingsPanel resume={resumeDocumentFixture()} onDocumentChange={onDocumentChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apagar este currículo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar apagar currículo' }));
    await flushPromises();

    expect(mockedDelete).toHaveBeenCalledWith(resumeDocumentFixture().id);
    expect(replace).toHaveBeenCalledWith('/curriculos');
  });
});
