'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { WIZARD_STEP_LABELS, useWizardState, type WizardRouteIds } from './use-wizard-state';
import { stepOfPath } from './wizard-route';
import { EASE_OUT, STEP_ENTER_MS } from '../../lib/motion';

const CHECK_DRAW_MS = 240;
const CHECK_DRAW_DELAY_MS = 60;

function idsOfPath(
  search: URLSearchParams,
  evaluationIdFromPath: string | null,
  resumeIdFromPath: string | null,
): WizardRouteIds {
  const jobDescriptionId = search.get('vaga') ?? undefined;
  const avaliacaoQuery = search.get('avaliacao') ?? undefined;
  const evaluationId = evaluationIdFromPath ?? avaliacaoQuery;
  const baseResumeId = search.get('base') ?? undefined;
  const resumeId = resumeIdFromPath ?? undefined;
  const resumeImportId = search.get('resumeImportId') ?? undefined;
  return { jobDescriptionId, evaluationId, baseResumeId, resumeId, resumeImportId };
}

function segmentOf(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).split('/')[0];
  if (rest === undefined || rest === '') return null;
  return rest;
}

export function WizardStepper(): React.JSX.Element {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = stepOfPath(pathname);
  const evaluationIdFromPath = segmentOf(pathname, '/avaliacao/');
  const resumeIdFromPath =
    segmentOf(pathname, '/revisar/') ?? segmentOf(pathname, '/exportar/');
  const search = new URLSearchParams(searchParams.toString());
  const ids = idsOfPath(search, evaluationIdFromPath, resumeIdFromPath);
  const { steps } = useWizardState(current, ids);

  return (
    <nav aria-label="Etapas" className="w-full">
      <ol className="m-0 flex list-none items-center gap-2 p-0">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={
              index < steps.length - 1
                ? 'flex min-w-0 flex-1 items-center gap-2'
                : 'flex min-w-0 items-center gap-2'
            }
          >
            {step.status === 'done' && step.href !== null ? (
              <Link
                href={step.href}
                className="flex min-w-0 items-center gap-2 rounded-lg p-1 transition-colors duration-press ease-out-motion hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <motion.span
                  aria-hidden="true"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: STEP_ENTER_MS / 1000, ease: EASE_OUT }}
                  className="grid h-6 w-6 flex-none place-items-center rounded-full bg-accent-soft text-accent-text"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <motion.path
                      d="M3.5 8.5l3 3 6-7"
                      style={{ strokeDasharray: 14 }}
                      initial={{ strokeDashoffset: 14 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{
                        duration: CHECK_DRAW_MS / 1000,
                        delay: CHECK_DRAW_DELAY_MS / 1000,
                        ease: 'easeOut',
                      }}
                    />
                  </svg>
                </motion.span>
                <span className="truncate text-[13px] font-medium text-text-2">
                  {WIZARD_STEP_LABELS[step.id]}
                </span>
                <span className="sr-only"> (concluída)</span>
              </Link>
            ) : step.status === 'current' ? (
              <span
                aria-current="step"
                className="flex min-w-0 items-center gap-2 rounded-lg p-1"
              >
                <span
                  aria-hidden="true"
                  className="grid h-6 w-6 flex-none place-items-center rounded-full bg-accent text-xs font-semibold tabular-nums text-accent-fg shadow-[0_0_0_4px_var(--accent-soft)]"
                >
                  {index + 1}
                </span>
                <span className="truncate text-[13px] font-semibold text-text">
                  {WIZARD_STEP_LABELS[step.id]}
                </span>
                <span className="sr-only"> (atual)</span>
              </span>
            ) : (
              <span
                aria-disabled="true"
                className="flex min-w-0 items-center gap-2 rounded-lg p-1"
              >
                <span
                  aria-hidden="true"
                  className="grid h-6 w-6 flex-none place-items-center rounded-full border border-border-strong text-xs font-medium tabular-nums text-text-3"
                >
                  {index + 1}
                </span>
                <span className="truncate text-[13px] font-medium text-text-3">
                  {WIZARD_STEP_LABELS[step.id]}
                </span>
                <span className="sr-only"> (pendente)</span>
              </span>
            )}
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`h-px min-w-2 flex-1 transition-colors duration-[250ms] ease-out-motion ${
                  step.done ? 'bg-accent' : 'bg-border-strong'
                }`}
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
