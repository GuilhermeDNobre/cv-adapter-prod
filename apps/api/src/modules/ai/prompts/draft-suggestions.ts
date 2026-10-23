import { z } from 'zod';
import { registerPrompt } from './prompt';

export const draftSuggestionsOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      requirementId: z.string().uuid(),
      gapKind: z.enum(['existence', 'detail']),
      question: z.string().min(1),
      draftBullet: z.string().min(1),
      experienceId: z.string().uuid().nullable().optional(),
    }),
  ),
});

export type DraftSuggestionsOutput = z.infer<typeof draftSuggestionsOutputSchema>;

export interface SuggestionGapInput {
  readonly requirementId: string;
  readonly literalTerm: string;
  readonly concept: string;
  readonly kind: 'mandatory' | 'desirable';
  readonly gapKind: 'existence' | 'detail';
  readonly adjacentCompany: string | null;
  readonly adjacentRole: string | null;
  readonly adjacentStatements: readonly string[];
}

export interface SuggestionExperienceInput {
  readonly id: string;
  readonly company: string | null;
  readonly role: string | null;
  readonly evidenceStatements: readonly string[];
}
export interface DraftSuggestionsInput {
  readonly gaps: readonly SuggestionGapInput[];
  readonly experiences: readonly SuggestionExperienceInput[];
  readonly language: 'pt' | 'en';
}

const SYSTEM_MESSAGE = [
  'You draft suggestions for job requirements the career profile does not prove.',
  'Reply with a single json object and nothing else, shaped as',
  '{"suggestions": [{"requirementId": string, "gapKind": "existence" | "detail",',
  '"question": string, "draftBullet": string, "experienceId": string | null}]}.',
  'Rules:',
  'Return exactly one suggestion for each gap received, with the same requirementId; never invent an id.',
  'For each gap write one direct question that would bring the missing fact, plus one complete draft bullet',
  'extrapolated from the adjacent experience; the draft may infer a neighboring tool or a plausible metric.',
  'The draft bullet must cite the technology named by the Requirement literalTerm.',
  'The input carries the tailored experiences in experiences with id, company, role and evidenceStatements;',
  'every suggestion must carry the experienceId of the most plausible experience for that Requirement,',
  'or null when none of them fits.',
  'A suggestion is unconfirmed by definition: it never states a number, tool, scale or role as verified fact,',
  'and it only reaches the PDF after the person edits or approves it (ADR 0018);',
  'the deterministic ClaimChecker would reject such specificity as a Bullet (ADR 0009).',
  'Keep existence and detail gaps in the same response format: question plus complete draft.',
  'Write every question and every draft bullet in the target document language from the input:',
  '"pt" means Brazilian Portuguese, "en" means English.',
].join(' ');

registerPrompt({
  name: 'draft-suggestions',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: draftSuggestionsOutputSchema,
});
