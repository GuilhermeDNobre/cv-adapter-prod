import { eq } from 'drizzle-orm';
import {
  careerProfiles,
  deniedRequirements,
  educationEntries,
  evidences,
  experiences,
  jobDescriptions,
  requirements,
  resumeSections,
  resumes,
  skills,
} from 'schema';
import type { AiClient } from '../../ai/ai-client';
import { CHARS_PER_PAGE } from 'resume-templates';
import { planAdaptationOutputSchema } from '../../ai/prompts/plan-adaptation';
import { writeSectionOutputSchema } from '../../ai/prompts/write-section';
import { draftSuggestionsOutputSchema } from '../../ai/prompts/draft-suggestions';
import { suggestTailoredSkillsOutputSchema } from '../../ai/prompts/suggest-tailored-skills';
import type { Database } from '../../database/database.provider';
import type { ResumeRepository } from '../resume.repository';
import { deriveJobTitle } from '../job-title';
import { BulletClaimReview, type SectionSelection } from './bullet-claim-review';
import { buildPlanInput, ensureEveryExperienceAllocated, resolveSectionBudgets, validatePlanOutput } from './adaptation-planner';
import type { PlannerSection } from './adaptation-planner';
import { buildSuggestionsInput, validateSuggestionsOutput } from './suggestion-drafter';
import { needsTranslation } from './language-detector';
import { normalizeSkillTerm, orderTailoredSkills, splitTechnicalAndSoftRequirements, synthesizeSections } from './section-synthesizer';
import { guardSkillProposals, type GuardedSkillProposal } from './skill-proposal-guard';
import { collectBaseExperienceOrder, saveTailoredDocument, type WrittenBullet } from './tailored-document-writer';

interface TailorJob {
  readonly resumeId: string;
  readonly userId: string;
  readonly startedAt: number;
}

interface TailorDeps {
  readonly database: Database;
  readonly aiClient: AiClient;
  readonly repository: ResumeRepository;
}

type GenerationStep = 'planning' | 'writing' | 'suggesting' | 'saving';

async function setGenerationStep(
  deps: TailorDeps,
  resumeId: string,
  step: GenerationStep | null,
): Promise<void> {
  await deps.database
    .update(resumes)
    .set({ generationStep: step, updatedAt: new Date() })
    .where(eq(resumes.id, resumeId));
  console.log('resume.generation.step', { resumeId, step });
}

export async function runTailorPipeline(deps: TailorDeps, job: TailorJob): Promise<void> {
  console.log('resume.generation.started', { resumeId: job.resumeId, kind: 'tailored', durationMs: 0, failureReason: null });
  try {
    const loaded = await loadTailorInputs(deps, job);
    if (loaded === undefined) {
      return;
    }
    await setGenerationStep(deps, job.resumeId, 'planning');
    const plan = await planAllocation(deps, { tailored: loaded.tailored, base: loaded.base, career: loaded.career, requirements: loaded.requirementRows });
    await setGenerationStep(deps, job.resumeId, 'writing');
    await setGenerationStep(deps, job.resumeId, 'suggesting');
    const [sectionsResult, suggestions, skillProposals] = await Promise.all([
      writeTailoredSections(deps, {
        document: loaded.document,
        tailored: loaded.tailored,
        career: loaded.career,
        plan,
        requirements: loaded.requirementRows,
        jobTitle: loaded.jobTitle,
        base: loaded.base,
      }),
      draftGapSuggestions(deps, { tailored: loaded.tailored, career: loaded.career, requirements: loaded.requirementRows, plan, userId: job.userId }),
      draftSkillProposals(deps, { tailoredId: loaded.tailored.id, career: loaded.career, requirements: loaded.requirementRows }),
    ]);
    const filteredSuggestions = filterMentionedSuggestions({
      suggestions,
      requirements: loaded.requirementRows,
      written: sectionsResult.written,
      experienceIds: new Set(loaded.career.experienceRows.map((row) => row.id)),
    });
    await setGenerationStep(deps, job.resumeId, 'saving');
    const claimed = await saveTailoredDocument(deps, {
      document: loaded.document,
      tailored: loaded.tailored,
      plan,
      written: sectionsResult.written,
      suggestions: filteredSuggestions,
      base: loaded.base,
      career: loaded.career,
      skills: sectionsResult.skills,
      skillProposals,
    });
    if (!claimed) {
      return;
    }
    console.log('resume.generation.completed', {
      resumeId: job.resumeId,
      kind: 'tailored',
      durationMs: Date.now() - job.startedAt,
      failureReason: null,
    });
  } catch (error) {
    await setGenerationStep(deps, job.resumeId, null);
    throw error;
  }
}

