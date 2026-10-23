import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  createSectionComment,
  resolveSectionComment,
  rewriteSection,
  undoSectionRewrite,
} from '../../lib/api-client';
import { CommentPanel } from './comment-panel';
import { openCommentFixture, resumeDocumentFixture, SECTION_EXPERIENCE_ID } from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    createSectionComment: vi.fn(),
    resolveSectionComment: vi.fn(),
    rewriteSection: vi.fn(),
    undoSectionRewrite: vi.fn(),
  };
});

const mockedCreate = vi.mocked(createSectionComment);
const mockedResolve = vi.mocked(resolveSectionComment);
const mockedRewrite = vi.mocked(rewriteSection);
const mockedUndo = vi.mocked(undoSectionRewrite);
const onDocumentChange = vi.fn();
const onRewriteSettled = vi.fn();

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

function renderPanel(): void {
  render(
    <CommentPanel
      sectionId={SECTION_EXPERIENCE_ID}
      comments={[openCommentFixture()]}
      onDocumentChange={onDocumentChange}
      onRewriteSettled={onRewriteSettled}
    />,
  );
}

describe('CommentPanel', () => {
  afterEach(() => {
    mockedCreate.mockReset();
    mockedResolve.mockReset();
    mockedRewrite.mockReset();
    mockedUndo.mockReset();
    onDocumentChange.mockReset();
    onRewriteSettled.mockReset();
  });

  it('should warn before rewriting that manual edits of the section are replaced', () => {
    renderPanel();

    expect(screen.getByText(/substitui as edições manuais desta Section/)).toBeInTheDocument();
    expect(screen.getByText(/Seções vizinhas não mudam/)).toBeInTheDocument();
  });

  it('should save a comment and keep it for the next rewrites', async () => {
    mockedCreate.mockResolvedValue(resumeDocumentFixture());
    renderPanel();

    fireEvent.change(screen.getByLabelText('Novo Comment'), {
      target: { value: 'Highlight leadership.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Comment' }));
    await flushPromises();

    expect(mockedCreate).toHaveBeenCalledWith(SECTION_EXPERIENCE_ID, {
      text: 'Highlight leadership.',
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Comment salvo. Ele vale nas próximas reescritas desta Section.',
    );
  });

  it('should rewrite the section with progress announced and focus settled after', async () => {
    let resolveRewrite: (value: ReturnType<typeof resumeDocumentFixture>) => void = () => undefined;
    mockedRewrite.mockReturnValue(
      new Promise((resolve) => {
        resolveRewrite = resolve;
      }),
    );
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reescrever Section' }));

    expect(screen.getByRole('status')).toHaveTextContent('Reescrevendo a Section');

    resolveRewrite(resumeDocumentFixture());
    await flushPromises();

    expect(mockedRewrite).toHaveBeenCalledWith(SECTION_EXPERIENCE_ID);
    expect(onDocumentChange).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Reescrita começou.');
    expect(onRewriteSettled).toHaveBeenCalled();
  });

  it('should undo the last rewrite', async () => {
    mockedUndo.mockResolvedValue(resumeDocumentFixture());
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer última reescrita' }));
    await flushPromises();

    expect(mockedUndo).toHaveBeenCalledWith(SECTION_EXPERIENCE_ID);
    expect(screen.getByRole('status')).toHaveTextContent('Última reescrita desfeita.');
  });

  it('should resolve an open comment', async () => {
    mockedResolve.mockResolvedValue(resumeDocumentFixture());
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como resolvido' }));
    await flushPromises();

    expect(mockedResolve).toHaveBeenCalledWith(openCommentFixture().id);
    expect(screen.getByRole('status')).toHaveTextContent('Comment resolvido.');
  });
});
