import { z } from 'zod';
import { registerPrompt } from './prompt';

export const evaluateCoverageOutputSchema = z.object({
  coverages: z.array(
    z.object({
      requirementId: z.string().uuid(),
      coverage: z.enum(['covered', 'partial', 'gap']),
      evidenceId: z.string().uuid().nullable(),
      rationale: z.string().min(1),
    }),
  ),
});

export type EvaluateCoverageOutput = z.infer<typeof evaluateCoverageOutputSchema>;

const SYSTEM_MESSAGE = [
  'You evaluate how well a candidates career profile covers job requirements.',
  'Reply with a single json object and nothing else, shaped as',
  '{"coverages": [{"requirementId": string, "coverage": "covered" | "partial" | "gap",',
  '"evidenceId": string | null, "rationale": string}]}.',
  'Rules:',
  'You receive a list of requirements and a list of evidences from the candidates career profile.',
  'For each requirement, assess whether the evidences cover it.',
  'Set coverage to "covered" when an evidence fully demonstrates the requirement,',
  '"partial" when an evidence partially addresses it, and "gap" when no evidence addresses it.',
  'When coverage is "covered" or "partial", set evidenceId to the id of the evidence that covers it.',
  'When coverage is "gap", set evidenceId to null.',
  'The rationale must be a short explanation in Brazilian Portuguese of why the coverage level was chosen.',
  'You must return exactly one coverage entry for each requirement received, with the same requirementId.',
  'Do not invent evidence ids that were not provided in the input.',
  'Do not omit any requirement from the output.',
].join(' ');

registerPrompt({
  name: 'evaluate-coverage',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: evaluateCoverageOutputSchema,
});
