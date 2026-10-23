import { eq } from 'drizzle-orm';
import { resumeBullets, resumeEntries, resumeSectionSkills, resumeSkillProposals, resumes } from 'schema';
import type { Database } from '../../database/database.provider';

export interface WrittenBullet {
  readonly evidenceId: string | null;
  readonly text: string;
  readonly status: 'assumed' | 'suggestion';
  readonly suggestionQuestion: string | null;
  readonly gapKind: 'detail' | null;
}

interface WriterDeps {
  readonly database: Database;
}

interface WriterDocument {
  readonly sections: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly ordinal: number }>;
}

interface WriterTailored {
  readonly id: string;
}

interface WriterPlan {
  readonly allocations: ReadonlyArray<{ readonly sectionKind: string; readonly evidenceIds: ReadonlyArray<string> }>;
  readonly coverages: ReadonlyArray<{ readonly requirementId: string; readonly coverage: string; readonly evidenceId: string | null; readonly gapKind: string | null }>;
  readonly addedEvidenceIds: ReadonlyArray<string>;
  readonly removedEvidenceIds: ReadonlyArray<string>;
  readonly baseEvidenceIds: ReadonlyArray<string>;
}

interface WrittenSection {
  readonly sectionId: string;
  readonly bullets: ReadonlyArray<WrittenBullet>;
}

interface WriterSuggestion {
  readonly requirementId: string;
  readonly gapKind: 'existence' | 'detail';
  readonly question: string;
  readonly draftBullet: string;
  readonly experienceId: string | null;
}

interface WriterBase {
  readonly sections: ReadonlyArray<{ readonly id: string; readonly ordinal: number; readonly kind: string }>;
  readonly entries: ReadonlyArray<{ readonly sectionId: string; readonly ordinal: number; readonly experienceId: string | null }>;
}

interface WriterCareer {
  readonly evidenceById: ReadonlyMap<string, { readonly experienceId: string | null }>;
  readonly experienceById: ReadonlyMap<string, { readonly startedOn: string }>;
}

export interface WriterSkillProposal {
  readonly kind: 'addition' | 'swap';
  readonly name: string;
  readonly group: string | null;
  readonly replacesSkillId: string | null;
  readonly requirementId: string;
  readonly ordinal: number;
}

interface SaveTailoredInput {
  readonly document: WriterDocument;
  readonly tailored: WriterTailored;
  readonly plan: WriterPlan;
  readonly written: ReadonlyArray<WrittenSection>;
  readonly suggestions: ReadonlyArray<WriterSuggestion>;
  readonly base: WriterBase | undefined;
  readonly career: WriterCareer;
  readonly skills?: ReadonlyArray<{ readonly sectionId: string; readonly skillIds: readonly string[] }>;
  readonly skillProposals?: ReadonlyArray<WriterSkillProposal>;
}

