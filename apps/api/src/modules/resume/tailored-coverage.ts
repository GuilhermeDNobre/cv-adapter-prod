import { eq, inArray } from 'drizzle-orm';
import { evidences, jobDescriptions, requirements, resumeBullets, resumes } from 'schema';
import { adaptationReviewRecordSchema } from 'schema/contracts/resume';
import { calculateMatchScore } from '../evaluation/match-score';
import type { Database } from '../database/database.provider';
import { diffAdaptationPlan } from './adaptation-diff';

export interface TailoredCoverage {
  readonly languageFallback: boolean;
  readonly matchScore: number | null;
  readonly requirementCoverages: ReadonlyArray<{
    readonly requirementId: string;
    readonly literalTerm: string;
    readonly coverage: 'covered' | 'partial' | 'gap';
    readonly bulletId: string | null;
  }>;
  readonly adaptationChanges: {
    readonly addedEvidences: Array<{ readonly id: string; readonly statement: string }>;
    readonly removedEvidences: Array<{ readonly id: string; readonly statement: string }>;
  } | null;
}

export async function buildTailoredCoverage(input: {
  readonly database: Database;
  readonly document: {
    readonly resume: typeof resumes.$inferSelect;
    readonly bullets: ReadonlyArray<typeof resumeBullets.$inferSelect>;
  };
}): Promise<TailoredCoverage> {
  const jobId = input.document.resume.jobDescriptionId;
  if (jobId === null) {
    return { languageFallback: false, matchScore: null, requirementCoverages: [], adaptationChanges: null };
  }
  const [job] = await input.database
    .select({ language: jobDescriptions.language })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.id, jobId));
  const language = (job?.language ?? '').toLowerCase();
  const languageFallback = !(language.startsWith('pt') || language.startsWith('en'));
  const requirementRows = await input.database
    .select()
    .from(requirements)
    .where(eq(requirements.jobDescriptionId, jobId));
  const plan = parsePlan(input.document.resume.adaptationPlan);
  const adaptationChanges = await buildAdaptationChanges({
    database: input.database,
    plan: input.document.resume.adaptationPlan,
    review: input.document.resume.adaptationReview,
    resumeId: input.document.resume.id,
  });
  if (requirementRows.length === 0) {
    return { languageFallback, matchScore: 0, requirementCoverages: [], adaptationChanges };
  }
  const coverages = mapCoverages({ requirements: requirementRows, plan, bullets: input.document.bullets });
  const matchScore = calculateMatchScore(
    coverages.map((item) => {
      const kind = requirementRows.find((row) => row.id === item.requirementId)?.kind ?? 'mandatory';
      return { kind, coverage: item.coverage };
    }),
  );
  return { languageFallback, matchScore, requirementCoverages: coverages, adaptationChanges };
}

function parsePlan(plan: unknown): {
  readonly coverages: ReadonlyArray<{ requirementId: string; coverage: string; evidenceId: string | null }>;
} {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    return { coverages: [] };
  }
  const coverages = (plan as { coverages?: unknown }).coverages;
  if (!Array.isArray(coverages)) {
    return { coverages: [] };
  }
  const valid = coverages.filter(
    (item): item is { requirementId: string; coverage: string; evidenceId: string | null } =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { requirementId?: unknown }).requirementId === 'string' &&
      typeof (item as { coverage?: unknown }).coverage === 'string',
  );
  return { coverages: valid };
}

async function buildAdaptationChanges(input: {
  readonly database: Database;
  readonly plan: unknown;
  readonly review: unknown;
  readonly resumeId: string;
}): Promise<TailoredCoverage['adaptationChanges']> {
  const ids = diffAdaptationPlan(input.plan);
  if (ids === null) {
    return null;
  }
  const restoredIds = parseRestoredIds(input.review, input.resumeId);
  const visibleRemoved = ids.removed.filter((id) => !restoredIds.has(id));
  if (ids.added.length === 0 && visibleRemoved.length === 0) {
    return { addedEvidences: [], removedEvidences: [] };
  }
  const allIds = [...new Set([...ids.added, ...visibleRemoved])];
  const rows = await input.database
    .select({ id: evidences.id, statement: evidences.statement })
    .from(evidences)
    .where(inArray(evidences.id, allIds));
  const statementById = new Map(rows.map((row) => [row.id, row.statement] as const));
  return {
    addedEvidences: mapEvidenceChanges(ids.added, statementById),
    removedEvidences: mapEvidenceChanges(visibleRemoved, statementById),
  };
}

