'use client';

import { Popover } from 'radix-ui';
import type {
  ResumeDocumentResponse,
  ResumeSectionResponse,
} from 'schema/contracts/resume';
import { buttonClasses } from '../button';
import { CoveragePanel } from '../resume-editor/coverage-panel';
import { RemovedChangesPopover, type RemovedEvidenceItem } from './removed-changes-popover';

export interface ReviewBarCoverage {
  readonly matchScore: number | null;
  readonly coverages: ResumeDocumentResponse['requirementCoverages'];
  readonly sections: readonly ResumeSectionResponse[];
  readonly languageFallback: boolean;
}

export interface ReviewChangeItem {
  readonly bulletId: string;
  readonly label: string;
  readonly status: string;
  readonly title?: string;
}

interface ReviewBarProps {
  readonly total: number;
  readonly currentIndex: number | null;
  readonly removed: readonly RemovedEvidenceItem[];
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onRestore: (evidenceId: string) => void;
  readonly coverage?: ReviewBarCoverage;
  readonly onCoverageSectionSelect?: (sectionId: string) => void;
  readonly items?: readonly ReviewChangeItem[];
  readonly onItemSelect?: (bulletId: string) => void;
}

const EMPTY_MESSAGE = 'O Tailored Resume é igual ao Base Resume em conteúdo.';
const CHANGES_HEADING = 'Mudanças da IA';

function CoveragePopover({
  coverage,
  onCoverageSectionSelect,
}: {
  readonly coverage: ReviewBarCoverage;
  readonly onCoverageSectionSelect: (sectionId: string) => void;
}): React.JSX.Element {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="rounded-md border border-border-strong bg-surface px-3 py-1 font-semibold text-text shadow transition-[background-color,transform] duration-press ease-out-motion hover:bg-surface-2 motion-safe:active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Cobertura
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          aria-label="Cobertura da vaga"
          className="z-50 max-h-[70vh] w-96 max-w-[90vw] overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-lg [transform-origin:var(--radix-popover-content-transform-origin)] data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out motion-reduce:data-[state=open]:animate-popover-fade-in motion-reduce:data-[state=closed]:animate-popover-fade-out"
        >
          <CoveragePanel
            matchScore={coverage.matchScore}
            coverages={coverage.coverages}
            sections={coverage.sections}
            languageFallback={coverage.languageFallback}
            onSectionSelect={onCoverageSectionSelect}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ReviewBar({
  total,
  currentIndex,
  removed,
  onPrevious,
  onNext,
  onRestore,
  coverage,
  onCoverageSectionSelect,
  items = [],
  onItemSelect,
}: ReviewBarProps): React.JSX.Element {
  if (total === 0 && removed.length === 0) {
    return (
      <section
        aria-label="Barra de revisão"
        className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-3 shadow"
      >
        <h2 className="text-[13px] font-semibold text-text">{CHANGES_HEADING}</h2>
        <p className="text-sm text-text-2">{EMPTY_MESSAGE}</p>
        {coverage !== undefined && (
          <div>
            <CoveragePopover
              coverage={coverage}
              onCoverageSectionSelect={onCoverageSectionSelect ?? (() => undefined)}
            />
          </div>
        )}
      </section>
    );
  }
  const currentLabel = currentIndex === null ? 0 : currentIndex + 1;
  const atStart = currentIndex === null || currentIndex <= 0;
  const atEnd = currentIndex === null || currentIndex >= total - 1;
  return (
    <section
      aria-label="Barra de revisão"
      className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-1 shadow"
    >
      <div className="flex flex-col gap-1 px-2 pt-2">
        <h2 className="text-[13px] font-semibold text-text">{CHANGES_HEADING}</h2>
        {total > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-text-3">
              {`${String(currentLabel)} de ${String(total)}`}
            </span>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={onPrevious}
                disabled={atStart}
                aria-label="Alteração anterior"
                className={buttonClasses('ghost', 'xs')}
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={atEnd}
                aria-label="Próxima alteração"
                className={buttonClasses('ghost', 'xs')}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.bulletId}>
              <button
                type="button"
                onClick={() => onItemSelect?.(item.bulletId)}
                title={item.title}
                className="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span aria-hidden="true" className="h-[7px] w-[7px] flex-none rounded-full bg-accent" />
                <span className="flex-1 truncate text-[13px] text-text">{item.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-text-3">{item.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 px-2 pb-2">
        {total > 0 && (
          <p className="text-sm font-medium tabular-nums text-text">
            {`${String(currentLabel)} de ${String(total)} alterações`}
          </p>
        )}
        <RemovedChangesPopover removed={removed} onRestore={onRestore} />
        {coverage !== undefined && (
          <CoveragePopover
            coverage={coverage}
            onCoverageSectionSelect={onCoverageSectionSelect ?? (() => undefined)}
          />
        )}
      </div>
    </section>
  );
}