async function loadTailorInputs(deps: TailorDeps, job: TailorJob) {
  const document = await deps.repository.findDocument(job.resumeId, job.userId);
  if (document === undefined) {
    return undefined;
  }
  const tailored = document.resume;
  if (tailored.baseResumeId === null || tailored.jobDescriptionId === null) {
    throw new Error(`Tailored resume ${job.resumeId} is missing its base or job`);
  }
  const base = await deps.repository.findDocument(tailored.baseResumeId, job.userId);
  const career = await loadCareer(deps.database, job.userId);
  if (career === undefined) {
    throw new Error(`Career profile missing for resume ${job.resumeId}`);
  }
  const requirementRows = await deps.database
    .select()
    .from(requirements)
    .where(eq(requirements.jobDescriptionId, tailored.jobDescriptionId));
  const [jobRow] = await deps.database
    .select({ rawText: jobDescriptions.rawText })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.id, tailored.jobDescriptionId));
  const jobTitle = jobRow === undefined ? null : deriveJobTitle(jobRow.rawText);
  return { document, tailored, base, career, requirementRows, jobTitle };
}

async function loadCareer(database: Database, userId: string) {
  const [profile] = await database.select({ id: careerProfiles.id }).from(careerProfiles).where(eq(careerProfiles.userId, userId));
  if (profile === undefined) {
    return undefined;
  }
  const evidenceRows = await database.select().from(evidences).where(eq(evidences.careerProfileId, profile.id));
  const experienceRows = await database.select().from(experiences).where(eq(experiences.careerProfileId, profile.id));
  const educationRows = await database.select().from(educationEntries).where(eq(educationEntries.careerProfileId, profile.id));
  const skillRows = await database.select().from(skills).where(eq(skills.careerProfileId, profile.id));
  return {
    profileId: profile.id,
    evidenceById: new Map(evidenceRows.map((row) => [row.id, row] as const)),
    experienceById: new Map(experienceRows.map((row) => [row.id, row] as const)),
    educationById: new Map(educationRows.map((row) => [row.id, row] as const)),
    experienceRows,
    evidenceRows,
    skillRows,
  };
}

async function planAllocation(
  deps: TailorDeps,
  input: {
    readonly tailored: typeof resumes.$inferSelect;
    readonly base: Awaited<ReturnType<ResumeRepository['findDocument']>>;
    readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
    readonly requirements: ReadonlyArray<typeof requirements.$inferSelect>;
  },
) {
  const sections = await deps.database.select().from(resumeSections).where(eq(resumeSections.resumeId, input.tailored.id));
  const plannableSections: readonly PlannerSection[] = sections.filter(
    (section): section is typeof sections[number] & PlannerSection =>
      section.kind !== 'languages' && section.kind !== 'certifications',
  );
  const planInput = buildPlanInput({
    requirements: input.requirements.map((row) => ({ id: row.id, literalTerm: row.literalTerm, concept: row.concept, kind: row.kind })),
    evidences: [...input.career.evidenceById.values()].map((row) => {
      const experience = row.experienceId === null ? undefined : input.career.experienceById.get(row.experienceId);
      return { id: row.id, statement: row.statement, company: experience?.company ?? null, role: experience?.role ?? null, statementLength: row.statement.length };
    }),
    baseEvidenceIds: collectBaseEvidenceIds(input.base),
    sections: plannableSections.map((section) => ({ kind: section.kind })),
    template: input.tailored.template === 'dense' ? 'dense' : 'comfortable',
    lengthTarget: input.tailored.lengthTarget === 2 ? 2 : 1,
    language: input.tailored.language,
  });
  const raw = await deps.aiClient.complete({
    promptName: 'plan-adaptation',
    payload: { ...planInput },
    outputSchema: planAdaptationOutputSchema,
  });
  const budgets = resolveSectionBudgets({
    sections: plannableSections.map((s) => ({ kind: s.kind })),
    template: input.tailored.template === 'dense' ? 'dense' : 'comfortable',
    lengthTarget: input.tailored.lengthTarget === 2 ? 2 : 1,
  });
  const budgetByKind = new Map<string, number>();
  for (const budget of budgets) {
    budgetByKind.set(budget.sectionKind, (budgetByKind.get(budget.sectionKind) ?? 0) + budget.charBudget);
  }
  const validated = validatePlanOutput({
    raw,
    requirementIds: input.requirements.map((row) => row.id),
    knownEvidenceIds: new Set(input.career.evidenceById.keys()),
    evidenceLengths: new Map([...input.career.evidenceById.values()].map((row) => [row.id, row.statement.length] as const)),
    sectionBudgets: budgetByKind,
  });
  const ensured = ensureExperienceCoverage({ validated, base: input.base, career: input.career, template: input.tailored.template === 'dense' ? 'dense' : 'comfortable', lengthTarget: input.tailored.lengthTarget === 2 ? 2 : 1 });
  const allocated = new Set(ensured.allocations.flatMap((item) => item.evidenceIds));
  const baseEvidenceIds = collectBaseEvidenceIds(input.base);
  const baseIds = new Set(baseEvidenceIds);
  const added = [...allocated].filter((id) => !baseIds.has(id));
  const removed = [...baseIds].filter((id) => !allocated.has(id));
  return { ...ensured, addedEvidenceIds: added, removedEvidenceIds: removed, baseEvidenceIds };
}

