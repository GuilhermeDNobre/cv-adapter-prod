import { z } from 'zod';
import { registerPrompt } from './prompt';

export const planAdaptationOutputSchema = z.object({
  allocations: z.array(
    z.object({
      sectionKind: z.enum(['summary', 'experience', 'education', 'skills', 'custom']),
      evidenceIds: z.array(z.string().uuid()),
    }),
  ),
  coverages: z.array(
    z.object({
      requirementId: z.string().uuid(),
      coverage: z.enum(['covered', 'partial', 'gap']),
      evidenceId: z.string().uuid().nullable(),
      gapKind: z.enum(['existence', 'detail']).nullable(),
    }),
  ),
});

export type PlanAdaptationOutput = z.infer<typeof planAdaptationOutputSchema>;

export interface PlanRequirementInput {
  readonly id: string;
  readonly literalTerm: string;
  readonly concept: string;
  readonly kind: 'mandatory' | 'desirable';
}

export interface PlanEvidenceInput {
  readonly id: string;
  readonly statement: string;
  readonly company: string | null;
  readonly role: string | null;
}

export interface PlanSectionBudget {
  readonly sectionKind: 'summary' | 'experience' | 'education' | 'skills' | 'custom';
  readonly charBudget: number;
}

export interface PlanAdaptationInput {
  readonly requirements: readonly PlanRequirementInput[];
  readonly evidences: readonly PlanEvidenceInput[];
  readonly baseEvidenceIds: readonly string[];
  readonly sectionBudgets: readonly PlanSectionBudget[];
  readonly language: 'pt' | 'en';
}

const SYSTEM_MESSAGE = [
  'You plan how to adapt a resume to a job description before any text is written.',
  'Reply with a single json object and nothing else, shaped as',
  '{"allocations": [{"sectionKind": string, "evidenceIds": string[]}],',
  '"coverages": [{"requirementId": string, "coverage": "covered" | "partial" | "gap",',
  '"evidenceId": string | null, "gapKind": "existence" | "detail" | null}]}.',
  'Rules:',
  'Use only the requirement and evidence ids received in the input; never invent an id.',
  'Never place the same evidence in two sections; each evidence id appears at most once across all allocations.',
  'Return exactly one coverage entry for each requirement received, with the same requirementId.',
  'When coverage is "covered" or "partial", set evidenceId to the covering evidence and gapKind to null;',
  'when coverage is "gap", set evidenceId to null and gapKind to "existence" when the experience may not exist',
  'or "detail" when an evidence exists but lacks the metric the requirement asks for.',
  'Every mandatory requirement must end up covered, partial, or marked as a gap for a Suggestion; never drop one.',
  'Give every experience at least one evidence in the experience section;',
  'adaptation changes emphasis, it never removes an experience.',
  'Respect the per-section character budget from the input when choosing how many evidences each section gets.',
  'Downstream Bullets may only state a number, tool, scale or role present in their source evidence;',
  'the deterministic ClaimChecker will reject anything without such backing (ADR 0009).',
  'The input carries the target document language: "pt" means write for Brazilian Portuguese,',
  '"en" means write for English; plan the allocation to support writing in that language.',
].join(' ');

registerPrompt({
  name: 'plan-adaptation',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: planAdaptationOutputSchema,
});
