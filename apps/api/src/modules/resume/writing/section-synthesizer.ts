import type { AiClient } from '../../ai/ai-client';
import {
  calculateExperienceYears,
  writeProfileSummaryOutputSchema,
  type ProfileSummaryEducation,
  type ProfileSummaryPosition,
  type ProfileSummaryRequirement,
  type ProfileSummarySkill,
} from '../../ai/prompts/write-profile-summary';
import { findUnsupportedClaims } from './claim-checker';
import { orderSkills } from '../skill-order';

interface SynthesisSection {
  readonly sectionId: string;
  readonly kind: 'summary';
}

interface SynthesisDeps {
  readonly aiClient: AiClient;
}

interface SynthesisInput {
  readonly sections: readonly SynthesisSection[];
  readonly originalSummary: string | null;
  readonly positions: readonly ProfileSummaryPosition[];
  readonly education: readonly ProfileSummaryEducation[];
  readonly skills: readonly ProfileSummarySkill[];
  readonly tone: string;
  readonly language: string;
  readonly jobTitle?: string | null;
  readonly requirements?: readonly ProfileSummaryRequirement[];
  readonly softRequirements?: readonly ProfileSummaryRequirement[];
  readonly evidenceStatements?: readonly string[];
}

const COMBINING_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const WHITESPACE_PATTERN = /\s+/g;

export function normalizeSkillTerm(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ');
}

export interface OrderedSkill {
  readonly id: string;
  readonly name: string;
  readonly group: string | null;
  readonly ordinal?: number;
  readonly createdAt: Date;
}

export function orderProfileSkills<T extends OrderedSkill>(skills: readonly T[]): T[] {
  return orderSkills(skills);
}

export function orderTailoredSkills<T extends OrderedSkill>(
  skills: readonly T[],
  requirements: readonly { readonly literalTerm: string; readonly concept: string }[],
): T[] {
  const ordered = orderProfileSkills(skills);
  const requirementTerms = new Set<string>();
  for (const requirement of requirements) {
    requirementTerms.add(normalizeSkillTerm(requirement.literalTerm));
    requirementTerms.add(normalizeSkillTerm(requirement.concept));
  }
  const matched: T[] = [];
  const rest: T[] = [];
  for (const skill of ordered) {
    if (requirementTerms.has(normalizeSkillTerm(skill.name))) {
      matched.push(skill);
    } else {
      rest.push(skill);
    }
  }
  return [...matched, ...rest];
}

const MINIMUM_SUMMARY_SENTENCES = 2;