function ensureExperienceCoverage(input: {
  readonly validated: { readonly allocations: ReadonlyArray<{ readonly sectionKind: 'summary' | 'experience' | 'education' | 'skills' | 'custom'; readonly evidenceIds: ReadonlyArray<string> }>; readonly coverages: ReadonlyArray<{ readonly requirementId: string; readonly coverage: 'covered' | 'partial' | 'gap'; readonly evidenceId: string | null; readonly gapKind: 'existence' | 'detail' | null }> };
  readonly base: Awaited<ReturnType<ResumeRepository['findDocument']>>;
  readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
  readonly template: 'comfortable' | 'dense';
  readonly lengthTarget: 1 | 2;
}) {
  const evidenceExperience = new Map([...input.career.evidenceById.values()].map((row) => [row.id, row.experienceId] as const));
  const evidenceIdsByExperience = collectEvidenceIdsByExperience(input.career.evidenceRows);
  const fallbackEvidenceByExperience = collectFirstEvidenceByExperience(evidenceIdsByExperience);
  const baseExperienceOrder = collectBaseExperienceOrder(input.base);
  const baseEvidenceByExperience = collectBaseEvidenceByExperience(input.base);
  const requiredExperienceIds = input.base === undefined ? collectCareerExperienceIds(input.career, evidenceIdsByExperience) : baseExperienceOrder;
  const evidenceLengths = new Map([...input.career.evidenceById.values()].map((row) => [row.id, row.statement.length] as const));
  const totalBudget = CHARS_PER_PAGE[input.template] * input.lengthTarget;
  return ensureEveryExperienceAllocated({ allocations: input.validated.allocations, coverages: input.validated.coverages, evidenceExperience, requiredExperienceIds, preferredEvidenceByExperience: baseEvidenceByExperience, fallbackEvidenceByExperience, evidenceIdsByExperience, evidenceLengths, totalBudget });
}

function collectEvidenceIdsByExperience(rows: ReadonlyArray<{ readonly id: string; readonly experienceId: string | null }>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    if (row.experienceId === null) {
      continue;
    }
    const existing = grouped.get(row.experienceId) ?? [];
    existing.push(row.id);
    grouped.set(row.experienceId, existing);
  }
  return grouped;
}

function collectFirstEvidenceByExperience(grouped: ReadonlyMap<string, readonly string[]>): Map<string, string> {
  const first = new Map<string, string>();
  for (const [experienceId, ids] of grouped) {
    if (ids.length === 0 || first.has(experienceId)) {
      continue;
    }
    first.set(experienceId, ids[0]!);
  }
  return first;
}

function collectCareerExperienceIds(career: { readonly experienceRows: ReadonlyArray<{ readonly id: string }> }, grouped: ReadonlyMap<string, readonly string[]>): string[] {
  const ids: string[] = [];
  for (const row of career.experienceRows) {
    if (!grouped.has(row.id)) {
      continue;
    }
    ids.push(row.id);
  }
  return ids;
}

function collectBaseEvidenceByExperience(base: Awaited<ReturnType<ResumeRepository['findDocument']>>): Map<string, string> {
  if (base === undefined) {
    return new Map();
  }
  const ordinalBySection = new Map(base.sections.map((section) => [section.id, section.ordinal] as const));
  const experienceSectionIds = new Set(base.sections.filter((section) => section.kind === 'experience').map((section) => section.id));
  const orderedEntries = [...base.entries].filter((entry) => experienceSectionIds.has(entry.sectionId)).sort((left, right) => {
    const sectionDiff = (ordinalBySection.get(left.sectionId) ?? 0) - (ordinalBySection.get(right.sectionId) ?? 0);
    if (sectionDiff !== 0) {
      return sectionDiff;
    }
    return left.ordinal - right.ordinal;
  });
  const bulletsByEntry = new Map<string, Array<(typeof base.bullets)[number]>>();
  for (const bullet of base.bullets) {
    const existing = bulletsByEntry.get(bullet.entryId) ?? [];
    existing.push(bullet);
    bulletsByEntry.set(bullet.entryId, existing);
  }
  const result = new Map<string, string>();
  for (const entry of orderedEntries) {
    if (entry.experienceId === null || result.has(entry.experienceId)) {
      continue;
    }
    const bullets = [...(bulletsByEntry.get(entry.id) ?? [])].sort((left, right) => left.ordinal - right.ordinal);
    for (const bullet of bullets) {
      if (bullet.evidenceId !== null) {
        result.set(entry.experienceId, bullet.evidenceId);
        break;
      }
    }
  }
  return result;
}

