import { normalizeGroupKey } from '../skill-order';
import { normalizeSkillTerm } from './section-synthesizer';

export const MAX_SKILL_PROPOSALS = 8;
const MAX_TECHNICAL_WORDS = 3;
export const BEHAVIORAL_STOPWORDS = [
  'comunicacao',
  'comunicativo',
  'lideranca',
  'lider',
  'proatividade',
  'proativo',
  'equipe',
  'time',
  'colaboracao',
  'colaborativo',
  'trabalho',
  'ingles',
  'english',
  'autonomia',
  'resiliencia',
  'empatia',
  'criatividade',
  'adaptabilidade',
  'organizacao',
  'interpessoal',
];
const BEHAVIORAL_WORDS = new Set(BEHAVIORAL_STOPWORDS);

export interface GuardProfileSkill {
  readonly id: string;
  readonly name: string;
  readonly group: string | null;
}

export interface GuardRequirement {
  readonly id: string;
  readonly literalTerm: string;
  readonly kind: 'mandatory' | 'desirable';
  readonly ordinal: number;
}

export interface GuardModelAddition {
  readonly name: string;
  readonly group: string | null;
  readonly requirementTerm: string;
}

export interface GuardModelSwap {
  readonly from: string;
  readonly to: string;
  readonly requirementTerm: string;
}

export interface GuardModelOutput {
  readonly additions: readonly GuardModelAddition[];
  readonly swaps: readonly GuardModelSwap[];
}

export interface GuardedSkillProposal {
  readonly kind: 'addition' | 'swap';
  readonly name: string;
  readonly group: string | null;
  readonly replacesSkillId: string | null;
  readonly requirementId: string;
  readonly ordinal: number;
}

interface GuardInput {
  readonly profileSkills: readonly GuardProfileSkill[];
  readonly requirements: readonly GuardRequirement[];
  readonly output: GuardModelOutput;
}

type Candidate = {
  readonly kind: 'addition' | 'swap';
  readonly name: string;
  readonly group: string | null;
  readonly replacesSkillId: string | null;
  readonly fromNormalized: string | null;
  readonly requirementId: string;
  readonly rank: number;
  readonly orderIndex: number;
};

function indexProfileSkills(skills: readonly GuardProfileSkill[]): Map<string, GuardProfileSkill> {
  const byNormalized = new Map<string, GuardProfileSkill>();
  for (const skill of skills) {
    const normalized = normalizeSkillTerm(skill.name);
    if (normalized === '' || byNormalized.has(normalized)) {
      continue;
    }
    byNormalized.set(normalized, skill);
  }
  return byNormalized;
}

function indexGroupLabels(skills: readonly GuardProfileSkill[]): Map<string, string> {
  const byNormalized = new Map<string, string>();
  for (const skill of skills) {
    if (skill.group === null) {
      continue;
    }
    const normalizedGroup = normalizeGroupKey(skill.group);
    if (normalizedGroup === null || byNormalized.has(normalizedGroup)) {
      continue;
    }
    byNormalized.set(normalizedGroup, skill.group);
  }
  return byNormalized;
}

function indexRequirementsWithRank(requirements: readonly GuardRequirement[]): {
  byNormalized: Map<string, GuardRequirement>;
  rank: Map<string, number>;
} {
  const sorted = [...requirements].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'mandatory' ? -1 : 1;
    }
    return left.ordinal - right.ordinal;
  });
  const byNormalized = new Map<string, GuardRequirement>();
  const rank = new Map<string, number>();
  for (let index = 0; index < sorted.length; index += 1) {
    const requirement = sorted[index]!;
    const normalized = normalizeSkillTerm(requirement.literalTerm);
    if (normalized === '' || byNormalized.has(normalized)) {
      continue;
    }
    byNormalized.set(normalized, requirement);
    rank.set(requirement.id, index);
  }
  return { byNormalized, rank };
}

