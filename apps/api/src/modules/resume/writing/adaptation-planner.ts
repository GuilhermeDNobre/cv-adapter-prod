import { CHARS_PER_PAGE } from 'resume-templates';
import type {
  PlanAdaptationInput,
  PlanEvidenceInput,
  PlanRequirementInput,
} from '../../ai/prompts/plan-adaptation';
import type { PlanAdaptationOutput } from '../../ai/prompts/plan-adaptation';

export interface PlannerSection {
  readonly kind: 'summary' | 'experience' | 'education' | 'skills' | 'custom';
}

export type PlannerRequirement = PlanRequirementInput;

export interface PlannerEvidence extends PlanEvidenceInput {
  readonly statementLength: number;
}

export interface BuildPlanInput {
  readonly requirements: readonly PlannerRequirement[];
  readonly evidences: readonly PlannerEvidence[];
  readonly baseEvidenceIds: readonly string[];
  readonly sections: readonly PlannerSection[];
  readonly template: 'comfortable' | 'dense';
  readonly lengthTarget: 1 | 2;
  readonly language: 'pt' | 'en';
}

export interface ValidatePlanInput {
  readonly raw: PlanAdaptationOutput;
  readonly requirementIds: readonly string[];
  readonly knownEvidenceIds: ReadonlySet<string>;
  readonly evidenceLengths: ReadonlyMap<string, number>;
  readonly sectionBudgets: ReadonlyMap<string, number>;
}

export interface ValidatedPlan {
  readonly allocations: PlanAdaptationOutput['allocations'];
  readonly coverages: PlanAdaptationOutput['coverages'];
}

export interface EnsureExperienceInput {
  readonly allocations: ReadonlyArray<{ readonly sectionKind: 'summary' | 'experience' | 'education' | 'skills' | 'custom'; readonly evidenceIds: ReadonlyArray<string> }>;
  readonly coverages: ReadonlyArray<{ readonly requirementId: string; readonly coverage: 'covered' | 'partial' | 'gap'; readonly evidenceId: string | null; readonly gapKind: 'existence' | 'detail' | null }>;
  readonly evidenceExperience: ReadonlyMap<string, string | null>;
  readonly requiredExperienceIds: readonly string[];
  readonly preferredEvidenceByExperience: ReadonlyMap<string, string>;
  readonly fallbackEvidenceByExperience: ReadonlyMap<string, string>;
  readonly evidenceIdsByExperience: ReadonlyMap<string, readonly string[]>;
  readonly evidenceLengths: ReadonlyMap<string, number>;
  readonly totalBudget: number;
}

export function ensureEveryExperienceAllocated(input: EnsureExperienceInput): ValidatedPlan {
  const allocations = input.allocations.map((allocation) => ({ sectionKind: allocation.sectionKind, evidenceIds: [...allocation.evidenceIds] }));
  const allocated = new Set<string>();
  for (const allocation of allocations) {
    for (const id of allocation.evidenceIds) {
      allocated.add(id);
    }
  }
  const covered = collectCoveredExperiences(allocations, input.evidenceExperience);
  const missing = input.requiredExperienceIds.filter((id) => !covered.has(id));
  for (const experienceId of missing) {
    const candidate = selectUnallocatedEvidence({ experienceId, preferredEvidenceByExperience: input.preferredEvidenceByExperience, fallbackEvidenceByExperience: input.fallbackEvidenceByExperience, evidenceIdsByExperience: input.evidenceIdsByExperience, allocated });
    if (candidate === undefined) {
      continue;
    }
    appendExperienceEvidence(allocations, candidate);
    allocated.add(candidate);
    covered.add(experienceId);
  }
  trimExperienceToBudget({ allocations, evidenceExperience: input.evidenceExperience, evidenceLengths: input.evidenceLengths, totalBudget: input.totalBudget, allocated });
  return { allocations, coverages: [...input.coverages] };
}

function collectCoveredExperiences(allocations: ReadonlyArray<{ readonly sectionKind: string; readonly evidenceIds: ReadonlyArray<string> }>, evidenceExperience: ReadonlyMap<string, string | null>): Set<string> {
  const covered = new Set<string>();
  for (const allocation of allocations) {
    if (allocation.sectionKind !== 'experience') {
      continue;
    }
    for (const id of allocation.evidenceIds) {
      const experienceId = evidenceExperience.get(id) ?? null;
      if (experienceId !== null) {
        covered.add(experienceId);
      }
    }
  }
  return covered;
}

function selectUnallocatedEvidence(input: { readonly experienceId: string; readonly preferredEvidenceByExperience: ReadonlyMap<string, string>; readonly fallbackEvidenceByExperience: ReadonlyMap<string, string>; readonly evidenceIdsByExperience: ReadonlyMap<string, readonly string[]>; readonly allocated: ReadonlySet<string> }): string | undefined {
  const preferred = input.preferredEvidenceByExperience.get(input.experienceId) ?? input.fallbackEvidenceByExperience.get(input.experienceId);
  if (preferred !== undefined && !input.allocated.has(preferred)) {
    return preferred;
  }
  const candidates = input.evidenceIdsByExperience.get(input.experienceId) ?? [];
  for (const id of candidates) {
    if (!input.allocated.has(id)) {
      return id;
    }
  }
  return undefined;
}

function appendExperienceEvidence(allocations: Array<{ sectionKind: 'summary' | 'experience' | 'education' | 'skills' | 'custom'; evidenceIds: string[] }>, evidenceId: string): void {
  const target = allocations.find((allocation) => allocation.sectionKind === 'experience');
  if (target !== undefined) {
    target.evidenceIds.push(evidenceId);
    return;
  }
  allocations.push({ sectionKind: 'experience', evidenceIds: [evidenceId] });
}

