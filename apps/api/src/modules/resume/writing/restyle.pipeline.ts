import { eq } from 'drizzle-orm';
import { careerProfiles, skills } from 'schema';
import type { AiClient } from '../../ai/ai-client';
import { writeSectionOutputSchema } from '../../ai/prompts/write-section';
import type { Database } from '../../database/database.provider';
import type { ResumeRepository } from '../resume.repository';
import { BulletClaimReview, type CareerContext, type SectionSelection } from './bullet-claim-review';
import { loadResumeCareerMaps } from './resume-career.loader';
import { orderProfileSkills, synthesizeSections } from './section-synthesizer';

interface RestyleJob {
  readonly resumeId: string;
  readonly userId: string;
  readonly startedAt: number;
}

interface RestyleDeps {
  readonly database: Database;
  readonly aiClient: AiClient;
  readonly repository: ResumeRepository;
}

type RestyleDocument = NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>;

export async function runRestylePipeline(deps: RestyleDeps, job: RestyleJob): Promise<void> {
  console.log('resume.generation.started', {
    resumeId: job.resumeId,
    kind: 'restyle',
    durationMs: 0,
    failureReason: null,
  });
  const document = await deps.repository.findDocument(job.resumeId, job.userId);
  if (document === undefined) {
    return;
  }
  const career = await loadResumeCareerMaps(deps.database, job.userId);
  if (career === undefined) {
    throw new Error(`Career profile missing for resume ${job.resumeId}`);
  }
  const profileSkills = await loadProfileSkills(deps.database, job.userId);
  const allStatements = collectRestyleStatements(document, career);
  const [updates, synthesis] = await Promise.all([
    rewriteRestyleExperience(deps, { document, career, allStatements }),
    synthesizeRestyleSections(deps, { document, career, profileSkills }),
  ]);
  const skillReplacements = document.sections
    .filter((section) => section.kind === 'skills')
    .map((section) => ({
      sectionId: section.id,
      skillIds: orderProfileSkills(profileSkills).map((skill) => skill.id),
    }));
  const claimed = await deps.repository.replaceSynthesisAndMarkReady({
    resumeId: job.resumeId,
    synthesis,
    updates,
    skills: skillReplacements,
  });
  if (!claimed) {
    return;
  }
  console.log('resume.generation.completed', {
    resumeId: job.resumeId,
    kind: 'restyle',
    durationMs: Date.now() - job.startedAt,
    failureReason: null,
  });
}

function collectRestyleStatements(document: RestyleDocument, career: CareerContext): string[] {
  const statements: string[] = [];
  for (const bullet of document.bullets) {
    if (bullet.evidenceId === null) {
      continue;
    }
    const evidence = career.evidenceById.get(bullet.evidenceId);
    if (evidence !== undefined) {
      statements.push(evidence.statement);
    }
  }
  return statements;
}

async function rewriteRestyleExperience(
  deps: RestyleDeps,
  input: { document: RestyleDocument; career: CareerContext; allStatements: readonly string[] },
) {
  const selections = collectExperienceSelections(input.document);
  const updates: Array<{ id: string; text: string; status: 'assumed' | 'suggestion'; suggestionQuestion: string | null; gapKind: 'detail' | null }> = [];
  for (const selection of selections) {
    const rewritten = await rewriteExperienceSection(deps, {
      document: input.document,
      career: input.career,
      allStatements: input.allStatements,
      selection,
    });
    updates.push(...rewritten);
  }
  return updates;
}

function collectExperienceSelections(document: RestyleDocument): SectionSelection[] {
  const entryById = new Map(document.entries.map((entry) => [entry.id, entry]));
  const bulletsBySection = new Map<string, Array<{ bulletId: string; evidenceId: string; currentText: string }>>();
  for (const bullet of document.bullets) {
    if (bullet.editedByPerson || bullet.evidenceId === null) {
      continue;
    }
    const entry = entryById.get(bullet.entryId);
    if (entry === undefined) {
      continue;
    }
    const section = document.sections.find((item) => item.id === entry.sectionId);
    if (section === undefined || section.kind !== 'experience') {
      continue;
    }
    const existing = bulletsBySection.get(section.id) ?? [];
    existing.push({ bulletId: bullet.id, evidenceId: bullet.evidenceId, currentText: bullet.text });
    bulletsBySection.set(section.id, existing);
  }
  const selections: SectionSelection[] = [];
  for (const section of document.sections) {
    if (section.kind !== 'experience') {
      continue;
    }
    const bullets = bulletsBySection.get(section.id) ?? [];
    if (bullets.length > 0) {
      selections.push({ sectionId: section.id, kind: section.kind, ordinal: section.ordinal, bullets });
    }
  }
  return selections;
}