function collectBaseEvidenceIds(base: Awaited<ReturnType<ResumeRepository['findDocument']>>): string[] {
  if (base === undefined) {
    return [];
  }
  const ids = base.bullets.map((bullet) => bullet.evidenceId).filter((id): id is string => id !== null);
  return [...new Set(ids)];
}
function isRequirementMentioned(input: {
  literalTerm: string;
  concept: string;
  bulletTexts: readonly string[];
}): boolean {
  const normalizedLiteral = normalizeSkillTerm(input.literalTerm);
  const normalizedConcept = normalizeSkillTerm(input.concept);
  for (const bullet of input.bulletTexts) {
    const normalizedBullet = normalizeSkillTerm(bullet);
    if (normalizedLiteral !== '' && normalizedBullet.includes(normalizedLiteral)) {
      return true;
    }
    if (normalizedConcept !== '' && normalizedBullet.includes(normalizedConcept)) {
      return true;
    }
  }
  return false;
}
function filterMentionedSuggestions(input: {
  suggestions: ReadonlyArray<{ readonly requirementId: string; readonly gapKind: 'existence' | 'detail'; readonly question: string; readonly draftBullet: string; readonly experienceId?: string | null }>;
  requirements: ReadonlyArray<typeof requirements.$inferSelect>;
  written: ReadonlyArray<{ readonly bullets: ReadonlyArray<{ readonly text: string }> }>;
  experienceIds: ReadonlySet<string>;
}): Array<{ readonly requirementId: string; readonly gapKind: 'existence' | 'detail'; readonly question: string; readonly draftBullet: string; readonly experienceId: string | null }> {
  const requirementById = new Map(input.requirements.map((row) => [row.id, row]));
  const bulletTexts = input.written.flatMap((section) => section.bullets.map((bullet) => bullet.text));
  const filtered: Array<{ readonly requirementId: string; readonly gapKind: 'existence' | 'detail'; readonly question: string; readonly draftBullet: string; readonly experienceId: string | null }> = [];
  for (const suggestion of input.suggestions) {
    const requirement = requirementById.get(suggestion.requirementId);
    if (requirement === undefined) {
      continue;
    }
    if (isRequirementMentioned({ literalTerm: requirement.literalTerm, concept: requirement.concept, bulletTexts })) {
      continue;
    }
    const experienceId = suggestion.experienceId ?? null;
    filtered.push({
      requirementId: suggestion.requirementId,
      gapKind: suggestion.gapKind,
      question: suggestion.question,
      draftBullet: suggestion.draftBullet,
      experienceId: experienceId !== null && input.experienceIds.has(experienceId) ? experienceId : null,
    });
  }
  return filtered;
}

async function writeTailoredSections(
  deps: TailorDeps,
  input: {
    readonly document: NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>;
    readonly tailored: typeof resumes.$inferSelect;
    readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
    readonly plan: Awaited<ReturnType<typeof planAllocation>>;
    readonly requirements: ReadonlyArray<typeof requirements.$inferSelect>;
    readonly jobTitle: string | null;
    readonly base: Awaited<ReturnType<ResumeRepository['findDocument']>>;
  },
) {
  const sections = [...input.document.sections].sort((a, b) => a.ordinal - b.ordinal);
  const [perEvidence, synthesized] = await Promise.all([
    writeExperienceTailoredSections(deps, { document: input.document, tailored: input.tailored, career: input.career, plan: input.plan, sections }),
    writeSynthesisTailoredSections(deps, {
      document: input.document,
      tailored: input.tailored,
      career: input.career,
      plan: input.plan,
      sections,
      requirements: input.requirements,
      jobTitle: input.jobTitle,
      base: input.base,
    }),
  ]);
  const skills = collectTailoredSkillReplacements({ sections, career: input.career, requirements: input.requirements });
  return { written: [...perEvidence, ...synthesized], skills };
}

