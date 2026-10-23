import type { ResumeDocumentResponse, ResumeSectionResponse } from 'schema/contracts/resume';
import { sectionHeadingOf } from './section-panel';

const COVERAGE_LABELS = {
  covered: 'Coberto',
  partial: 'Parcial',
  gap: 'Gap',
} as const;

const BULLET_SNIPPET_LENGTH = 80;

function truncateBulletText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= BULLET_SNIPPET_LENGTH) return trimmed;
  return `${trimmed.slice(0, BULLET_SNIPPET_LENGTH)}…`;
}

function findBulletSection(
  bulletId: string,
  sections: readonly ResumeSectionResponse[],
): { readonly section: ResumeSectionResponse; readonly text: string } | null {
  for (const section of sections) {
    for (const entry of section.entries) {
      for (const bullet of entry.bullets) {
        if (bullet.id === bulletId) return { section, text: bullet.text };
      }
    }
  }
  return null;
}

interface CoveragePanelProps {
  readonly matchScore: number | null;
  readonly coverages: ResumeDocumentResponse['requirementCoverages'];
  readonly sections: readonly ResumeSectionResponse[];
  readonly languageFallback: boolean;
  readonly onSectionSelect: (sectionId: string) => void;
}

export function CoveragePanel({
  matchScore,
  coverages,
  sections,
  languageFallback,
  onSectionSelect,
}: CoveragePanelProps): React.JSX.Element {
  return (
    <section aria-label="Cobertura dos Requirements" className="flex flex-col gap-3">
      <h3 className="text-xl font-semibold tracking-[-0.01em] text-text">Cobertura da vaga</h3>
      {matchScore !== null && (
        <p className="text-text">
          Match Score: <span className="text-2xl font-semibold tabular-nums">{String(matchScore)}</span> de 100.
        </p>
      )}
      {languageFallback && (
        <p className="font-medium text-text">
          A vaga não está em português nem inglês, então o currículo foi gerado em inglês.
        </p>
      )}
      {coverages.length === 0 ? (
        <p className="text-sm text-text-2">Nenhum Requirement para mostrar.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {coverages.map((coverage) => {
            const location =
              coverage.bulletId === null ||
              coverage.coverage === 'gap'
                ? null
                : findBulletSection(coverage.bulletId, sections);
            if (location === null) {
              return (
                <li
                  key={coverage.requirementId}
                  className="flex items-baseline justify-between gap-2 rounded-[10px] border border-border bg-surface p-2 shadow"
                >
                  <span className="font-medium text-text">{coverage.literalTerm}</span>
                  <span className="text-sm font-medium text-text-2">
                    {COVERAGE_LABELS[coverage.coverage]}
                  </span>
                </li>
              );
            }
            return (
              <li
                key={coverage.requirementId}
                className="rounded-[10px] border border-border bg-surface p-2 shadow"
              >
                <button
                  type="button"
                  onClick={() => onSectionSelect(location.section.id)}
                  aria-label={`Ver Bullet de ${coverage.literalTerm} na Section ${sectionHeadingOf(location.section)}`}
                  className="flex w-full flex-col gap-1 rounded-lg text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-text">{coverage.literalTerm}</span>
                    <span className="text-sm font-medium text-text-2">
                      {COVERAGE_LABELS[coverage.coverage]}
                    </span>
                  </span>
                  <span className="text-sm text-text-2">
                    {`“${truncateBulletText(location.text)}” na Section ${sectionHeadingOf(location.section)}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