function resolveGroupLabel(group: string | null, labels: ReadonlyMap<string, string>): string | null {
  if (group === null) {
    return null;
  }
  const normalizedGroup = normalizeGroupKey(group);
  if (normalizedGroup === null) {
    return null;
  }
  return labels.get(normalizedGroup) ?? null;
}

function resolveAdditionCandidate(input: {
  addition: GuardModelAddition;
  requirementByNormalized: ReadonlyMap<string, GuardRequirement>;
  skillNames: ReadonlySet<string>;
  groupLabels: ReadonlyMap<string, string>;
  requirementRank: ReadonlyMap<string, number>;
  orderIndex: number;
}): Candidate | undefined {
  const normalizedName = normalizeSkillTerm(input.addition.name);
  const requirement = input.requirementByNormalized.get(normalizedName);
  if (requirement === undefined) {
    return undefined;
  }
  if (input.skillNames.has(normalizedName)) {
    return undefined;
  }
  return {
    kind: 'addition',
    name: requirement.literalTerm,
    group: resolveGroupLabel(input.addition.group, input.groupLabels),
    replacesSkillId: null,
    fromNormalized: null,
    requirementId: requirement.id,
    rank: input.requirementRank.get(requirement.id) ?? Number.MAX_SAFE_INTEGER,
    orderIndex: input.orderIndex,
  };
}

function resolveSwapCandidate(input: {
  swap: GuardModelSwap;
  requirementByNormalized: ReadonlyMap<string, GuardRequirement>;
  skillByNormalized: ReadonlyMap<string, GuardProfileSkill>;
  skillNames: ReadonlySet<string>;
  requirementRank: ReadonlyMap<string, number>;
  orderIndex: number;
}): Candidate | undefined {
  const normalizedTo = normalizeSkillTerm(input.swap.to);
  const requirement = input.requirementByNormalized.get(normalizedTo);
  if (requirement === undefined) {
    return undefined;
  }
  if (input.skillNames.has(normalizedTo)) {
    return undefined;
  }
  const normalizedFrom = normalizeSkillTerm(input.swap.from);
  const replaced = input.skillByNormalized.get(normalizedFrom);
  if (replaced === undefined) {
    return undefined;
  }
  return {
    kind: 'swap',
    name: requirement.literalTerm,
    group: replaced.group,
    replacesSkillId: replaced.id,
    fromNormalized: normalizedFrom,
    requirementId: requirement.id,
    rank: input.requirementRank.get(requirement.id) ?? Number.MAX_SAFE_INTEGER,
    orderIndex: input.orderIndex,
  };
}

function dedupeAndCap(candidates: readonly Candidate[]): GuardedSkillProposal[] {
  const ordered = [...candidates].sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return left.orderIndex - right.orderIndex;
  });
  const seenNames = new Set<string>();
  const usedFrom = new Set<string>();
  const guarded: GuardedSkillProposal[] = [];
  for (const candidate of ordered) {
    const normalizedName = normalizeSkillTerm(candidate.name);
    if (seenNames.has(normalizedName)) {
      continue;
    }
    if (candidate.fromNormalized !== null && usedFrom.has(candidate.fromNormalized)) {
      continue;
    }
    if (candidate.fromNormalized !== null) {
      usedFrom.add(candidate.fromNormalized);
    }
    seenNames.add(normalizedName);
    guarded.push({
      kind: candidate.kind,
      name: candidate.name,
      group: candidate.group,
      replacesSkillId: candidate.replacesSkillId,
      requirementId: candidate.requirementId,
      ordinal: guarded.length,
    });
    if (guarded.length >= MAX_SKILL_PROPOSALS) {
      break;
    }
  }
  return guarded;
}