function collectTailoredSkillReplacements(input: {
  readonly sections: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly ordinal: number }>;
  readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
  readonly requirements: ReadonlyArray<typeof requirements.$inferSelect>;
}): Array<{ sectionId: string; skillIds: string[] }> {
  const ordered = orderTailoredSkills(
    input.career.skillRows.map((row) => ({
      id: row.id,
      name: row.name,
      group: row.group,
      ordinal: (row as { ordinal?: number }).ordinal ?? 0,
      createdAt: row.createdAt,
    })),
    input.requirements.map((row) => ({ literalTerm: row.literalTerm, concept: row.concept })),
  );
  return input.sections
    .filter((section) => section.kind === 'skills')
    .map((section) => ({ sectionId: section.id, skillIds: ordered.map((skill) => skill.id) }));
}

function collectExperienceTargets(
  sections: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly ordinal: number }>,
  allocationByKind: ReadonlyMap<string, readonly string[]>,
): Array<{ sectionId: string; ordinal: number; evidenceIds: readonly string[] }> {
  const seen = new Set<string>();
  const targets: Array<{ sectionId: string; ordinal: number; evidenceIds: readonly string[] }> = [];
  for (const section of sections) {
    if (section.kind !== 'experience' || seen.has(section.kind)) {
      continue;
    }
    const evidenceIds = allocationByKind.get(section.kind) ?? [];
    if (evidenceIds.length === 0) {
      continue;
    }
    seen.add(section.kind);
    targets.push({ sectionId: section.id, ordinal: section.ordinal, evidenceIds });
  }
  return targets;
}

async function writeExperienceTailoredSections(
  deps: TailorDeps,
  input: {
    readonly document: NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>;
    readonly tailored: typeof resumes.$inferSelect;
    readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
    readonly plan: Awaited<ReturnType<typeof planAllocation>>;
    readonly sections: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly ordinal: number }>;
  },
) {
  const allocationByKind = new Map(input.plan.allocations.map((item) => [item.sectionKind, item.evidenceIds]));
  const targets = collectExperienceTargets(input.sections, allocationByKind);
  const settled = await Promise.all(
    targets.map((target) =>
      writeSingleTailoredSection(deps, {
        document: input.document,
        tailored: input.tailored,
        career: input.career,
        section: { id: target.sectionId, kind: 'experience', ordinal: target.ordinal },
        evidenceIds: target.evidenceIds,
      }),
    ),
  );
  return settled.filter((written): written is NonNullable<typeof written> => written !== undefined);
}

async function writeSynthesisTailoredSections(
  deps: TailorDeps,
  input: {
    readonly document: NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>;
    readonly tailored: typeof resumes.$inferSelect;
    readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
    readonly plan: Awaited<ReturnType<typeof planAllocation>>;
    readonly sections: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly ordinal: number }>;
    readonly requirements: ReadonlyArray<typeof requirements.$inferSelect>;
    readonly jobTitle: string | null;
    readonly base: Awaited<ReturnType<ResumeRepository['findDocument']>>;
  },
) {
  const targets = collectSynthesisTargets(input.sections);
  if (targets.length === 0) {
    return [];
  }
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
  const orderedSkills = orderTailoredSkills(
    input.career.skillRows.map((row) => ({
      id: row.id,
      name: row.name,
      group: row.group,
      ordinal: (row as { ordinal?: number }).ordinal ?? 0,
      createdAt: row.createdAt,
    })),
    input.requirements.map((row) => ({ literalTerm: row.literalTerm, concept: row.concept })),
  );
  const sortedRequirements = [...input.requirements].sort((left, right) =>
    left.kind === right.kind ? left.ordinal - right.ordinal : left.kind === 'mandatory' ? -1 : 1,
  );
  const { technical, soft } = splitTechnicalAndSoftRequirements(
    orderedSkills.map((skill) => ({ name: skill.name, group: skill.group })),
    sortedRequirements.map((row) => ({ literalTerm: row.literalTerm, concept: row.concept })),
  );
  const evidenceStatements = [...input.career.evidenceById.values()].map((row) => row.statement);
  const synthesized = await synthesizeSections(
    { aiClient: deps.aiClient },
    {
      sections: targets,
      originalSummary: null,
      positions,
      education: schooling,
      skills: orderedSkills.map((skill) => ({ name: skill.name, group: skill.group })),
      tone: input.tailored.tone,
      language: input.tailored.language,
      jobTitle: input.jobTitle,
      requirements: technical,
      softRequirements: soft,
      evidenceStatements,
    },
  );
  const bySection = new Map(synthesized.map((item) => [item.sectionId, item.texts]));
  const baseSummary = collectBaseSummaryTexts(input.base);
  const results: Array<{ sectionId: string; kind: string; bullets: Array<WrittenBullet & { readonly requirementId: null }> }> = [];
  for (const target of targets) {
    const texts = bySection.get(target.sectionId) ?? [];
    const finalTexts = texts.length === 0 && baseSummary.length > 0 ? logAndFallback(target.sectionId, baseSummary) : texts;
    results.push({
      sectionId: target.sectionId,
      kind: target.kind,
      bullets: finalTexts.map((text) => ({
        evidenceId: null as string | null,
        text,
        status: 'assumed' as const,
        suggestionQuestion: null,
        requirementId: null,
        gapKind: null,
      })),
    });
  }
  return results;
}