type WriterTx = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function saveTailoredDocument(deps: WriterDeps, input: SaveTailoredInput): Promise<boolean> {
  const writtenBySection = new Map(input.written.map((item) => [item.sectionId, item]));
  const sections = [...input.document.sections].sort((a, b) => a.ordinal - b.ordinal);
  const firstWritable = sections.find((section) => section.kind !== 'custom');
  const experienceSectionId = sections.find((section) => section.kind === 'experience')?.id;
  return deps.database.transaction(async (tx) => {
    const experienceEntries = new Map<string, { entryId: string; nextOrdinal: number }>();
    let experienceEntryCount = 0;
    for (const section of sections) {
      if (section.kind === 'custom') {
        continue;
      }
      if (section.kind === 'skills') {
        continue;
      }
      const written = writtenBySection.get(section.id);
      if (written === undefined) {
        continue;
      }
      if (section.kind === 'experience') {
        const inserted = await insertExperienceBullets(tx, { sectionId: section.id, bullets: written.bullets, base: input.base, career: input.career });
        for (const [experienceId, entry] of inserted) {
          experienceEntries.set(experienceId, entry);
        }
        experienceEntryCount += inserted.size;
        continue;
      }
      await insertSectionBullets(tx, { sectionId: section.id, bullets: written.bullets });
    }
    for (const replacement of input.skills ?? []) {
      for (let index = 0; index < replacement.skillIds.length; index += 1) {
        await tx.insert(resumeSectionSkills).values({
          sectionId: replacement.sectionId,
          skillId: replacement.skillIds[index]!,
          ordinal: index,
        });
      }
    }
    for (const section of sections.filter((item) => item.kind === 'skills')) {
      for (const proposal of input.skillProposals ?? []) {
        await tx.insert(resumeSkillProposals).values({
          sectionId: section.id,
          kind: proposal.kind,
          name: proposal.name,
          group: proposal.group,
          replacesSkillId: proposal.replacesSkillId,
          requirementId: proposal.requirementId,
          status: proposal.kind === 'addition' ? 'accepted' : 'pending',
          ordinal: proposal.ordinal,
        });
      }
    }
    await insertSuggestionBullets(tx, { fallbackSectionId: firstWritable?.id, experienceSectionId, experienceEntries, experienceEntryCount, career: input.career, suggestions: input.suggestions });
    const claimed = await tx
      .update(resumes)
      .set({
        adaptationPlan: {
          allocations: input.plan.allocations,
          coverages: input.plan.coverages,
          addedEvidenceIds: input.plan.addedEvidenceIds,
          removedEvidenceIds: input.plan.removedEvidenceIds,
          baseEvidenceIds: input.plan.baseEvidenceIds,
        },
        generationStatus: 'ready',
        generationStep: null,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(resumes.id, input.tailored.id))
      .returning({ id: resumes.id });
    return claimed.length > 0;
  });
}

async function insertSectionBullets(tx: WriterTx, input: { readonly sectionId: string; readonly bullets: ReadonlyArray<WrittenBullet> }): Promise<void> {
  if (input.bullets.length === 0) {
    return;
  }
  const [entry] = await tx
    .insert(resumeEntries)
    .values({ sectionId: input.sectionId, ordinal: 0, experienceId: null, educationEntryId: null, heading: null })
    .returning({ id: resumeEntries.id });
  if (entry === undefined) {
    throw new Error('Failed to create tailored entry');
  }
  for (let index = 0; index < input.bullets.length; index += 1) {
    const bullet = input.bullets[index]!;
    await tx.insert(resumeBullets).values({
      entryId: entry.id,
      ordinal: index,
      text: bullet.text,
      evidenceId: bullet.evidenceId,
      status: bullet.status,
      suggestionQuestion: bullet.suggestionQuestion,
      requirementId: null,
      gapKind: bullet.gapKind,
      needsReview: false,
      editedByPerson: false,
    });
  }
}

async function insertExperienceBullets(
  tx: WriterTx,
  input: { readonly sectionId: string; readonly bullets: ReadonlyArray<WrittenBullet>; readonly base: WriterBase | undefined; readonly career: WriterCareer },
): Promise<Map<string, { entryId: string; nextOrdinal: number }>> {
  const inserted = new Map<string, { entryId: string; nextOrdinal: number }>();
  if (input.bullets.length === 0) {
    return inserted;
  }
  const grouped = groupBulletsByExperience(input.bullets, input.career);
  const orderedIds = orderExperienceIds([...grouped.keys()], input.base, input.career, input.bullets);
  const unassigned = grouped.get(null) ?? [];
  const groups: Array<{ readonly experienceId: string | null; readonly bullets: ReadonlyArray<WrittenBullet> }> = [
    ...orderedIds.map((id) => ({ experienceId: id as string | null, bullets: grouped.get(id) ?? [] })),
  ];
  if (unassigned.length > 0) {
    groups.push({ experienceId: null, bullets: unassigned });
  }
  for (let ordinal = 0; ordinal < groups.length; ordinal += 1) {
    const group = groups[ordinal]!;
    const entryId = await createEntryWithBullets(tx, { sectionId: input.sectionId, ordinal, experienceId: group.experienceId, bullets: group.bullets });
    if (group.experienceId !== null) {
      inserted.set(group.experienceId, { entryId, nextOrdinal: group.bullets.length });
    }
  }
  return inserted;
}

function groupBulletsByExperience(bullets: ReadonlyArray<WrittenBullet>, career: WriterCareer): Map<string | null, ReadonlyArray<WrittenBullet>> {
  const grouped = new Map<string | null, Array<WrittenBullet>>();
  for (const bullet of bullets) {
    const experienceId = resolveBulletExperienceId(bullet.evidenceId, career);
    const existing = grouped.get(experienceId) ?? [];
    existing.push(bullet);
    grouped.set(experienceId, existing);
  }
  return grouped;
}

function resolveBulletExperienceId(evidenceId: string | null, career: WriterCareer): string | null {
  if (evidenceId === null) {
    return null;
  }
  return career.evidenceById.get(evidenceId)?.experienceId ?? null;
}

export function collectBaseExperienceOrder(base: WriterBase | undefined): string[] {
  if (base === undefined) {
    return [];
  }
  const ordinalBySection = new Map(base.sections.map((section) => [section.id, section.ordinal] as const));
  const experienceSectionIds = new Set(
    base.sections.filter((section) => section.kind === 'experience').map((section) => section.id),
  );
  const entries = [...base.entries]
    .filter((entry) => experienceSectionIds.has(entry.sectionId))
    .sort((left, right) => {
      const sectionDiff = (ordinalBySection.get(left.sectionId) ?? 0) - (ordinalBySection.get(right.sectionId) ?? 0);
      if (sectionDiff !== 0) {
        return sectionDiff;
      }
      return left.ordinal - right.ordinal;
    });
  const order: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.experienceId === null || seen.has(entry.experienceId)) {
      continue;
    }
    seen.add(entry.experienceId);
    order.push(entry.experienceId);
  }
  return order;
}

