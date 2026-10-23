import type { educationEntries, evidences, experiences } from 'schema';
import type { BulletUpdate, ResumeDocument } from '../resume.repository';
import { calculateExperienceYears } from '../../ai/prompts/write-profile-summary';
import { findUnsupportedClaims } from './claim-checker';
import { normalizeSkillTerm } from './section-synthesizer';

export interface SectionBullet {
  readonly bulletId: string;
  readonly evidenceId: string;
  readonly currentText: string;
}

export interface SectionSelection {
  readonly sectionId: string;
  readonly kind: string;
  readonly ordinal: number;
  readonly bullets: ReadonlyArray<SectionBullet>;
}

export interface CareerSkill {
  readonly name: string;
  readonly group: string | null;
  readonly id?: string;
  readonly ordinal?: number;
  readonly createdAt?: Date;
}

export interface CareerContext {
  readonly evidenceById: Map<string, typeof evidences.$inferSelect>;
  readonly experienceById: Map<string, typeof experiences.$inferSelect>;
  readonly educationById: Map<string, typeof educationEntries.$inferSelect>;
  readonly skills?: readonly CareerSkill[];
}

export interface AiBullet {
  readonly evidenceId: string;
  readonly text: string;
}

export interface ClaimReviewInput {
  readonly resumeId: string;
  readonly language: string;
  readonly section: SectionSelection;
  readonly document: ResumeDocument;
  readonly career: CareerContext;
  readonly allStatements: readonly string[];
  readonly aiBullets: ReadonlyArray<AiBullet>;
  readonly originalSummary?: string | null;
  readonly jobTitle?: string | null;
  readonly requirements?: readonly { readonly literalTerm: string; readonly concept: string }[];
}

interface SingleReviewInput {
  readonly resumeId: string;
  readonly language: string;
  readonly sectionKind: string;
  readonly target: SectionBullet;
  readonly text: string;
  readonly evidenceId: string;
  readonly document: ResumeDocument;
  readonly career: CareerContext;
  readonly allStatements: readonly string[];
  readonly originalSummary?: string | null;
  readonly jobTitle?: string | null;
  readonly requirements?: readonly { readonly literalTerm: string; readonly concept: string }[];
}

interface ClaimSourcesInput {
  readonly sectionKind: string;
  readonly evidenceId: string;
  readonly document: ResumeDocument;
  readonly career: CareerContext;
  readonly allStatements: readonly string[];
  readonly originalSummary?: string | null;
  readonly jobTitle?: string | null;
  readonly requirements?: readonly { readonly literalTerm: string; readonly concept: string }[];
}

interface MissingUpdatesInput {
  readonly section: SectionSelection;
  readonly seen: ReadonlySet<string>;
}

export class BulletClaimReview {
  reviewClaims(input: ClaimReviewInput): BulletUpdate[] {
    const bulletByEvidence = new Map(input.section.bullets.map((bullet) => [bullet.evidenceId, bullet]));
    const seen = new Set<string>();
    const updates: BulletUpdate[] = [];
    for (const aiBullet of input.aiBullets) {
      if (seen.has(aiBullet.evidenceId)) {
        continue;
      }
      seen.add(aiBullet.evidenceId);
      const target = bulletByEvidence.get(aiBullet.evidenceId);
      if (target === undefined) {
        continue;
      }
      updates.push(
        this.reviewSingleBullet({
          resumeId: input.resumeId,
          language: input.language,
          sectionKind: input.section.kind,
          target,
          text: aiBullet.text,
          evidenceId: aiBullet.evidenceId,
          document: input.document,
          career: input.career,
          allStatements: input.allStatements,
          originalSummary: input.originalSummary ?? null,
          jobTitle: input.jobTitle ?? null,
          requirements: input.requirements ?? [],
        }),
      );
    }
    for (const missing of this.collectMissingUpdates({ section: input.section, seen })) {
      updates.push(missing);
    }
    return updates;
  }

  private reviewSingleBullet(input: SingleReviewInput): BulletUpdate {
    const sources = this.buildClaimSources({
      sectionKind: input.sectionKind,
      evidenceId: input.evidenceId,
      document: input.document,
      career: input.career,
      allStatements: input.allStatements,
      originalSummary: input.originalSummary ?? null,
      jobTitle: input.jobTitle ?? null,
      requirements: input.requirements ?? [],
    });
    const unsupported = findUnsupportedClaims(input.text, sources);
    if (unsupported.length === 0) {
      return { id: input.target.bulletId, text: input.text, status: 'assumed', suggestionQuestion: null, gapKind: null };
    }
    const [firstClaim] = unsupported;
    console.log('resume.claim_rejected', {
      resumeId: input.resumeId,
      bulletId: input.target.bulletId,
      claimKind: firstClaim?.kind ?? 'number',
    });
    return {
      id: input.target.bulletId,
      text: input.text,
      status: 'suggestion',
      suggestionQuestion: this.buildMissingDataQuestion(
        input.language,
        unsupported.map((claim: { value: string }) => claim.value),
      ),
      gapKind: 'detail',
    };
  }

