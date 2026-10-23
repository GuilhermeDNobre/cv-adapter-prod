'use client';

import { useEffect, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { resolveSectionLabel, type ResumeLanguage } from 'resume-templates';
import type { ResumeDocumentResponse, ResumeSectionResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, requestSectionRewrite, undoSectionRewrite } from '../../lib/api-client';
import { NOTHING_TO_REWRITE_MESSAGE, REWRITE_CLAIMS_REJECTED_MESSAGE, aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { StatusRegion } from '../status-region';
import { BulletList } from './bullet-list';
import { CustomSectionItems } from './custom-section-items';
import { AddRefinedItemForm } from './add-refined-item-form';
import { SectionStructureControls } from './section-structure-controls';

const SECTION_LABELS: Readonly<Record<ResumeSectionResponse['kind'], string>> = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  languages: 'Languages',
  certifications: 'Certifications',
  custom: 'Custom Section',
};

const INSTRUCTION_PLACEHOLDER = 'Ex.: deixe explícito o uso de Git e Docker na experiência mais recente';
const REWRITING_ANNOUNCEMENT = 'Reescrevendo…';
const REWRITTEN_ANNOUNCEMENT = 'Reescrita concluída.';
const UNDONE_ANNOUNCEMENT = 'Última reescrita desfeita.';
const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

export function sectionHeadingOf(section: ResumeSectionResponse): string {
  if (section.kind === 'custom' && section.title !== null) return section.title;
  return SECTION_LABELS[section.kind];
}

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

interface SectionPanelProps {
  readonly section: ResumeSectionResponse;
  readonly sections: readonly ResumeSectionResponse[];
  readonly resumeId: string;
  readonly language: ResumeLanguage;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
  readonly onSectionRemoved: () => void;
  readonly failureReason?: string | null;
}

export function SectionPanel({ section, sections, resumeId, language, onDocumentChange, onSectionRemoved, failureReason = null }: SectionPanelProps): React.JSX.Element {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const heading = resolveSectionLabel(section.kind, section.title ?? undefined, language);
  const [instruction, setInstruction] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [hasRewritten, setHasRewritten] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const textAreaId = `ai-instruction-${section.id}`;
  useEffect(() => {
    headingRef.current?.focus();
  }, [section.id]);
  function focusHeading(): void {
    headingRef.current?.focus();
  }
  function applyInstruction(): void {
    const next = instruction.trim();
    if (next === '' || isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const document = await requestSectionRewrite(section.id, next);
        onDocumentChange(document);
        setHasRewritten(true);
        setNotice(REWRITTEN_ANNOUNCEMENT);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
        focusHeading();
      }
    })();
  }
  function undoRewrite(): void {
    if (isBusy) return;
    setIsBusy(true);
    setFailure(null);
    setNotice('');
    void (async () => {
      try {
        const document = await undoSectionRewrite(section.id);
        onDocumentChange(document);
        setNotice(UNDONE_ANNOUNCEMENT);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
        focusHeading();
      }
    })();
  }
  return (
    <section aria-label={`Painel da Section ${heading}`} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {heading}
        </h3>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button type="button" aria-label="Opções da seção" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-2 transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              <span aria-hidden="true" className="text-base leading-none">⋯</span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="bottom" align="end" sideOffset={4} aria-label="Opções da seção" className="z-50 w-[320px] rounded-xl border border-border bg-surface p-2 shadow-lg [transform-origin:var(--radix-popover-content-transform-origin)] data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out motion-reduce:data-[state=open]:animate-popover-fade-in-150 motion-reduce:data-[state=closed]:animate-popover-fade-out-150">
              <SectionStructureControls section={section} sections={sections} resumeId={resumeId} onDocumentChange={onDocumentChange} onSectionRemoved={onSectionRemoved} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <label htmlFor={textAreaId} className="font-medium text-text">O que mudar nesta seção?</label>
        <textarea id={textAreaId} value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3} placeholder={INSTRUCTION_PLACEHOLDER} className="rounded-md border border-border-strong bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={instruction.trim() === '' || isBusy} onClick={applyInstruction}>Aplicar</Button>
          {hasRewritten && (
            <button type="button" disabled={isBusy} onClick={undoRewrite} className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3">Desfazer</button>
          )}
        </div>
        {failureReason === 'nothing_to_rewrite' ? <ErrorMessage message={NOTHING_TO_REWRITE_MESSAGE} /> : failureReason === 'rewrite_claims_rejected' ? <ErrorMessage message={REWRITE_CLAIMS_REJECTED_MESSAGE} /> : failure !== null && <ErrorMessage message={failure} />}
        <StatusRegion>{isBusy ? REWRITING_ANNOUNCEMENT : failureReason === 'nothing_to_rewrite' || failureReason === 'rewrite_claims_rejected' ? '' : notice}</StatusRegion>
      </div>
      {section.kind === 'custom' ? (
        <CustomSectionItems section={section} onDocumentChange={onDocumentChange} onEmptyFocus={focusHeading} />
      ) : (
        <>
          {section.entries.length === 0 && (
            <p className="text-text-2">Esta Section ainda não tem conteúdo.</p>
          )}
          {section.entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-2">
              {entry.heading !== null && (
                <p className="font-semibold text-text">{entry.heading}</p>
              )}
              <BulletList entry={entry} experienceId={entry.experienceId} resumeId={resumeId} onDocumentChange={onDocumentChange} onEmptyFocus={focusHeading} />
            </div>
          ))}
        </>
      )}
      {showAddForm ? (
        <AddRefinedItemForm section={section} onDocumentChange={onDocumentChange} />
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setShowAddForm(true)}>Adicionar item</Button>
        </div>
      )}
    </section>
  );
}
