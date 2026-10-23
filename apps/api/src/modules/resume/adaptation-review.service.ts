import { Inject, Injectable, InternalServerErrorException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { evidences, resumeBullets, resumeEntries, resumeSections, resumes } from 'schema';
import {
  adaptationReviewRecordSchema,
  resumeIdSchema,
  type AdaptationReviewDecision,
  type AdaptationReviewRecord,
} from 'schema/contracts/resume';
import { DATABASE, type Database } from '../database/database.provider';
import { diffAdaptationPlan } from './adaptation-diff';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Snapshot = AdaptationReviewRecord[string]['snapshot'];
type EvidenceRow = typeof evidences.$inferSelect;

export interface DecideReviewInput {
  readonly resumeId: string;
  readonly userId: string;
  readonly evidenceId: string;
  readonly decision: AdaptationReviewDecision;
}

export interface UndoReviewInput {
  readonly resumeId: string;
  readonly userId: string;
  readonly evidenceId: string;
}

@Injectable()
export class AdaptationReviewService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async decide(input: DecideReviewInput): Promise<string> {
    const resume = await this.requireReadyTailored(input.resumeId, input.userId);
    const evidence = await this.requireEvidence(input.evidenceId);
    this.requireDecisionFitsPlan(resume.adaptationPlan, input.evidenceId, input.decision);
    const parsed = parseReviewRecord(resume.adaptationReview);
    if (!parsed.ok) {
      console.error('resume.adaptation_review.invalid_record', { resumeId: resume.id });
      throw new InternalServerErrorException('Invalid adaptation review record.');
    }
    const current = parsed.record;
    const existing = current[input.evidenceId];
    if (existing !== undefined && existing.decision === input.decision) {
      return resume.id;
    }
    await this.database.transaction(async (tx) => {
      const freshResult = await loadReview(tx, resume.id);
      if (!freshResult.ok) {
        console.error('resume.adaptation_review.invalid_record', { resumeId: resume.id });
        throw new InternalServerErrorException('Invalid adaptation review record.');
      }
      const fresh = freshResult.record;
      const previous = fresh[input.evidenceId];
      if (previous !== undefined && previous.decision !== input.decision) {
        await revertDecision(tx, input.evidenceId, previous.decision, previous.snapshot);
        delete fresh[input.evidenceId];
      }
      if (fresh[input.evidenceId]?.decision === input.decision) {
        return;
      }
      const snapshot = await applyDecision(tx, this.database, resume.id, evidence, input.decision);
      fresh[input.evidenceId] = { decision: input.decision, decidedAt: new Date().toISOString(), snapshot };
      await saveReview(tx, resume.id, fresh);
    });
    console.log('resume.adaptation_review.decided', {
      resumeId: resume.id,
      evidenceId: input.evidenceId,
      decision: input.decision,
    });
    return resume.id;
  }

  async undo(input: UndoReviewInput): Promise<string> {
    const resume = await this.requireReadyTailored(input.resumeId, input.userId);
    const parsed = parseReviewRecord(resume.adaptationReview);
    if (!parsed.ok) {
      console.error('resume.adaptation_review.invalid_record', { resumeId: resume.id });
      throw new InternalServerErrorException('Invalid adaptation review record.');
    }
    const current = parsed.record;
    if (current[input.evidenceId] === undefined) {
      throw new UnprocessableEntityException('There is no decision to undo.');
    }
    await this.database.transaction(async (tx) => {
      const freshResult = await loadReview(tx, resume.id);
      if (!freshResult.ok) {
        console.error('resume.adaptation_review.invalid_record', { resumeId: resume.id });
        throw new InternalServerErrorException('Invalid adaptation review record.');
      }
      const fresh = freshResult.record;
      const target = fresh[input.evidenceId];
      if (target === undefined) {
        throw new UnprocessableEntityException('There is no decision to undo.');
      }
      await revertDecision(tx, input.evidenceId, target.decision, target.snapshot);
      delete fresh[input.evidenceId];
      await saveReview(tx, resume.id, fresh);
    });
    console.log('resume.adaptation_review.undone', { resumeId: resume.id, evidenceId: input.evidenceId });
    return resume.id;
  }

  private async requireReadyTailored(resumeId: string, userId: string) {
    const parsed = resumeIdSchema.safeParse(resumeId);
    if (!parsed.success) {
      throw new NotFoundException('Resume not found.');
    }
    const [resume] = await this.database
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, parsed.data), eq(resumes.userId, userId)));
    if (resume === undefined) {
      throw new NotFoundException('Resume not found.');
    }
    if (resume.kind !== 'tailored') {
      throw new UnprocessableEntityException('Only tailored resumes can be reviewed.');
    }
    if (resume.generationStatus !== 'ready') {
      throw new UnprocessableEntityException('Resume is not ready for review.');
    }
    return resume;
  }

  private async requireEvidence(evidenceId: string) {
    const [evidence] = await this.database.select().from(evidences).where(eq(evidences.id, evidenceId));
    if (evidence === undefined) {
      throw new NotFoundException('Evidence not found.');
    }
    return evidence;
  }

  private requireDecisionFitsPlan(plan: unknown, evidenceId: string, decision: AdaptationReviewDecision): void {
    const ids = diffAdaptationPlan(plan);
    const added = ids?.added ?? [];
    const removed = ids?.removed ?? [];
    if (decision === 'restored' && !removed.includes(evidenceId)) {
      throw new UnprocessableEntityException('Only a removed evidence can be restored.');
    }
    if (decision !== 'restored' && !added.includes(evidenceId)) {
      throw new UnprocessableEntityException('Only an added evidence can be accepted or rejected.');
    }
  }
}

