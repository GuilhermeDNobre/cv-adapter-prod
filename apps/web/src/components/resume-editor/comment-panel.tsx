'use client';

import { useState } from 'react';
import type { ResumeDocumentResponse, SectionCommentResponse } from 'schema/contracts/resume';
import {
  aiErrorCodeOf,
  createSectionComment,
  resolveSectionComment,
  rewriteSection,
  undoSectionRewrite,
} from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';

const REWRITING_ANNOUNCEMENT = 'Reescrevendo a Section com seu Comment.';
const REWRITE_STARTED_ANNOUNCEMENT = 'Reescrita começou. Aguarde a conclusão.';
const UNDONE_ANNOUNCEMENT = 'Última reescrita desfeita.';
const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

interface CommentPanelProps {
  readonly sectionId: string;
  readonly comments: readonly SectionCommentResponse[];
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
  readonly onRewriteSettled: () => void;
}

export function CommentPanel({
  sectionId,
  comments,
  onDocumentChange,
  onRewriteSettled,
}: CommentPanelProps): React.JSX.Element {
  const [commentText, setCommentText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const textAreaId = `comment-${sectionId}-text`;

  const openComments = comments.filter((comment) => comment.resolvedAt === null);

  function failureMessageOf(error: unknown): string {
    const code = aiErrorCodeOf(error);
    if (code !== null) return aiErrorMessageForCode(code);
    return UNREACHABLE_MESSAGE;
  }

  function runAction(action: () => Promise<ResumeDocumentResponse>, done: string): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const document = await action();
        onDocumentChange(document);
        setNotice(done);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
        onRewriteSettled();
      }
    })();
  }

  function saveComment(): void {
    const next = commentText.trim();
    if (next === '') return;
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const document = await createSectionComment(sectionId, { text: next });
        onDocumentChange(document);
        setCommentText('');
        setNotice('Comment salvo. Ele vale nas próximas reescritas desta Section.');
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <h4 className="font-semibold text-text">Comments desta Section</h4>
      {openComments.length === 0 ? (
        <p className="text-sm text-text-2">Nenhum Comment aberto.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {openComments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1 rounded bg-surface-2 p-2">
              <p className="text-text">{comment.text}</p>
              <div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    runAction(() => resolveSectionComment(comment.id), 'Comment resolvido.')
                  }
                  className="rounded-md border border-border-strong px-3 py-1 text-sm font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
                >
                  Marcar como resolvido
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor={textAreaId} className="font-medium text-text">
          Novo Comment
        </label>
        <textarea
          id={textAreaId}
          value={commentText}
          onChange={(event) => setCommentText(event.target.value)}
          rows={2}
          placeholder="Ex.: Mais curto, destaque liderança."
          className="rounded-md border border-border-strong bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        <div>
          <Button type="button" disabled={commentText.trim() === '' || isBusy} onClick={saveComment}>
            Salvar Comment
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="font-medium text-text">
          Reescrever substitui as edições manuais desta Section. Seções vizinhas não mudam.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={isBusy}
            onClick={() => runAction(() => rewriteSection(sectionId), REWRITE_STARTED_ANNOUNCEMENT)}
          >
            Reescrever Section
          </Button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => runAction(() => undoSectionRewrite(sectionId), UNDONE_ANNOUNCEMENT)}
            className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
          >
            Desfazer última reescrita
          </button>
        </div>
      </div>
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? REWRITING_ANNOUNCEMENT : notice}</StatusRegion>
    </div>
  );
}
