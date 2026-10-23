import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { approveSuggestion, denySuggestion, updateBullet } from '../../lib/api-client';
import { resumeDocumentFixture, suggestionBulletFixture } from './editor-fixtures';
import { SuggestionCard } from './suggestion-card';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    approveSuggestion: vi.fn(),
    denySuggestion: vi.fn(),
    updateBullet: vi.fn(),
  };
});

const mockedApprove = vi.mocked(approveSuggestion);
const mockedDeny = vi.mocked(denySuggestion);
const mockedUpdate = vi.mocked(updateBullet);
const onDocumentChange = vi.fn();

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('SuggestionCard', () => {
  afterEach(() => {
    mockedApprove.mockReset();
    mockedDeny.mockReset();
    mockedUpdate.mockReset();
    onDocumentChange.mockReset();
  });

  it('should label the draft as unconfirmed by text and say it stays out of the PDF', () => {
    render(<SuggestionCard bullet={suggestionBulletFixture()} onDocumentChange={onDocumentChange} />);

    expect(screen.getByText('Rascunho não confirmado')).toBeInTheDocument();
    expect(screen.getByText(/não vai para o PDF/)).toBeInTheDocument();
    expect(screen.getByText('Have you operated Kubernetes in production?')).toBeInTheDocument();
  });

  it('should approve the suggestion and announce the decision', async () => {
    const nextDocument = resumeDocumentFixture();
    mockedApprove.mockResolvedValue(nextDocument);
    render(<SuggestionCard bullet={suggestionBulletFixture()} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    await flushPromises();

    expect(mockedApprove).toHaveBeenCalledWith(suggestionBulletFixture().id);
    expect(onDocumentChange).toHaveBeenCalledWith(nextDocument);
    expect(screen.getByRole('status')).toHaveTextContent('Decisão sobre o rascunho registrada.');
  });

  it('should deny the suggestion through the deny verb when the person does not have it', async () => {
    mockedDeny.mockResolvedValue(resumeDocumentFixture());
    render(<SuggestionCard bullet={suggestionBulletFixture()} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Não tenho isso' }));
    await flushPromises();

    expect(mockedDeny).toHaveBeenCalledWith(suggestionBulletFixture().id);
    expect(onDocumentChange).toHaveBeenCalled();
  });

  it('should save an edited draft as the person taking ownership of the text', async () => {
    const afterApprove = resumeDocumentFixture();
    mockedUpdate.mockResolvedValue(resumeDocumentFixture());
    mockedApprove.mockResolvedValue(afterApprove);
    render(<SuggestionCard bullet={suggestionBulletFixture()} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Assuma o texto com suas palavras'), {
      target: { value: 'Operated EKS clusters for two years.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar edição' }));
    await flushPromises();

    expect(mockedUpdate).toHaveBeenCalledWith(suggestionBulletFixture().id, {
      text: 'Operated EKS clusters for two years.',
    });
    expect(mockedApprove).toHaveBeenCalledWith(suggestionBulletFixture().id);
    expect(mockedUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockedApprove.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(onDocumentChange).toHaveBeenCalledWith(afterApprove);
  });

  it('should not approve when saving the edit fails', async () => {
    mockedUpdate.mockRejectedValue(new Error('network down'));
    render(<SuggestionCard bullet={suggestionBulletFixture()} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Assuma o texto com suas palavras'), {
      target: { value: 'Operated EKS clusters for two years.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar edição' }));
    await flushPromises();

    expect(mockedUpdate).toHaveBeenCalled();
    expect(mockedApprove).not.toHaveBeenCalled();
    expect(onDocumentChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível registrar agora.');
  });

  it('should explain an existence gap as adjacent experience', () => {
    render(<SuggestionCard bullet={suggestionBulletFixture()} onDocumentChange={onDocumentChange} />);

    expect(
      screen.getByText(/A IA escreveu este rascunho a partir de experiência adjacente/),
    ).toBeInTheDocument();
  });

  it('should explain a detail gap as an unproven claim from the evidence', () => {
    const detailBullet = { ...suggestionBulletFixture(), gapKind: 'detail' as const };
    render(<SuggestionCard bullet={detailBullet} onDocumentChange={onDocumentChange} />);

    expect(
      screen.getByText(/A IA escreveu isto a partir da sua Evidence/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/A IA escreveu este rascunho a partir de experiência adjacente/),
    ).not.toBeInTheDocument();
  });

  it('should show an alert when the decision fails', async () => {
    mockedApprove.mockRejectedValue(new Error('network down'));
    render(<SuggestionCard bullet={suggestionBulletFixture()} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível registrar agora.');
    expect(onDocumentChange).not.toHaveBeenCalled();
  });
});
