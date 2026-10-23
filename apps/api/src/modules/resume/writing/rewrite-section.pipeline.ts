import type { AiClient } from '../../ai/ai-client';
import { synthesizeSectionOutputSchema } from '../../ai/prompts/synthesize-section';
import { writeSectionOutputSchema } from '../../ai/prompts/write-section';
import type { Database } from '../../database/database.provider';
import type { ResumeRepository } from '../resume.repository';
import { BulletClaimReview, type SectionSelection } from './bullet-claim-review';
import { findUnsupportedClaims } from './claim-checker';
import { loadResumeCareerMaps, type ResumeCareerMaps } from './resume-career.loader';

interface RewriteJob {
  readonly resumeId: string;
  readonly userId: string;
  readonly sectionId: string;
  readonly instruction: string;
  readonly startedAt: number;
}

interface RewriteDeps {
  readonly database: Database;
  readonly aiClient: AiClient;
  readonly repository: ResumeRepository;
}

type RewriteDocument = NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>;
type DocumentSection = RewriteDocument['sections'][number];

interface RewriteTarget {
  readonly document: RewriteDocument;
  readonly section: DocumentSection;
  readonly career: ResumeCareerMaps;
  readonly selection: SectionSelection;
}

export async function runRewriteSectionPipeline(deps: RewriteDeps, job: RewriteJob): Promise<void> {
  console.log('resume.generation.started', { resumeId: job.resumeId, kind: 'rewrite', durationMs: 0, failureReason: null });
  const target = await loadRewriteTarget(deps, job);
  if (target === undefined) {
    return;
  }
  if (target.selection.bullets.length > 0) {
    await rewriteWithEvidence(deps, job, target);
    return;
  }
  const currentText = collectSectionCurrentText(target.document, target.section.id);
  if (currentText.trim() === '') {
    await markNothingToRewrite(deps, job);
    return;
  }
  await rewriteWithSynthesis(deps, job, target, currentText);
}

async function rewriteWithEvidence(deps: RewriteDeps, job: RewriteJob, target: RewriteTarget): Promise<void> {
  const updates = await writeRewrittenBullets(deps, job, target);
  const claimed = await deps.repository.updateBulletsAndMarkReady(job.resumeId, updates);
  if (!claimed) {
    return;
  }
  console.log('resume.generation.completed', { resumeId: job.resumeId, kind: 'rewrite', durationMs: Date.now() - job.startedAt, failureReason: null });
}

async function rewriteWithSynthesis(deps: RewriteDeps, job: RewriteJob, target: RewriteTarget, currentText: string): Promise<void> {
  const sources = collectSynthesisSources(target);
  const output = await deps.aiClient.complete({
    promptName: 'synthesize-section',
    payload: {
      sources,
      sectionKind: target.section.kind,
      tone: target.document.resume.tone,
      language: target.document.resume.language,
      instruction: job.instruction,
      currentText,
    },
    outputSchema: synthesizeSectionOutputSchema,
  });
  const kept = filterSupportedSynthesis(output.bullets, [...sources, currentText], target.section.id);
  if (kept.length === 0) {
    await markClaimsRejected(deps, job);
    return;
  }
  const synthesis = [{ sectionId: target.section.id, bullets: kept.map((text) => ({ text, editedByPerson: false })) }];
  const claimed = await deps.repository.replaceSynthesisAndMarkReady({ resumeId: job.resumeId, synthesis, updates: [] });
  if (!claimed) {
    return;
  }
  console.log('resume.generation.completed', { resumeId: job.resumeId, kind: 'rewrite', durationMs: Date.now() - job.startedAt, failureReason: null });
}

function filterSupportedSynthesis(bullets: ReadonlyArray<{ text: string }>, sources: readonly string[], sectionId: string): string[] {
  const kept: string[] = [];
  for (const bullet of bullets) {
    const unsupported = findUnsupportedClaims(bullet.text, sources);
    if (unsupported.length === 0) {
      kept.push(bullet.text);
    } else {
      console.log('resume.rewrite.claim_rejected', { sectionId, unsupported: unsupported.map((claim) => claim.value) });
    }
  }
  return kept;
}

