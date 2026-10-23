const COMBINING_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const WHITESPACE_PATTERN = /\s+/g;

export interface OrderableSkill {
  readonly group: string | null;
  readonly ordinal?: number;
  readonly createdAt: Date;
}

export function normalizeGroupKey(group: string | null): string | null {
  if (group === null) {
    return null;
  }
  const trimmed = group.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ');
}

export function orderSkills<T extends OrderableSkill>(skills: readonly T[]): T[] {
  const byOrdinal = [...skills].sort((left, right) => {
    const leftOrdinal = left.ordinal ?? 0;
    const rightOrdinal = right.ordinal ?? 0;
    if (leftOrdinal !== rightOrdinal) {
      return leftOrdinal - rightOrdinal;
    }
    return left.createdAt.getTime() - right.createdAt.getTime();
  });
  const groupRank = new Map<string, number>();
  let nextRank = 0;
  for (const skill of byOrdinal) {
    const key = normalizeGroupKey(skill.group);
    if (key === null) {
      continue;
    }
    if (!groupRank.has(key)) {
      groupRank.set(key, nextRank);
      nextRank += 1;
    }
  }
  const nullRank = Number.MAX_SAFE_INTEGER;
  return [...byOrdinal].sort((left, right) => {
    const leftKey = normalizeGroupKey(left.group);
    const rightKey = normalizeGroupKey(right.group);
    const leftRank = leftKey === null ? nullRank : (groupRank.get(leftKey) ?? nullRank);
    const rightRank = rightKey === null ? nullRank : (groupRank.get(rightKey) ?? nullRank);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    const leftOrdinal = left.ordinal ?? 0;
    const rightOrdinal = right.ordinal ?? 0;
    if (leftOrdinal !== rightOrdinal) {
      return leftOrdinal - rightOrdinal;
    }
    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}