export type ParseReviewResult = { ok: true; record: AdaptationReviewRecord } | { ok: false };

async function loadReview(tx: Transaction, resumeId: string): Promise<ParseReviewResult> {
  const [row] = await tx.select().from(resumes).where(eq(resumes.id, resumeId));
  const review = (row as { adaptationReview?: unknown } | undefined)?.adaptationReview;
  return parseReviewRecord(review);
}

async function saveReview(tx: Transaction, resumeId: string, review: AdaptationReviewRecord): Promise<void> {
  await tx.update(resumes).set({ adaptationReview: review, updatedAt: new Date() }).where(eq(resumes.id, resumeId));
}

async function applyDecision(
  tx: Transaction,
  database: Database,
  resumeId: string,
  evidence: EvidenceRow,
  decision: AdaptationReviewDecision,
): Promise<Snapshot> {
  if (decision === 'accepted') {
    return [];
  }
  if (decision === 'rejected') {
    return applyReject(tx, resumeId, evidence.id);
  }
  return applyRestore(tx, database, resumeId, evidence);
}

async function applyReject(tx: Transaction, resumeId: string, evidenceId: string): Promise<Snapshot> {
  const bullets = await listTailoredBullets(tx, resumeId, evidenceId);
  const snapshot = bullets.map((bullet) => ({
    entryId: bullet.entryId,
    ordinal: bullet.ordinal,
    text: bullet.text,
    bulletId: bullet.id,
    editedByPerson: bullet.editedByPerson,
    needsReview: bullet.needsReview,
  }));
  const ids = snapshot.map((item) => item.bulletId);
  if (ids.length > 0) {
    await tx.delete(resumeBullets).where(inArray(resumeBullets.id, ids));
  }
  return snapshot;
}

async function applyRestore(tx: Transaction, database: Database, resumeId: string, evidence: EvidenceRow): Promise<Snapshot> {
  const entryId = await resolveRestoreEntry(tx, database, resumeId, evidence);
  const existing = await tx.select().from(resumeBullets).where(eq(resumeBullets.entryId, entryId));
  const ordinal = existing.reduce((max, bullet) => Math.max(max, bullet.ordinal + 1), 0);
  const [inserted] = await tx
    .insert(resumeBullets)
    .values({
      entryId,
      ordinal,
      text: evidence.statement,
      evidenceId: evidence.id,
      status: 'assumed',
      suggestionQuestion: null,
      requirementId: null,
      gapKind: null,
      needsReview: false,
      editedByPerson: false,
    })
    .returning({ id: resumeBullets.id });
  if (inserted === undefined) {
    throw new Error('Failed to restore evidence');
  }
  return [{ entryId, ordinal, text: evidence.statement, bulletId: inserted.id, editedByPerson: false, needsReview: false }];
}

async function revertDecision(
  tx: Transaction,
  evidenceId: string,
  decision: AdaptationReviewDecision,
  snapshot: Snapshot,
): Promise<void> {
  if (decision === 'rejected') {
    await reinsertRejected(tx, evidenceId, snapshot);
    return;
  }
  if (decision === 'restored') {
    const ids = snapshot.map((item) => item.bulletId);
    if (ids.length > 0) {
      await tx.delete(resumeBullets).where(inArray(resumeBullets.id, ids));
    }
  }
}

async function reinsertRejected(tx: Transaction, evidenceId: string, snapshot: Snapshot): Promise<void> {
  const ordered = [...snapshot].sort((left, right) => left.ordinal - right.ordinal);
  for (const item of ordered) {
    await makeOrdinalRoom(tx, item.entryId, item.ordinal);
    await tx.insert(resumeBullets).values({
      id: item.bulletId,
      entryId: item.entryId,
      ordinal: item.ordinal,
      text: item.text,
      evidenceId,
      status: 'assumed',
      suggestionQuestion: null,
      requirementId: null,
      gapKind: null,
      needsReview: item.needsReview ?? false,
      editedByPerson: item.editedByPerson ?? false,
    });
  }
}

