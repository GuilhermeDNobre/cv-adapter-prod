export type ResumeStructureKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certifications'
  | 'custom';

export interface ResumeStructureExperience {
  readonly startedOn: string;
  readonly endedOn: string | null;
}

export interface ResumeStructureEducation {
  readonly endedOn: string | null;
}

export interface ResumeStructureInput {
  readonly sectionOrder?: readonly string[] | undefined;
  readonly hasSummary: boolean;
  readonly hasExperience: boolean;
  readonly hasEducation: boolean;
  readonly hasSkills: boolean;
  readonly hasLanguages: boolean;
  readonly hasCertifications: boolean;
  readonly hasCustom: boolean;
  readonly experienceRows: readonly ResumeStructureExperience[];
  readonly educationRows: readonly ResumeStructureEducation[];
}

const VALID_KINDS: readonly ResumeStructureKind[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
  'certifications',
  'custom',
];

const TWELVE_MONTHS = 12;

export function resolveResumeStructure(input: ResumeStructureInput): ResumeStructureKind[] {
  if (input.sectionOrder !== undefined && input.sectionOrder.length > 0) {
    return resolveFromOriginal(input);
  }
  return resolveFromTemplate(input);
}

function resolveFromOriginal(input: ResumeStructureInput): ResumeStructureKind[] {
  const ordered: ResumeStructureKind[] = [];
  for (const kind of input.sectionOrder ?? []) {
    if (!isValidKind(kind)) {
      continue;
    }
    if (ordered.includes(kind)) {
      continue;
    }
    if (!isPresent(kind, input)) {
      continue;
    }
    ordered.push(kind);
  }
  for (const kind of VALID_KINDS) {
    if (ordered.includes(kind)) {
      continue;
    }
    if (!isPresent(kind, input)) {
      continue;
    }
    ordered.push(kind);
  }
  return ordered;
}

function resolveFromTemplate(input: ResumeStructureInput): ResumeStructureKind[] {
  const ordered: ResumeStructureKind[] = [];
  if (input.hasSummary) {
    ordered.push('summary');
  }
  if (input.hasExperience) {
    ordered.push('experience');
  }
  if (input.hasSkills) {
    ordered.push('skills');
  }
  if (input.hasEducation) {
    ordered.push('education');
  }
  if (input.hasCertifications) {
    ordered.push('certifications');
  }
  if (input.hasCustom) {
    ordered.push('custom');
  }
  if (isStudentOrJunior(input)) {
    return moveEducationAfterSummary(ordered);
  }
  return ordered;
}

function isValidKind(value: string): value is ResumeStructureKind {
  return (VALID_KINDS as readonly string[]).includes(value);
}

function isPresent(kind: ResumeStructureKind, input: ResumeStructureInput): boolean {
  if (kind === 'summary') {
    return input.hasSummary;
  }
  if (kind === 'experience') {
    return input.hasExperience;
  }
  if (kind === 'education') {
    return input.hasEducation;
  }
  if (kind === 'skills') {
    return input.hasSkills;
  }
  if (kind === 'languages') {
    return input.hasLanguages;
  }
  if (kind === 'certifications') {
    return input.hasCertifications;
  }
  return input.hasCustom;
}

function moveEducationAfterSummary(ordered: ResumeStructureKind[]): ResumeStructureKind[] {
  if (!ordered.includes('education')) {
    return ordered;
  }
  const without = ordered.filter((kind) => kind !== 'education');
  const summaryIndex = without.indexOf('summary');
  const insertAt = summaryIndex === -1 ? 0 : summaryIndex + 1;
  return [...without.slice(0, insertAt), 'education', ...without.slice(insertAt)];
}

function isStudentOrJunior(input: ResumeStructureInput): boolean {
  for (const entry of input.educationRows) {
    if (entry.endedOn === null) {
      return true;
    }
    if (typeof entry.endedOn === 'string' && entry.endedOn.trim() === '') {
      return true;
    }
  }
  return sumExperienceMonths(input.experienceRows) < TWELVE_MONTHS;
}

function sumExperienceMonths(
  rows: readonly ResumeStructureExperience[],
  now: Date = new Date(),
): number {
  let total = 0;
  for (const row of rows) {
    const start = parsePartialDate(row.startedOn);
    if (start === undefined) {
      continue;
    }
    const end = row.endedOn === null ? dateToMonthIndex(now) : parsePartialDate(row.endedOn);
    if (end === undefined || end < start) {
      continue;
    }
    total += end - start + 1;
  }
  return total;
}

function dateToMonthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function parsePartialDate(value: string): number | undefined {
  const trimmed = value.trim();
  const yearMonthDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (yearMonthDay) {
    const year = Number(yearMonthDay[1]);
    const month = Number(yearMonthDay[2]);
    if (month < 1 || month > 12) {
      return undefined;
    }
    return year * 12 + (month - 1);
  }
  const yearMonth = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    if (month < 1 || month > 12) {
      return undefined;
    }
    return year * 12 + (month - 1);
  }
  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly) {
    return Number(yearOnly[1]) * 12;
  }
  return undefined;
}