function countWords(term: string): number {
  const trimmed = term.trim();
  if (trimmed === '') {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
function containsBehavioralWord(term: string): boolean {
  const words = term.trim().split(/\s+/);
  for (const word of words) {
    const normalized = normalizeSkillTerm(word);
    if (normalized !== '' && BEHAVIORAL_WORDS.has(normalized)) {
      return true;
    }
  }
  return false;
}
function isTechnicalRequirement(literalTerm: string, modelProposed: ReadonlySet<string>): boolean {
  const normalized = normalizeSkillTerm(literalTerm);
  if (normalized !== '' && modelProposed.has(normalized)) {
    return true;
  }
  if (countWords(literalTerm) > MAX_TECHNICAL_WORDS) {
    return false;
  }
  return !containsBehavioralWord(literalTerm);
}
function collectModelProposedNames(output: GuardModelOutput): Set<string> {
  const proposed = new Set<string>();
  for (const addition of output.additions) {
    const normalizedName = normalizeSkillTerm(addition.name);
    if (normalizedName !== '') {
      proposed.add(normalizedName);
    }
    const normalizedTerm = normalizeSkillTerm(addition.requirementTerm);
    if (normalizedTerm !== '') {
      proposed.add(normalizedTerm);
    }
  }
  return proposed;
}
function collectUncoveredAdditions(input: {
  requirements: readonly GuardRequirement[];
  coveredIds: ReadonlySet<string>;
  skillNames: ReadonlySet<string>;
  modelProposed: ReadonlySet<string>;
  requirementRank: ReadonlyMap<string, number>;
  startOrder: number;
}): Candidate[] {
  const sorted = [...input.requirements].sort((left, right) => {
    const leftRank = input.requirementRank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = input.requirementRank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.ordinal - right.ordinal;
  });
  const uncovered: Candidate[] = [];
  let orderIndex = input.startOrder;
  for (const requirement of sorted) {
    orderIndex += 1;
    if (input.coveredIds.has(requirement.id)) {
      continue;
    }
    const normalized = normalizeSkillTerm(requirement.literalTerm);
    if (normalized === '' || input.skillNames.has(normalized)) {
      continue;
    }
    if (!isTechnicalRequirement(requirement.literalTerm, input.modelProposed)) {
      continue;
    }
    uncovered.push({
      kind: 'addition',
      name: requirement.literalTerm,
      group: null,
      replacesSkillId: null,
      fromNormalized: null,
      requirementId: requirement.id,
      rank: input.requirementRank.get(requirement.id) ?? Number.MAX_SAFE_INTEGER,
      orderIndex,
    });
  }
  return uncovered;
}
export function guardSkillProposals(input: GuardInput): GuardedSkillProposal[] {
  const skillByNormalized = indexProfileSkills(input.profileSkills);
  const skillNames = new Set(skillByNormalized.keys());
  const groupLabels = indexGroupLabels(input.profileSkills);
  const indexed = indexRequirementsWithRank(input.requirements);
  const candidates: Candidate[] = [];
  let orderIndex = 0;
  for (const addition of input.output.additions) {
    orderIndex += 1;
    const candidate = resolveAdditionCandidate({
      addition,
      requirementByNormalized: indexed.byNormalized,
      skillNames,
      groupLabels,
      requirementRank: indexed.rank,
      orderIndex,
    });
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }
  for (const swap of input.output.swaps) {
    orderIndex += 1;
    const candidate = resolveSwapCandidate({
      swap,
      requirementByNormalized: indexed.byNormalized,
      skillByNormalized,
      skillNames,
      requirementRank: indexed.rank,
      orderIndex,
    });
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }
  const dedupedModel = dedupeAndCap(candidates);
  const coveredIds = new Set(dedupedModel.map((proposal) => proposal.requirementId));
  const modelProposed = collectModelProposedNames(input.output);
  const uncovered = collectUncoveredAdditions({
    requirements: input.requirements,
    coveredIds,
    skillNames,
    modelProposed,
    requirementRank: indexed.rank,
    startOrder: orderIndex,
  });
  return dedupeAndCap([...candidates, ...uncovered]);
}