async function makeOrdinalRoom(tx: Transaction, entryId: string, ordinal: number): Promise<void> {
  const siblings = await tx.select().from(resumeBullets).where(eq(resumeBullets.entryId, entryId));
  const conflicting = siblings.filter((bullet) => bullet.ordinal >= ordinal);
  const ordered = [...conflicting].sort((left, right) => right.ordinal - left.ordinal);
  for (const bullet of ordered) {
    await tx.update(resumeBullets).set({ ordinal: bullet.ordinal + 1 }).where(eq(resumeBullets.id, bullet.id));
  }
}

async function listTailoredBullets(tx: Transaction, resumeId: string, evidenceId: string) {
  const sections = await tx.select().from(resumeSections).where(eq(resumeSections.resumeId, resumeId));
  if (sections.length === 0) {
    return [];
  }
  const entries = await tx
    .select()
    .from(resumeEntries)
    .where(inArray(resumeEntries.sectionId, sections.map((section) => section.id)));
  if (entries.length === 0) {
    return [];
  }
  return tx
    .select()
    .from(resumeBullets)
    .where(and(inArray(resumeBullets.entryId, entries.map((entry) => entry.id)), eq(resumeBullets.evidenceId, evidenceId)));
}

async function resolveRestoreEntry(tx: Transaction, database: Database, resumeId: string, evidence: EvidenceRow): Promise<string> {
  if (evidence.experienceId !== null) {
    const direct = await findEntryWithExperience(tx, resumeId, evidence.experienceId);
    if (direct !== undefined) {
      return direct;
    }
  }
  const originKind = await findBaseOriginKind(database, resumeId, evidence.id);
  const fallback = await findFirstEntryOfKind(tx, resumeId, originKind);
  if (fallback === undefined) {
    throw new UnprocessableEntityException('No destination section for restore.');
  }
  return fallback;
}

async function findEntryWithExperience(tx: Transaction, resumeId: string, experienceId: string): Promise<string | undefined> {
  const sections = await tx.select().from(resumeSections).where(eq(resumeSections.resumeId, resumeId));
  if (sections.length === 0) {
    return undefined;
  }
  const entries = await tx
    .select()
    .from(resumeEntries)
    .where(
      and(
        inArray(resumeEntries.sectionId, sections.map((section) => section.id)),
        eq(resumeEntries.experienceId, experienceId),
      ),
    )
    .orderBy(asc(resumeEntries.ordinal));
  return entries[0]?.id;
}

async function findBaseOriginKind(database: Database, resumeId: string, evidenceId: string): Promise<string | undefined> {
  const [tailored] = await database.select().from(resumes).where(eq(resumes.id, resumeId));
  const baseId = (tailored as { baseResumeId?: string | null } | undefined)?.baseResumeId;
  if (baseId === null || baseId === undefined) {
    return undefined;
  }
  const sections = await database.select().from(resumeSections).where(eq(resumeSections.resumeId, baseId));
  if (sections.length === 0) {
    return undefined;
  }
  const entries = await database
    .select()
    .from(resumeEntries)
    .where(inArray(resumeEntries.sectionId, sections.map((section) => section.id)));
  if (entries.length === 0) {
    return sections[0]?.kind;
  }
  const bullets = await database
    .select()
    .from(resumeBullets)
    .where(and(inArray(resumeBullets.entryId, entries.map((entry) => entry.id)), eq(resumeBullets.evidenceId, evidenceId)));
  const first = bullets[0];
  if (first === undefined) {
    return sections[0]?.kind;
  }
  const entry = entries.find((candidate) => candidate.id === first.entryId);
  const section = sections.find((candidate) => candidate.id === entry?.sectionId);
  return section?.kind ?? sections[0]?.kind;
}

async function findFirstEntryOfKind(tx: Transaction, resumeId: string, kind: string | undefined): Promise<string | undefined> {
  const sections = await tx.select().from(resumeSections).where(eq(resumeSections.resumeId, resumeId)).orderBy(asc(resumeSections.ordinal));
  const wanted = kind === undefined ? sections[0] : (sections.find((section) => section.kind === kind) ?? sections[0]);
  if (wanted === undefined) {
    return undefined;
  }
  const entries = await tx.select().from(resumeEntries).where(eq(resumeEntries.sectionId, wanted.id)).orderBy(asc(resumeEntries.ordinal));
  const first = entries[0];
  if (first !== undefined) {
    return first.id;
  }
  const [created] = await tx
    .insert(resumeEntries)
    .values({ sectionId: wanted.id, ordinal: 0, experienceId: null, educationEntryId: null, heading: null })
    .returning({ id: resumeEntries.id });
  return created?.id;
}

export function parseReviewRecord(value: unknown): ParseReviewResult {
  if (value === null || value === undefined) {
    return { ok: true, record: {} };
  }
  const parsed = adaptationReviewRecordSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, record: parsed.data };
}
