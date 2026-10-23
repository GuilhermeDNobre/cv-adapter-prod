import type {
  DraftSuggestionsInput,
  SuggestionExperienceInput,
  SuggestionGapInput,
} from '../../ai/prompts/draft-suggestions';
import type { DraftSuggestionsOutput } from '../../ai/prompts/draft-suggestions';

export type DraftGap = SuggestionGapInput;
export type DraftExperience = SuggestionExperienceInput;

export interface BuildSuggestionsInput {
  readonly gaps: readonly DraftGap[];
  readonly experiences: readonly DraftExperience[];
  readonly language: 'pt' | 'en';
}

export interface ValidateSuggestionsInput {
  readonly raw: DraftSuggestionsOutput;
  readonly gapIds: ReadonlySet<string>;
}

export function buildSuggestionsInput(input: BuildSuggestionsInput): DraftSuggestionsInput {
  return {
    gaps: input.gaps.map((gap) => ({
      requirementId: gap.requirementId,
      literalTerm: gap.literalTerm,
      concept: gap.concept,
      kind: gap.kind,
      gapKind: gap.gapKind,
      adjacentCompany: gap.adjacentCompany,
      adjacentRole: gap.adjacentRole,
      adjacentStatements: [...gap.adjacentStatements],
    })),
    experiences: input.experiences.map((experience) => ({
      id: experience.id,
      company: experience.company,
      role: experience.role,
      evidenceStatements: [...experience.evidenceStatements],
    })),
    language: input.language,
  };
}

export function validateSuggestionsOutput(
  input: ValidateSuggestionsInput,
): DraftSuggestionsOutput['suggestions'] {
  const seen = new Set<string>();
  const result: DraftSuggestionsOutput['suggestions'] = [];
  for (const suggestion of input.raw.suggestions ?? []) {
    if (!input.gapIds.has(suggestion.requirementId) || seen.has(suggestion.requirementId)) {
      continue;
    }
    if (suggestion.question.trim() === '' || suggestion.draftBullet.trim() === '') {
      continue;
    }
    seen.add(suggestion.requirementId);
    result.push(suggestion);
  }
  return result;
}