  private collectMissingUpdates(input: MissingUpdatesInput): BulletUpdate[] {
    const updates: BulletUpdate[] = [];
    for (const bullet of input.section.bullets) {
      if (!input.seen.has(bullet.evidenceId)) {
        updates.push({
          id: bullet.bulletId,
          text: bullet.currentText,
          status: 'assumed',
          suggestionQuestion: null,
          gapKind: null,
        });
      }
    }
    return updates;
  }

  private buildClaimSources(input: ClaimSourcesInput): string[] {
    if (input.sectionKind === 'summary') {
      return buildSummarySources(input);
    }
    if (input.sectionKind === 'skills') {
      return [...input.allStatements];
    }
    const evidence = input.career.evidenceById.get(input.evidenceId);
    if (evidence === undefined) {
      return [...input.allStatements];
    }
    if (input.sectionKind === 'education') {
      const entry = input.document.entries.find(
        (item: (typeof input.document.entries)[number]) => item.educationEntryId !== null,
      );
      const education =
        entry?.educationEntryId === null || entry?.educationEntryId === undefined
          ? undefined
          : input.career.educationById.get(entry.educationEntryId);
      return [evidence.statement, education?.institution ?? '', education?.degree ?? ''].filter(
        (source: string) => source !== '',
      );
    }
    const experience =
      evidence.experienceId === null ? undefined : input.career.experienceById.get(evidence.experienceId);
    return [evidence.statement, experience?.company ?? '', experience?.role ?? ''].filter(
      (source: string) => source !== '',
    );
  }

  private buildMissingDataQuestion(language: string, missingValues: readonly string[]): string {
    const [first] = missingValues;
    const quoted = first === undefined ? '' : ` "${first}"`;
    if (language === 'pt') {
      return `Você pode informar a fonte de${quoted}?`;
    }
    return `Can you provide the source for${quoted}?`;
  }
}

function buildSummarySources(input: ClaimSourcesInput): string[] {
  const sources = [...input.allStatements];
  if (input.originalSummary !== null && input.originalSummary !== undefined) {
    const trimmed = input.originalSummary.trim();
    if (trimmed !== '') {
      sources.push(trimmed);
    }
  }
  for (const experience of input.career.experienceById.values()) {
    if (experience.role.trim() !== '') {
      sources.push(experience.role);
    }
    if (experience.company.trim() !== '') {
      sources.push(experience.company);
    }
  }
  for (const entry of input.career.educationById.values()) {
    if (entry.institution.trim() !== '') {
      sources.push(entry.institution);
    }
    if (entry.degree.trim() !== '') {
      sources.push(entry.degree);
    }
  }
  for (const skill of input.career.skills ?? []) {
    if (skill.name.trim() !== '') {
      sources.push(skill.name);
    }
    if (skill.group !== null && skill.group.trim() !== '') {
      sources.push(skill.group);
    }
  }
  if (input.jobTitle !== null && input.jobTitle !== undefined && input.jobTitle.trim() !== '') {
    sources.push(input.jobTitle);
  }
  for (const term of collectMatchingRequirementTerms(input.career.skills ?? [], input.requirements ?? [])) {
    sources.push(term);
  }
  sources.push('Desenvolvedor', 'Desenvolvedora', 'Desenvolvedor(a)');
  sources.push('Engenheiro de Software', 'Engenheira de Software', 'Engenheiro(a) de Software');
  sources.push('Estudante');
  sources.push('Developer', 'Software Engineer', 'Student');
  const years = calculateExperienceYears(
    [...input.career.experienceById.values()].map((row) => ({
      startedOn: row.startedOn,
      endedOn: row.endedOn,
    })),
  );
  sources.push(String(years), `${years} anos`, `${years} years`);
  if (years === 1) {
    sources.push('1 ano', '1 year');
  }
  return sources;
}

function collectMatchingRequirementTerms(
  skills: readonly { readonly name: string }[],
  requirements: readonly { readonly literalTerm: string; readonly concept: string }[],
): string[] {
  const skillNames = new Set<string>();
  for (const skill of skills) {
    const normalized = normalizeSkillTerm(skill.name);
    if (normalized !== '') {
      skillNames.add(normalized);
    }
  }
  const matched: string[] = [];
  const seen = new Set<string>();
  for (const requirement of requirements) {
    for (const term of [requirement.literalTerm, requirement.concept]) {
      const normalized = normalizeSkillTerm(term);
      if (normalized === '' || !skillNames.has(normalized) || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      matched.push(term);
    }
  }
  return matched;
}