async function markClaimsRejected(deps: RewriteDeps, job: RewriteJob): Promise<void> {
  const claimed = await deps.repository.markReadyWithNotice(job.resumeId, 'rewrite_claims_rejected');
  if (!claimed) {
    return;
  }
  console.log('resume.generation.completed', { resumeId: job.resumeId, kind: 'rewrite', durationMs: Date.now() - job.startedAt, failureReason: 'rewrite_claims_rejected' });
}

async function markNothingToRewrite(deps: RewriteDeps, job: RewriteJob): Promise<void> {
  const claimed = await deps.repository.markReadyWithNotice(job.resumeId, 'nothing_to_rewrite');
  if (!claimed) {
    return;
  }
  console.log('resume.generation.completed', { resumeId: job.resumeId, kind: 'rewrite', durationMs: Date.now() - job.startedAt, failureReason: 'nothing_to_rewrite' });
}

function collectSectionCurrentText(document: RewriteDocument, sectionId: string): string {
  const entries = document.entries.filter((entry) => entry.sectionId === sectionId).sort((left, right) => left.ordinal - right.ordinal);
  const texts: string[] = [];
  for (const entry of entries) {
    const bullets = document.bullets.filter((bullet) => bullet.entryId === entry.id).sort((left, right) => left.ordinal - right.ordinal);
    for (const bullet of bullets) {
      texts.push(bullet.text);
    }
  }
  return texts.join('\n');
}

function collectSynthesisSources(target: RewriteTarget): string[] {
  return [...target.career.evidenceById.values()].map((row) => row.statement);
}

async function loadRewriteTarget(deps: RewriteDeps, job: RewriteJob): Promise<RewriteTarget | undefined> {
  const document = await deps.repository.findDocument(job.resumeId, job.userId);
  if (document === undefined) {
    return undefined;
  }
  const section = document.sections.find((item) => item.id === job.sectionId);
  if (section === undefined) {
    throw new Error(`Section ${job.sectionId} not found in resume ${job.resumeId}`);
  }
  const career = await loadResumeCareerMaps(deps.database, job.userId);
  if (career === undefined) {
    throw new Error(`Career profile missing for resume ${job.resumeId}`);
  }
  const selection = collectSectionSelection(document, section.id, section.kind, section.ordinal);
  return { document, section, career, selection };
}

async function writeRewrittenBullets(deps: RewriteDeps, job: RewriteJob, target: RewriteTarget) {
  const allStatements = [...target.career.evidenceById.values()].map((row) => row.statement);
  const output = await deps.aiClient.complete({
    promptName: 'write-section',
    payload: {
      evidences: buildSectionEvidences(target),
      sectionKind: target.section.kind,
      writingMethod: target.document.resume.writingMethod,
      tone: target.document.resume.tone,
      language: target.document.resume.language,
      openComments: [],
      instruction: job.instruction,
    },
    outputSchema: writeSectionOutputSchema,
  });
  const review = new BulletClaimReview();
  return review.reviewClaims({
    resumeId: job.resumeId,
    language: target.document.resume.language,
    section: target.selection,
    document: target.document,
    career: target.career,
    allStatements,
    aiBullets: output.bullets,
  });
}

function buildSectionEvidences(target: RewriteTarget) {
  return target.selection.bullets.map((bullet) => {
    const evidence = target.career.evidenceById.get(bullet.evidenceId);
    const experience =
      evidence?.experienceId === null || evidence?.experienceId === undefined
        ? undefined
        : target.career.experienceById.get(evidence.experienceId);
    return {
      id: bullet.evidenceId,
      statement: evidence?.statement ?? '',
      company: experience?.company ?? null,
      role: experience?.role ?? null,
    };
  });
}

function collectSectionSelection(document: RewriteDocument, sectionId: string, kind: string, ordinal: number): SectionSelection {
  const entryIds = new Set(
    document.entries.filter((entry) => entry.sectionId === sectionId).map((entry) => entry.id),
  );
  const bullets = document.bullets
    .filter((bullet) => entryIds.has(bullet.entryId) && bullet.evidenceId !== null)
    .map((bullet) => ({ bulletId: bullet.id, evidenceId: bullet.evidenceId as string, currentText: bullet.text }));
  return { sectionId, kind, ordinal, bullets };
}

export type { RewriteDeps, RewriteJob };