function trimExperienceToBudget(input: { readonly allocations: Array<{ sectionKind: 'summary' | 'experience' | 'education' | 'skills' | 'custom'; evidenceIds: string[] }>; readonly evidenceExperience: ReadonlyMap<string, string | null>; readonly evidenceLengths: ReadonlyMap<string, number>; readonly totalBudget: number; readonly allocated: Set<string> }): void {
  let total = sumAllocationLengths(input.allocations, input.evidenceLengths);
  while (total > input.totalBudget) {
    const target = input.allocations.find((allocation) => allocation.sectionKind === 'experience');
    if (target === undefined) {
      return;
    }
    const removable = findRemovableExperienceIndex(target.evidenceIds, input.evidenceExperience);
    if (removable === undefined) {
      return;
    }
    const [removed] = target.evidenceIds.splice(removable, 1);
    if (removed === undefined) {
      return;
    }
    input.allocated.delete(removed);
    total -= input.evidenceLengths.get(removed) ?? 0;
  }
}

function findRemovableExperienceIndex(evidenceIds: readonly string[], evidenceExperience: ReadonlyMap<string, string | null>): number | undefined {
  const counts = new Map<string | null, number>();
  for (const id of evidenceIds) {
    const experienceId = evidenceExperience.get(id) ?? null;
    counts.set(experienceId, (counts.get(experienceId) ?? 0) + 1);
  }
  for (let index = evidenceIds.length - 1; index >= 0; index -= 1) {
    const id = evidenceIds[index]!;
    const experienceId = evidenceExperience.get(id) ?? null;
    if (experienceId === null) {
      return index;
    }
    if ((counts.get(experienceId) ?? 0) > 1) {
      return index;
    }
  }
  return undefined;
}

function sumAllocationLengths(allocations: ReadonlyArray<{ readonly evidenceIds: ReadonlyArray<string> }>, evidenceLengths: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const allocation of allocations) {
    for (const id of allocation.evidenceIds) {
      total += evidenceLengths.get(id) ?? 0;
    }
  }
  return total;
}

export function resolveSectionBudgets(input: {
  readonly sections: readonly PlannerSection[];
  readonly template: 'comfortable' | 'dense';
  readonly lengthTarget: 1 | 2;
}): Array<{ sectionKind: PlannerSection['kind']; charBudget: number }> {
  const perPage = CHARS_PER_PAGE[input.template];
  const total = perPage * input.lengthTarget;
  const count = input.sections.length === 0 ? 1 : input.sections.length;
  const perSection = Math.floor(total / count);
  return input.sections.map((section) => ({ sectionKind: section.kind, charBudget: perSection }));
}

export function buildPlanInput(input: BuildPlanInput): PlanAdaptationInput {
  const sectionBudgets = resolveSectionBudgets({
    sections: input.sections,
    template: input.template,
    lengthTarget: input.lengthTarget,
  });
  return {
    requirements: [...input.requirements],
    evidences: input.evidences.map((evidence) => ({
      id: evidence.id,
      statement: evidence.statement ?? '',
      company: evidence.company,
      role: evidence.role,
    })),
    baseEvidenceIds: [...input.baseEvidenceIds],
    sectionBudgets,
    language: input.language,
  };
}

export function validatePlanOutput(input: ValidatePlanInput): ValidatedPlan {
  const seen = new Set<string>();
  const allocations = validateAllocations(input, seen);
  const allocated = new Set<string>();
  for (const allocation of allocations) {
    for (const id of allocation.evidenceIds) {
      allocated.add(id);
    }
  }
  const coverages = validateCoverages(input, allocated);
  return { allocations, coverages };
}

function validateAllocations(
  input: ValidatePlanInput,
  seen: Set<string>,
): ValidatedPlan['allocations'] {
  const result: ValidatedPlan['allocations'] = [];
  for (const allocation of input.raw.allocations ?? []) {
    const kept: string[] = [];
    for (const evidenceId of allocation.evidenceIds ?? []) {
      if (!input.knownEvidenceIds.has(evidenceId) || seen.has(evidenceId)) {
        continue;
      }
      seen.add(evidenceId);
      kept.push(evidenceId);
    }
    result.push({ sectionKind: allocation.sectionKind, evidenceIds: kept });
  }
  return result;
}

function validateCoverages(
  input: ValidatePlanInput,
  allocated: ReadonlySet<string>,
): ValidatedPlan['coverages'] {
  const byRequirement = new Map((input.raw.coverages ?? []).map((item) => [item.requirementId, item]));
  return input.requirementIds.map((requirementId) => {
    const raw = byRequirement.get(requirementId);
    if (raw === undefined) {
      return { requirementId, coverage: 'gap' as const, evidenceId: null, gapKind: 'existence' as const };
    }
    if (raw.coverage === 'gap') {
      return {
        requirementId,
        coverage: 'gap' as const,
        evidenceId: null,
        gapKind: raw.gapKind ?? ('existence' as const),
      };
    }
    if (raw.evidenceId === null || !input.knownEvidenceIds.has(raw.evidenceId)) {
      return { requirementId, coverage: 'gap' as const, evidenceId: null, gapKind: 'existence' as const };
    }
    if (!allocated.has(raw.evidenceId)) {
      return { requirementId, coverage: 'gap' as const, evidenceId: null, gapKind: 'existence' as const };
    }
    return { requirementId, coverage: raw.coverage, evidenceId: raw.evidenceId, gapKind: null };
  });
}
