const FIVE_YEARS = 5;
const MONTHS_PER_YEAR = 12;

export interface LengthTargetInput {
  readonly explicit: number | undefined;
  readonly experienceRows: ReadonlyArray<{
    readonly id: string;
    readonly startedOn: string;
    readonly endedOn: string | null;
  }>;
  readonly selections: ReadonlyArray<{ readonly experienceIds?: string[] }> | undefined;
}

export function resolveLengthTarget(input: LengthTargetInput): 1 | 2 {
  if (input.explicit === 1 || input.explicit === 2) {
    return input.explicit;
  }
  const selectedIds = new Set<string>();
  for (const selection of input.selections ?? []) {
    for (const id of selection.experienceIds ?? []) {
      selectedIds.add(id);
    }
  }
  const relevant =
    selectedIds.size === 0
      ? input.experienceRows
      : input.experienceRows.filter((row) => selectedIds.has(row.id));
  const totalMonths = relevant.reduce(
    (sum, row) => sum + monthsBetween(row.startedOn, row.endedOn),
    0,
  );
  return totalMonths / MONTHS_PER_YEAR > FIVE_YEARS ? 2 : 1;
}

function monthsBetween(startedOn: string, endedOn: string | null): number {
  const start = parsePartialDate(startedOn, false);
  if (start === undefined) {
    return 0;
  }
  const end = endedOn === null ? currentYearMonth() : parsePartialDate(endedOn, true);
  if (end === undefined) {
    return 0;
  }
  const diff = (end.year - start.year) * MONTHS_PER_YEAR + (end.month - start.month);
  return diff > 0 ? diff : 0;
}

function parsePartialDate(value: string, isEnd: boolean): { year: number; month: number } | undefined {
  const trimmed = value.trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (full !== null) {
    return { year: Number(full[1]), month: Number(full[2]) };
  }
  const yearMonth = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (yearMonth !== null) {
    return { year: Number(yearMonth[1]), month: Number(yearMonth[2]) };
  }
  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly !== null) {
    return { year: Number(yearOnly[1]), month: isEnd ? MONTHS_PER_YEAR : 1 };
  }
  return undefined;
}

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}
