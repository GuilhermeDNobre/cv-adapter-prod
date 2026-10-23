'use client';

import { useState } from 'react';
import type { ResumeDocumentResponse, ResumeSectionResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, createResumeSection, getResume } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';

const ADDED_ANNOUNCEMENT = 'Custom Section adicionada.';
const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

interface AddCustomSectionFormProps {
  readonly resumeId: string;
  readonly sections: readonly ResumeSectionResponse[];
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
}

export function AddCustomSectionForm({ resumeId, sections, onDocumentChange }: AddCustomSectionFormProps): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const inputId = `add-custom-section-${resumeId}`;

  function addSection(): void {
    const next = title.trim();
    if (next === '' || isBusy) return;
    const ordinal = sections.reduce((max, section) => Math.max(max, section.ordinal + 1), 0);
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        await createResumeSection(resumeId, { kind: 'custom', title: next, ordinal });
        const document = await getResume(resumeId);
        onDocumentChange(document);
        setTitle('');
        setNotice(ADDED_ANNOUNCEMENT);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <label htmlFor={inputId} className="font-medium text-text">
        Título da nova Custom Section
      </label>
      <input
        id={inputId}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="rounded-md border border-border-strong bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <div>
        <Button type="button" disabled={title.trim() === '' || isBusy} onClick={addSection}>
          Adicionar Custom Section
        </Button>
      </div>
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? 'Adicionando a Section.' : notice}</StatusRegion>
    </div>
  );
}
