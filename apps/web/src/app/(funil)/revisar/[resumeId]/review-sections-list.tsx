'use client';

import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import { resolveSectionLabel } from 'resume-templates';

const SECTIONS_HEADING = 'Seções';
const EDITED_LABEL = 'editada';

interface ReviewSectionsListProps {
  readonly document: ResumeDocumentResponse;
  readonly onSectionSelect: (sectionId: string) => void;
}

export function ReviewSectionsList({
  document,
  onSectionSelect,
}: ReviewSectionsListProps): React.JSX.Element {
  const orderedSections = useMemo(
    () => [...document.sections].sort((left, right) => left.ordinal - right.ordinal),
    [document],
  );

  return (
    <section aria-label={SECTIONS_HEADING} className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold text-text">{SECTIONS_HEADING}</h2>
      <ul className="flex flex-col gap-0.5 rounded-[10px] border border-border bg-surface p-1 shadow">
        {orderedSections.map((section) => {
          const label = resolveSectionLabel(
            section.kind,
            section.title ?? undefined,
            document.language,
          );
          const edited = section.entries.some((entry) =>
            entry.bullets.some((bullet) => bullet.editedByPerson),
          );
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSectionSelect(section.id)}
                aria-label={`Editar seção ${label}`}
                className="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="flex-1 truncate text-[13px] text-text">{label}</span>
                {edited && <span className="shrink-0 text-xs text-text-3">{EDITED_LABEL}</span>}
                <Pencil aria-hidden="true" className="h-[13px] w-[13px] shrink-0 text-text-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
