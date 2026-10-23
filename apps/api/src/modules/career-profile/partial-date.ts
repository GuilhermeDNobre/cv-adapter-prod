export function normalizePartialDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const yearMonth = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trimmed);
  if (yearMonth !== null) {
    return trimmed;
  }
  const fullDate = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed);
  if (fullDate !== null) {
    const year = Number(fullDate[1]);
    const month = Number(fullDate[2]);
    const day = Number(fullDate[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return trimmed;
    }
    return null;
  }
  const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (monthYear !== null) {
    const month = Number(monthYear[1]);
    const year = monthYear[2];
    if (month < 1 || month > 12) {
      return null;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  return null;
}