async function rewriteExperienceSection(
  deps: RestyleDeps,
  input: { document: RestyleDocument; career: CareerContext; allStatements: readonly string[]; selection: SectionSelection },
) {
  const review = new BulletClaimReview();
  const output = await deps.aiClient.complete({
    promptName: 'write-section',
    payload: {
      evidences: input.selection.bullets.map((bullet) => {
        const evidence = input.career.evidenceById.get(bullet.evidenceId);
        const experience =
          evidence?.experienceId === null || evidence?.experienceId === undefined
            ? undefined
            : input.career.experienceById.get(evidence.experienceId);
        return {
          id: bullet.evidenceId,
          statement: evidence?.statement ?? '',
          company: experience?.company ?? null,
          role: experience?.role ?? null,
        };
      }),
      sectionKind: 'experience',
      writingMethod: input.document.resume.writingMethod,
      tone: input.document.resume.tone,
      language: input.document.resume.language,
      openComments: [],
    },
    outputSchema: writeSectionOutputSchema,
  });
  return review.reviewClaims({
    resumeId: input.document.resume.id,
    language: input.document.resume.language,
    section: input.selection,
    document: input.document,
    career: input.career,
    allStatements: input.allStatements,
    aiBullets: output.bullets,
  });
}

async function synthesizeRestyleSections(
  deps: RestyleDeps,
  input: { document: RestyleDocument; career: CareerContext; profileSkills: Array<{ id: string; name: string; group: string | null; createdAt: Date }> },
): Promise<Array<{ sectionId: string; bullets: Array<{ text: string; editedByPerson: boolean }> }>> {
  const targets = input.document.sections
    .filter((section) => section.kind === 'summary')
    .map((section) => ({ sectionId: section.id, kind: 'summary' as const }));
  if (targets.length === 0) {
    return [];
  }
  const keptBySection = collectEditedSynthesisBullets(input.document);
  const positions = [...input.career.experienceById.values()].map((row) => ({
    role: row.role,
    company: row.company,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
  }));
  const schooling = [...input.career.educationById.values()].map((row) => ({
    institution: row.institution,
    degree: row.degree,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
  }));
  const ordered = orderProfileSkills(input.profileSkills);
  const synthesized = await synthesizeSections(
    { aiClient: deps.aiClient },
    {
      sections: targets,
      originalSummary: null,
      positions,
      education: schooling,
      skills: ordered.map((skill) => ({ name: skill.name, group: skill.group })),
      tone: input.document.resume.tone,
      language: input.document.resume.language,
    },
  );
  const textsBySection = new Map(synthesized.map((item) => [item.sectionId, item.texts]));
  return targets.map((target) => ({
    sectionId: target.sectionId,
    bullets: [
      ...(keptBySection.get(target.sectionId) ?? []).map((text) => ({ text, editedByPerson: true })),
      ...(textsBySection.get(target.sectionId) ?? []).map((text) => ({ text, editedByPerson: false })),
    ],
  }));
}

function collectEditedSynthesisBullets(document: RestyleDocument): Map<string, string[]> {
  const sectionIds = new Set(
    document.sections.filter((section) => section.kind === 'summary').map((section) => section.id),
  );
  const entrySections = new Map(document.entries.map((entry) => [entry.id, entry.sectionId]));
  const kept = new Map<string, string[]>();
  for (const bullet of document.bullets) {
    const sectionId = entrySections.get(bullet.entryId);
    if (sectionId === undefined || !sectionIds.has(sectionId) || !bullet.editedByPerson) {
      continue;
    }
    const existing = kept.get(sectionId) ?? [];
    existing.push(bullet.text);
    kept.set(sectionId, existing);
  }
  return kept;
}

async function loadProfileSkills(
  database: Database,
  userId: string,
): Promise<Array<{ id: string; name: string; group: string | null; createdAt: Date }>> {
  const [profile] = await database
    .select({ id: careerProfiles.id })
    .from(careerProfiles)
    .where(eq(careerProfiles.userId, userId));
  if (profile === undefined) {
    return [];
  }
  return database.select().from(skills).where(eq(skills.careerProfileId, profile.id));
}

export type { RestyleDeps, RestyleJob };