function logAndFallback(sectionId: string, baseSummary: readonly string[]): string[] {
  console.log('resume.summary.fallback_to_base', { sectionId });
  return [...baseSummary];
}

function collectBaseSummaryTexts(
  base: Awaited<ReturnType<ResumeRepository['findDocument']>>,
): string[] {
  if (base === undefined) {
    return [];
  }
  const summaryIds = new Set(
    base.sections.filter((section) => section.kind === 'summary').map((section) => section.id),
  );
  if (summaryIds.size === 0) {
    return [];
  }
  const entries = [...base.entries]
    .filter((entry) => summaryIds.has(entry.sectionId))
    .sort((left, right) => left.ordinal - right.ordinal);
  const bulletsByEntry = new Map<string, Array<(typeof base.bullets)[number]>>();
  for (const bullet of base.bullets) {
    const existing = bulletsByEntry.get(bullet.entryId) ?? [];
    existing.push(bullet);
    bulletsByEntry.set(bullet.entryId, existing);
  }
  const texts: string[] = [];
  for (const entry of entries) {
    const bullets = [...(bulletsByEntry.get(entry.id) ?? [])].sort(
      (left, right) => left.ordinal - right.ordinal,
    );
    for (const bullet of bullets) {
      if (bullet.text.trim() !== '') {
        texts.push(bullet.text);
      }
    }
  }
  return texts;
}

function collectSynthesisTargets(
  sections: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly ordinal: number }>,
): Array<{ sectionId: string; kind: 'summary' }> {
  const targets: Array<{ sectionId: string; kind: 'summary' }> = [];
  const seen = new Set<string>();
  for (const section of [...sections].sort((left, right) => left.ordinal - right.ordinal)) {
    if (section.kind === 'summary' && !seen.has(section.kind)) {
      seen.add(section.kind);
      targets.push({ sectionId: section.id, kind: section.kind });
    }
  }
  return targets;
}

async function writeSingleTailoredSection(
  deps: TailorDeps,
  input: {
    readonly document: NonNullable<Awaited<ReturnType<ResumeRepository['findDocument']>>>;
    readonly tailored: typeof resumes.$inferSelect;
    readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
    readonly section: { readonly id: string; readonly kind: 'summary' | 'experience' | 'education' | 'skills' | 'custom'; readonly ordinal: number };
    readonly evidenceIds: readonly string[];
  },
) {
  const review = new BulletClaimReview();
  const allStatements = [...input.career.evidenceById.values()].map((row) => row.statement);
  const openComments = input.document.comments
    .filter((comment) => comment.sectionId === input.section.id && comment.resolvedAt === null)
    .map((comment) => comment.text);
  const output = await deps.aiClient.complete({
    promptName: 'write-section',
    payload: {
      evidences: input.evidenceIds.map((id) => {
        const evidence = input.career.evidenceById.get(id);
        const experience = evidence?.experienceId == null ? undefined : input.career.experienceById.get(evidence.experienceId);
        return { id, statement: evidence?.statement ?? '', company: experience?.company ?? null, role: experience?.role ?? null };
      }),
          sectionKind: input.section.kind,
      writingMethod: input.tailored.writingMethod,
      tone: input.tailored.tone,
      language: input.tailored.language,
      openComments,
    },
    outputSchema: writeSectionOutputSchema,
  });
  const selection: SectionSelection = {
    sectionId: input.section.id,
    kind: input.section.kind,
    ordinal: input.section.ordinal,
    bullets: input.evidenceIds.map((evidenceId) => ({
      bulletId: `new-${evidenceId}`,
      evidenceId,
      currentText: input.career.evidenceById.get(evidenceId)?.statement ?? '',
    })),
  };
  const updates = review.reviewClaims({
    resumeId: input.tailored.id,
    language: input.tailored.language,
    section: selection,
    document: input.document,
    career: { evidenceById: input.career.evidenceById, experienceById: input.career.experienceById, educationById: input.career.educationById },
    allStatements,
    aiBullets: output.bullets,
  });
  const fresh = toNewBullets({ updates, evidenceById: selection });
  const translated = await translateUntranslatedBullets(deps, {
    bullets: fresh,
    career: input.career,
    tailored: input.tailored,
    sectionKind: input.section.kind,
    openComments,
  });
  return { sectionId: input.section.id, kind: input.section.kind, bullets: translated };
}