function orderExperienceIds(ids: ReadonlyArray<string | null>, base: WriterBase | undefined, career: WriterCareer, bullets: ReadonlyArray<WrittenBullet>): string[] {
  const assigned = ids.filter((id): id is string => id !== null);
  const baseOrder = collectBaseExperienceOrder(base);
  const rank = new Map(baseOrder.map((id, index) => [id, index] as const));
  const firstSeen = new Map<string, number>();
  for (let index = 0; index < bullets.length; index += 1) {
    const experienceId = resolveBulletExperienceId(bullets[index]!.evidenceId, career);
    if (experienceId !== null && !firstSeen.has(experienceId)) {
      firstSeen.set(experienceId, index);
    }
  }
  return [...assigned].sort((left, right) => {
    const leftRank = rank.get(left);
    const rightRank = rank.get(right);
    if (leftRank !== undefined && rightRank !== undefined) {
      return leftRank - rightRank;
    }
    if (leftRank !== undefined) {
      return -1;
    }
    if (rightRank !== undefined) {
      return 1;
    }
    const leftStart = career.experienceById.get(left)?.startedOn ?? '';
    const rightStart = career.experienceById.get(right)?.startedOn ?? '';
    if (leftStart !== rightStart) {
      return leftStart < rightStart ? 1 : -1;
    }
    return (firstSeen.get(left) ?? 0) - (firstSeen.get(right) ?? 0);
  });
}

async function createEntryWithBullets(
  tx: WriterTx,
  input: { readonly sectionId: string; readonly ordinal: number; readonly experienceId: string | null; readonly bullets: ReadonlyArray<WrittenBullet> },
): Promise<string> {
  const [entry] = await tx
    .insert(resumeEntries)
    .values({ sectionId: input.sectionId, ordinal: input.ordinal, experienceId: input.experienceId, educationEntryId: null, heading: null })
    .returning({ id: resumeEntries.id });
  if (entry === undefined) {
    throw new Error('Failed to create tailored entry');
  }
  for (let index = 0; index < input.bullets.length; index += 1) {
    const bullet = input.bullets[index]!;
    await tx.insert(resumeBullets).values({
      entryId: entry.id,
      ordinal: index,
      text: bullet.text,
      evidenceId: bullet.evidenceId,
      status: bullet.status,
      suggestionQuestion: bullet.suggestionQuestion,
      requirementId: null,
      gapKind: bullet.gapKind,
      needsReview: false,
      editedByPerson: false,
    });
  }
  return entry.id;
}