export function buildSummaryClaimSources(input: {
  readonly originalSummary: string | null;
  readonly positions: readonly ProfileSummaryPosition[];
  readonly education: readonly ProfileSummaryEducation[];
  readonly skills: readonly ProfileSummarySkill[];
  readonly jobTitle?: string | null;
  readonly requirements?: readonly ProfileSummaryRequirement[];
  readonly evidenceStatements?: readonly string[];
}): string[] {
  const sources: string[] = [];
  if (input.originalSummary !== null && input.originalSummary.trim() !== '') {
    sources.push(input.originalSummary);
  }
  for (const position of input.positions) {
    if (position.role.trim() !== '') {
      sources.push(position.role);
    }
    if (position.company.trim() !== '') {
      sources.push(position.company);
    }
    sources.push(`${position.role} ${position.company}`.trim());
  }
  for (const entry of input.education) {
    if (entry.institution.trim() !== '') {
      sources.push(entry.institution);
    }
    if (entry.degree.trim() !== '') {
      sources.push(entry.degree);
    }
  }
  for (const skill of input.skills) {
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
  for (const term of collectMatchingRequirementTerms(input.skills, input.requirements ?? [])) {
    sources.push(term);
  }
  for (const statement of input.evidenceStatements ?? []) {
    if (statement.trim() !== '') {
      sources.push(statement);
    }
  }
  sources.push('Desenvolvedor', 'Desenvolvedora', 'Desenvolvedor(a)');
  sources.push('Engenheiro de Software', 'Engenheira de Software', 'Engenheiro(a) de Software');
  sources.push('Estudante');
  sources.push('Developer', 'Software Engineer', 'Student');
  const years = calculateExperienceYears(input.positions);
  sources.push(String(years), `${years} anos`, `${years} years`);
  if (years === 1) {
    sources.push('1 ano', '1 year');
  }
  return sources.filter((source) => source.trim() !== '');
}

export function splitTechnicalAndSoftRequirements(
  skills: readonly ProfileSummarySkill[],
  requirements: readonly ProfileSummaryRequirement[],
): { technical: ProfileSummaryRequirement[]; soft: ProfileSummaryRequirement[] } {
  const skillNames = new Set<string>();
  for (const skill of skills) {
    const normalized = normalizeSkillTerm(skill.name);
    if (normalized !== '') {
      skillNames.add(normalized);
    }
  }
  const technical: ProfileSummaryRequirement[] = [];
  const soft: ProfileSummaryRequirement[] = [];
  for (const requirement of requirements) {
    const matches =
      skillNames.has(normalizeSkillTerm(requirement.literalTerm)) ||
      skillNames.has(normalizeSkillTerm(requirement.concept));
    if (matches) {
      technical.push(requirement);
    } else {
      soft.push(requirement);
    }
  }
  return { technical, soft };
}

export async function synthesizeSections(
  deps: SynthesisDeps,
  input: SynthesisInput,
): Promise<Array<{ sectionId: string; texts: string[] }>> {
  const results: Array<{ sectionId: string; texts: string[] }> = [];
  await Promise.all(
    input.sections.map(async (section) => {
      const texts = await synthesizeSingleSection(deps, {
        section,
        originalSummary: input.originalSummary,
        positions: input.positions,
        education: input.education,
        skills: input.skills,
        tone: input.tone,
        language: input.language,
        jobTitle: input.jobTitle ?? null,
        requirements: input.requirements ?? [],
        softRequirements: input.softRequirements ?? [],
        evidenceStatements: input.evidenceStatements ?? [],
      });
      results.push({ sectionId: section.sectionId, texts });
    }),
  );
  return results;
}

function collectMatchingRequirementTerms(
  skills: readonly ProfileSummarySkill[],
  requirements: readonly ProfileSummaryRequirement[],
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

async function synthesizeSingleSection(
  deps: SynthesisDeps,
  input: {
    readonly section: SynthesisSection;
    readonly originalSummary: string | null;
    readonly positions: readonly ProfileSummaryPosition[];
    readonly education: readonly ProfileSummaryEducation[];
    readonly skills: readonly ProfileSummarySkill[];
    readonly tone: string;
    readonly language: string;
    readonly jobTitle: string | null;
    readonly requirements: readonly ProfileSummaryRequirement[];
    readonly softRequirements: readonly ProfileSummaryRequirement[];
    readonly evidenceStatements: readonly string[];
  },
): Promise<string[]> {
  const sources = buildSummaryClaimSources({
    originalSummary: input.originalSummary,
    positions: input.positions,
    education: input.education,
    skills: input.skills,
    jobTitle: input.jobTitle,
    requirements: input.requirements,
    evidenceStatements: input.evidenceStatements,
  });
  const output = await deps.aiClient.complete({
    promptName: 'write-profile-summary',
    payload: {
      originalSummary: input.originalSummary,
      positions: input.positions.map((position) => ({ ...position })),
      education: input.education.map((entry) => ({ ...entry })),
      skills: input.skills.map((skill) => ({ ...skill })),
      language: input.language,
      tone: input.tone,
      jobTitle: input.jobTitle,
      requirements: input.requirements.map((requirement) => ({ ...requirement })),
      softRequirements: input.softRequirements.map((requirement) => ({ ...requirement })),
    },
    outputSchema: writeProfileSummaryOutputSchema,
  });
  const first = keepSupportedTexts(output.bullets, sources, input.section.sectionId);
  if (first.texts.length >= MINIMUM_SUMMARY_SENTENCES) {
    return first.texts;
  }
  const retry = await deps.aiClient.complete({
    promptName: 'write-profile-summary',
    payload: {
      originalSummary: input.originalSummary,
      positions: input.positions.map((position) => ({ ...position })),
      education: input.education.map((entry) => ({ ...entry })),
      skills: input.skills.map((skill) => ({ ...skill })),
      language: input.language,
      tone: input.tone,
      jobTitle: input.jobTitle,
      requirements: input.requirements.map((requirement) => ({ ...requirement })),
      softRequirements: input.softRequirements.map((requirement) => ({ ...requirement })),
      rejectedTerms: [...first.rejectedTerms],
    },
    outputSchema: writeProfileSummaryOutputSchema,
  });
  const second = keepSupportedTexts(retry.bullets, sources, input.section.sectionId);
  if (second.texts.length < MINIMUM_SUMMARY_SENTENCES) {
    console.log('resume.summary.too_short', {
      sectionId: input.section.sectionId,
      kept: second.texts.length,
    });
  }
  return second.texts;
}

function keepSupportedTexts(
  bullets: ReadonlyArray<{ text: string }>,
  sources: readonly string[],
  sectionId: string,
): { texts: string[]; rejectedTerms: string[] } {
  const texts: string[] = [];
  const rejected: string[] = [];
  for (const bullet of bullets) {
    const unsupported = findUnsupportedClaims(bullet.text, sources);
    if (unsupported.length === 0) {
      texts.push(bullet.text);
    } else {
      const terms = unsupported.map((claim) => claim.value);
      rejected.push(...terms);
      console.log('resume.summary.claim_rejected', { sectionId, unsupported: terms });
    }
  }
  return { texts, rejectedTerms: [...new Set(rejected)] };
}