async function translateUntranslatedBullets(
  deps: TailorDeps,
  input: {
    readonly bullets: ReadonlyArray<WrittenBullet & { readonly evidenceId: string; readonly requirementId: null }>;
    readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
    readonly tailored: typeof resumes.$inferSelect;
    readonly sectionKind: string;
    readonly openComments: readonly string[];
  },
) {
  const pending = input.bullets.filter((bullet) => needsTranslation(bullet.text, input.tailored.language));
  if (pending.length === 0) {
    return [...input.bullets];
  }
  const output = await deps.aiClient.complete({
    promptName: 'write-section',
    payload: {
      evidences: pending.map((bullet) => {
        const evidence = input.career.evidenceById.get(bullet.evidenceId);
        const experience = evidence?.experienceId == null ? undefined : input.career.experienceById.get(evidence.experienceId);
        return { id: bullet.evidenceId, statement: evidence?.statement ?? bullet.text, company: experience?.company ?? null, role: experience?.role ?? null };
      }),
      sectionKind: input.sectionKind,
      writingMethod: input.tailored.writingMethod,
      tone: input.tailored.tone,
      language: input.tailored.language,
      openComments: input.openComments,
    },
    outputSchema: writeSectionOutputSchema,
  });
  const translatedByEvidence = new Map(output.bullets.map((bullet) => [bullet.evidenceId, bullet.text] as const));
  return input.bullets.map((bullet) => {
    const translated = translatedByEvidence.get(bullet.evidenceId);
    if (translated === undefined) {
      return bullet;
    }
    return { ...bullet, text: translated };
  });
}

function toNewBullets(input: {
  readonly updates: ReadonlyArray<{ id: string; text: string; status: 'assumed' | 'suggestion'; suggestionQuestion: string | null; gapKind: 'detail' | null }>;
  readonly evidenceById: SectionSelection;
}): Array<WrittenBullet & { readonly evidenceId: string; readonly requirementId: null }> {
  const evidenceByTemp = new Map(input.evidenceById.bullets.map((bullet) => [`new-${bullet.evidenceId}`, bullet.evidenceId]));
  const result: Array<WrittenBullet & { readonly evidenceId: string; readonly requirementId: null }> = [];
  for (const update of input.updates) {
    const evidenceId = evidenceByTemp.get(update.id) ?? update.id.replace(/^new-/, '');
    if (evidenceId === '') {
      continue;
    }
    result.push({ evidenceId, text: update.text, status: update.status, suggestionQuestion: update.suggestionQuestion, requirementId: null, gapKind: update.gapKind });
  }
  return result;
}