async function insertSuggestionBullet(
  tx: WriterTx,
  input: { readonly entryId: string; readonly ordinal: number; readonly suggestion: WriterSuggestion },
): Promise<void> {
  await tx.insert(resumeBullets).values({
    entryId: input.entryId,
    ordinal: input.ordinal,
    text: input.suggestion.draftBullet,
    evidenceId: null,
    status: 'suggestion',
    suggestionQuestion: input.suggestion.question,
    requirementId: input.suggestion.requirementId,
    gapKind: input.suggestion.gapKind,
    needsReview: false,
    editedByPerson: false,
  });
}
async function insertExperienceSuggestions(
  tx: WriterTx,
  input: {
    readonly experienceSectionId: string;
    readonly experienceEntries: Map<string, { entryId: string; nextOrdinal: number }>;
    readonly baseCount: number;
    readonly career: WriterCareer;
    readonly suggestions: ReadonlyArray<WriterSuggestion>;
  },
): Promise<ReadonlyArray<WriterSuggestion>> {
  const fallback: WriterSuggestion[] = [];
  let created = 0;
  for (const suggestion of input.suggestions) {
    if (suggestion.experienceId === null || !input.career.experienceById.has(suggestion.experienceId)) {
      fallback.push(suggestion);
      continue;
    }
    const existing = input.experienceEntries.get(suggestion.experienceId);
    if (existing !== undefined) {
      await insertSuggestionBullet(tx, { entryId: existing.entryId, ordinal: existing.nextOrdinal, suggestion });
      existing.nextOrdinal += 1;
      continue;
    }
    const [entry] = await tx
      .insert(resumeEntries)
      .values({ sectionId: input.experienceSectionId, ordinal: input.baseCount + created, experienceId: suggestion.experienceId, educationEntryId: null, heading: null })
      .returning({ id: resumeEntries.id });
    if (entry === undefined) {
      throw new Error('Failed to create suggestion entry');
    }
    await insertSuggestionBullet(tx, { entryId: entry.id, ordinal: 0, suggestion });
    input.experienceEntries.set(suggestion.experienceId, { entryId: entry.id, nextOrdinal: 1 });
    created += 1;
  }
  return fallback;
}
async function insertFallbackSuggestions(
  tx: WriterTx,
  input: { readonly sectionId: string | undefined; readonly suggestions: ReadonlyArray<WriterSuggestion> },
): Promise<void> {
  if (input.suggestions.length === 0 || input.sectionId === undefined) {
    return;
  }
  const [entry] = await tx
    .insert(resumeEntries)
    .values({ sectionId: input.sectionId, ordinal: 999, experienceId: null, educationEntryId: null, heading: null })
    .returning({ id: resumeEntries.id });
  if (entry === undefined) {
    throw new Error('Failed to create suggestion entry');
  }
  for (let index = 0; index < input.suggestions.length; index += 1) {
    await insertSuggestionBullet(tx, { entryId: entry.id, ordinal: index, suggestion: input.suggestions[index]! });
  }
}
async function insertSuggestionBullets(
  tx: WriterTx,
  input: {
    readonly fallbackSectionId: string | undefined;
    readonly experienceSectionId: string | undefined;
    readonly experienceEntries: Map<string, { entryId: string; nextOrdinal: number }>;
    readonly experienceEntryCount: number;
    readonly career: WriterCareer;
    readonly suggestions: ReadonlyArray<WriterSuggestion>;
  },
): Promise<void> {
  if (input.suggestions.length === 0) {
    return;
  }
  if (input.experienceSectionId === undefined) {
    await insertFallbackSuggestions(tx, { sectionId: input.fallbackSectionId, suggestions: input.suggestions });
    return;
  }
  const fallback = await insertExperienceSuggestions(tx, {
    experienceSectionId: input.experienceSectionId,
    experienceEntries: input.experienceEntries,
    baseCount: input.experienceEntryCount,
    career: input.career,
    suggestions: input.suggestions,
  });
  await insertFallbackSuggestions(tx, { sectionId: input.fallbackSectionId, suggestions: fallback });
}