function parseRestoredIds(review: unknown, resumeId: string): ReadonlySet<string> {
  if (review === null || review === undefined) {
    return new Set();
  }
  const parsed = adaptationReviewRecordSchema.safeParse(review);
  if (!parsed.success) {
    console.error('resume.adaptation_review.invalid_record', { resumeId });
    return new Set();
  }
  const restored: string[] = [];
  for (const [evidenceId, entry] of Object.entries(parsed.data)) {
    if (entry.decision === 'restored') {
      restored.push(evidenceId);
    }
  }
  return new Set(restored);
}

function mapEvidenceChanges(
  ids: readonly string[],
  statements: ReadonlyMap<string, string>,
): Array<{ readonly id: string; readonly statement: string }> {
  const changes: Array<{ readonly id: string; readonly statement: string }> = [];
  for (const id of ids) {
    const statement = statements.get(id);
    if (statement !== undefined && statement.trim() !== '') {
      changes.push({ id, statement });
    }
  }
  return changes;
}

function mapCoverages(input: {
  readonly requirements: ReadonlyArray<typeof requirements.$inferSelect>;
  readonly plan: { readonly coverages: ReadonlyArray<{ requirementId: string; coverage: string; evidenceId: string | null }> };
  readonly bullets: ReadonlyArray<typeof resumeBullets.$inferSelect>;
}): TailoredCoverage['requirementCoverages'] {
  const planByRequirement = new Map(input.plan.coverages.map((item) => [item.requirementId, item]));
  const bulletByEvidence = new Map<string, string>();
  for (const bullet of input.bullets) {
    if (bullet.evidenceId !== null && bullet.status === 'assumed' && !bulletByEvidence.has(bullet.evidenceId)) {
      bulletByEvidence.set(bullet.evidenceId, bullet.id);
    }
  }
  const bulletByRequirement = new Map<string, { id: string; status: string }>();
  for (const bullet of input.bullets) {
    if (bullet.requirementId !== null && !bulletByRequirement.has(bullet.requirementId)) {
      bulletByRequirement.set(bullet.requirementId, { id: bullet.id, status: bullet.status });
    }
  }
  return input.requirements.map((requirement) => {
    const planned = planByRequirement.get(requirement.id);
    const approved = bulletByRequirement.get(requirement.id);
    if (approved !== undefined && approved.status === 'assumed') {
      return { requirementId: requirement.id, literalTerm: requirement.literalTerm, coverage: 'covered' as const, bulletId: approved.id };
    }
    if (planned === undefined) {
      const fallback = bulletByRequirement.get(requirement.id);
      return { requirementId: requirement.id, literalTerm: requirement.literalTerm, coverage: 'gap' as const, bulletId: fallback?.id ?? null };
    }
    if (planned.coverage === 'covered' || planned.coverage === 'partial') {
      const bulletId = planned.evidenceId === null ? null : (bulletByEvidence.get(planned.evidenceId) ?? null);
      if (bulletId === null) {
        return { requirementId: requirement.id, literalTerm: requirement.literalTerm, coverage: 'gap' as const, bulletId: null };
      }
      return { requirementId: requirement.id, literalTerm: requirement.literalTerm, coverage: planned.coverage as 'covered' | 'partial', bulletId };
    }
    const suggestion = bulletByRequirement.get(requirement.id);
    return { requirementId: requirement.id, literalTerm: requirement.literalTerm, coverage: 'gap' as const, bulletId: suggestion?.id ?? null };
  });
}