function collectSuggestionExperiences(career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>): Array<{ readonly id: string; readonly company: string | null; readonly role: string | null; readonly evidenceStatements: readonly string[] }> {
  return career.experienceRows.map((experience) => ({
    id: experience.id,
    company: experience.company,
    role: experience.role,
    evidenceStatements: career.evidenceRows.filter((row) => row.experienceId === experience.id).map((row) => row.statement),
  }));
}
async function draftGapSuggestions(
  deps: TailorDeps,
  input: {
    readonly tailored: typeof resumes.$inferSelect;
    readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
    readonly requirements: ReadonlyArray<typeof requirements.$inferSelect>;
    readonly plan: Awaited<ReturnType<typeof planAllocation>>;
    readonly userId: string;
  },
) {
  try {
    const gapCoverages = input.plan.coverages.filter((item) => item.coverage === 'gap');
    if (gapCoverages.length === 0) {
      return [];
    }
    const denied = await deps.database
      .select({ normalizedConcept: deniedRequirements.normalizedConcept })
      .from(deniedRequirements)
      .where(eq(deniedRequirements.careerProfileId, input.career.profileId));
    const deniedSet = new Set(denied.map((row) => row.normalizedConcept));
    const requirementById = new Map(input.requirements.map((row) => [row.id, row]));
    const gaps = gapCoverages
      .map((coverage) => {
        const requirement = requirementById.get(coverage.requirementId);
        if (requirement === undefined || deniedSet.has(requirement.normalizedConcept)) {
          return undefined;
        }
        return {
          requirementId: requirement.id,
          literalTerm: requirement.literalTerm,
          concept: requirement.concept,
          kind: requirement.kind,
          gapKind: coverage.gapKind ?? ('existence' as const),
          adjacentCompany: input.career.experienceRows[0]?.company ?? null,
          adjacentRole: input.career.experienceRows[0]?.role ?? null,
          adjacentStatements: input.career.evidenceRows.slice(0, 3).map((row) => row.statement),
        };
      })
      .filter((gap): gap is NonNullable<typeof gap> => gap !== undefined);
    if (gaps.length === 0) {
      return [];
    }
    const experiences = collectSuggestionExperiences(input.career);
    const raw = await deps.aiClient.complete({
      promptName: 'draft-suggestions',
      payload: { ...buildSuggestionsInput({ gaps, experiences, language: input.tailored.language }) },
      outputSchema: draftSuggestionsOutputSchema,
    });
    const validated = validateSuggestionsOutput({ raw, gapIds: new Set(gaps.map((gap) => gap.requirementId)) });
    const validIds = new Set(experiences.map((experience) => experience.id));
    return validated.map((suggestion) => ({
      requirementId: suggestion.requirementId,
      gapKind: suggestion.gapKind,
      question: suggestion.question,
      draftBullet: suggestion.draftBullet,
      experienceId: suggestion.experienceId != null && validIds.has(suggestion.experienceId) ? suggestion.experienceId : null,
    }));
  } catch (error) {
    console.error('resume.gap_suggestions.failed', { resumeId: input.tailored.id, error: error instanceof Error ? error.message : 'unknown' });
    return [];
  }
}

function collectExistingGroups(skillRows: ReadonlyArray<{ readonly group: string | null }>): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const row of skillRows) {
    if (row.group === null || row.group.trim() === '') {
      continue;
    }
    if (seen.has(row.group)) {
      continue;
    }
    seen.add(row.group);
    groups.push(row.group);
  }
  return groups;
}
async function draftSkillProposals(
  deps: TailorDeps,
  input: {
    readonly tailoredId: string;
    readonly career: NonNullable<Awaited<ReturnType<typeof loadCareer>>>;
    readonly requirements: ReadonlyArray<typeof requirements.$inferSelect>;
  },
): Promise<GuardedSkillProposal[]> {
  try {
    const denied = await deps.database
      .select({ normalizedConcept: deniedRequirements.normalizedConcept })
      .from(deniedRequirements)
      .where(eq(deniedRequirements.careerProfileId, input.career.profileId));
    const deniedSet = new Set(denied.map((row) => row.normalizedConcept));
    const skillNames = new Set(input.career.skillRows.map((row) => normalizeSkillTerm(row.name)).filter((name) => name !== ''));
    const unmatched = input.requirements.filter((row) => {
      if (deniedSet.has(row.normalizedConcept)) {
        return false;
      }
      const literal = normalizeSkillTerm(row.literalTerm);
      const concept = normalizeSkillTerm(row.concept);
      return !(skillNames.has(literal) || (concept !== '' && skillNames.has(concept)));
    }).sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'mandatory' ? -1 : 1;
      }
      return left.ordinal - right.ordinal;
    });
    if (unmatched.length === 0) {
      return [];
    }
    const existingGroups = collectExistingGroups(input.career.skillRows);
    const raw = await deps.aiClient.complete({
      promptName: 'suggest-tailored-skills',
      payload: {
        skills: input.career.skillRows.map((row) => ({ name: row.name, group: row.group })),
        requirements: unmatched.map((row) => ({ literalTerm: row.literalTerm, concept: row.concept, kind: row.kind })),
        existingGroups,
      },
      outputSchema: suggestTailoredSkillsOutputSchema,
    });
    const parsed = suggestTailoredSkillsOutputSchema.safeParse(raw);
    if (!parsed.success) {
      console.error('resume.skill_proposals.failed', { resumeId: input.tailoredId, error: 'invalid_output' });
      return [];
    }
    return guardSkillProposals({
      profileSkills: input.career.skillRows.map((row) => ({ id: row.id, name: row.name, group: row.group })),
      requirements: unmatched.map((row) => ({ id: row.id, literalTerm: row.literalTerm, kind: row.kind, ordinal: row.ordinal })),
      output: parsed.data,
    });
  } catch (error) {
    console.error('resume.skill_proposals.failed', { resumeId: input.tailoredId, error: error instanceof Error ? error.message : 'unknown' });
    return [];
  }
}

export type { TailorDeps, TailorJob };
