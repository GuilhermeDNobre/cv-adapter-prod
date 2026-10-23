import { MAX_RESUME_NAME_LENGTH } from 'schema/contracts/resume';

const MAX_JOB_TITLE_LENGTH = 120;

export function deriveJobTitle(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== '') {
      return trimmed.slice(0, MAX_JOB_TITLE_LENGTH);
    }
  }
  return null;
}

export function buildTailoredName(input: {
  readonly baseName: string;
  readonly jobTitle: string | null;
}): string {
  if (input.jobTitle === null || input.jobTitle === '') {
    return input.baseName.slice(0, MAX_RESUME_NAME_LENGTH);
  }
  return `${input.baseName} — ${input.jobTitle}`.slice(0, MAX_RESUME_NAME_LENGTH);
}
