export function diffAdaptationPlan(plan: unknown): { added: string[]; removed: string[] } | null {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    return null;
  }
  const record = plan as {
    baseEvidenceIds?: unknown;
    allocations?: unknown;
    addedEvidenceIds?: unknown;
    removedEvidenceIds?: unknown;
  };
  if (Array.isArray(record.baseEvidenceIds) && Array.isArray(record.allocations)) {
    const base = record.baseEvidenceIds.filter((id): id is string => typeof id === 'string');
    const allocated = collectAllocated(record.allocations);
    const baseSet = new Set(base);
    const allocatedSet = new Set(allocated);
    return {
      added: allocated.filter((id) => !baseSet.has(id)),
      removed: base.filter((id) => !allocatedSet.has(id)),
    };
  }
  if (Array.isArray(record.addedEvidenceIds) && Array.isArray(record.removedEvidenceIds)) {
    return {
      added: record.addedEvidenceIds.filter((id): id is string => typeof id === 'string'),
      removed: record.removedEvidenceIds.filter((id): id is string => typeof id === 'string'),
    };
  }
  return null;
}

function collectAllocated(allocations: unknown): string[] {
  if (!Array.isArray(allocations)) {
    return [];
  }
  const ids: string[] = [];
  for (const item of allocations) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const evidenceIds = (item as { evidenceIds?: unknown }).evidenceIds;
    if (!Array.isArray(evidenceIds)) {
      continue;
    }
    for (const id of evidenceIds) {
      if (typeof id === 'string' && !ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}
