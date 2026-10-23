import type { JobDescriptionResponse, RequirementResponse } from 'schema/contracts/job-description';
import type { ParseJobDescriptionOutput } from '../ai/prompts/parse-job-description';

export type ParsedRequirement = ParseJobDescriptionOutput['requirements'][number];

export interface RequirementRow {
  readonly literalTerm: string;
  readonly concept: string;
  readonly normalizedConcept: string;
  readonly kind: 'mandatory' | 'desirable';
  readonly ordinal: number;
}

export interface JobDescriptionRecord {
  readonly id: string;
  readonly language: string;
}

const COMBINING_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const WHITESPACE_PATTERN = /\s+/g;

// normalized_concept keys the permanent gap denial (task 18.0), so it must collide across
// spellings of the same term: "Kubernetes" and "kubernetes" normalize identically.
export function normalizeConcept(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ');
}

export function toRequirementRows(requirements: readonly ParsedRequirement[]): RequirementRow[] {
  return requirements.map((requirement, index) => ({
    literalTerm: requirement.literalTerm,
    concept: requirement.concept,
    normalizedConcept: normalizeConcept(requirement.literalTerm),
    kind: requirement.kind,
    ordinal: index,
  }));
}

export function toJobDescriptionResponse(
  jobDescription: JobDescriptionRecord,
  rows: readonly RequirementResponse[],
): JobDescriptionResponse {
  return {
    id: jobDescription.id,
    language: jobDescription.language,
    requirements: rows.map((row) => ({
      id: row.id,
      literalTerm: row.literalTerm,
      concept: row.concept,
      normalizedConcept: row.normalizedConcept,
      kind: row.kind,
      ordinal: row.ordinal,
    })),
  };
}
