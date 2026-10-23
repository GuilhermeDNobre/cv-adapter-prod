'use client';

import { useId } from 'react';
import type { ResumeListItem } from 'schema/contracts/resume';
import {
  GENERATION_STATUS_LABELS,
  resumeSummaryOf,
} from '../../../components/resume-list/resume-list-item';

const RADIO_GROUP_NAME = 'resume-step-base-resume';

const OPTION_BASE_CLASSES =
  'flex cursor-pointer items-start gap-3 rounded-[10px] border p-4 transition-colors duration-press ease-out-motion';
const OPTION_CHECKED_CLASSES = 'border-accent bg-accent-soft';
const OPTION_UNCHECKED_CLASSES = 'border-border bg-surface hover:border-border-hover hover:bg-surface-2';

interface SavedResumeOptionProps {
  readonly resume: ResumeListItem;
  readonly checked: boolean;
  readonly onSelect: (baseResumeId: string) => void;
}

function SavedResumeOption({ resume, checked, onSelect }: SavedResumeOptionProps): React.JSX.Element {
  const nameId = useId();
  const summaryId = useId();
  const statusSuffix =
    resume.generationStatus === 'ready' ? '' : ` · ${GENERATION_STATUS_LABELS[resume.generationStatus]}`;
  return (
    <li>
      <label
        className={`${OPTION_BASE_CLASSES} ${checked ? OPTION_CHECKED_CLASSES : OPTION_UNCHECKED_CLASSES}`}
      >
        <input
          type="radio"
          name={RADIO_GROUP_NAME}
          value={resume.id}
          checked={checked}
          onChange={() => onSelect(resume.id)}
          aria-labelledby={nameId}
          aria-describedby={summaryId}
          className="mt-[3px] h-4 w-4 shrink-0 accent-accent"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id={nameId} className="font-semibold text-text">
            {resume.name}
          </span>
          <span id={summaryId} className="text-[13px] tabular-nums text-text-2">
            {`${resumeSummaryOf(resume)}${statusSuffix}`}
          </span>
        </span>
      </label>
    </li>
  );
}

interface SavedResumeListProps {
  readonly baseResumes: readonly ResumeListItem[];
  readonly selectedBaseResumeId: string | undefined;
  readonly onSelect: (baseResumeId: string) => void;
}

export function SavedResumeList({
  baseResumes,
  selectedBaseResumeId,
  onSelect,
}: SavedResumeListProps): React.JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] font-semibold text-text">Base Resume de partida</legend>
      <ul className="flex flex-col gap-2">
        {baseResumes.map((resume) => (
          <SavedResumeOption
            key={resume.id}
            resume={resume}
            checked={resume.id === selectedBaseResumeId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </fieldset>
  );
}
