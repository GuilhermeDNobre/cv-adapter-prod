import { z } from 'zod';
import { registerPrompt } from './prompt';

export const rewriteBulletsInStyleOutputSchema = z.object({
  bullets: z.array(
    z.object({
      evidenceId: z.string().uuid(),
      text: z.string().min(1),
    }),
  ),
});

export type RewriteBulletsInStyleOutput = z.infer<typeof rewriteBulletsInStyleOutputSchema>;

export interface RewriteEvidenceInput {
  readonly id: string;
  readonly statement: string;
  readonly company: string | null;
  readonly role: string | null;
}

export interface RewriteBulletsInStyleInput {
  readonly evidences: readonly RewriteEvidenceInput[];
  readonly writingMethod: 'star' | 'xyz' | 'car' | 'apr' | 'free';
  readonly tone: 'formal' | 'direct' | 'technical';
  readonly averageBulletWords?: number;
}

const SYSTEM_MESSAGE = [
  'You rewrite resume bullets for a single experience in the detected writing style of the resume.',
  'Reply with a single json object and nothing else, shaped as',
  '{"bullets": [{"evidenceId": string, "text": string}]}.',
  'Rules:',
  'Return exactly one bullet for each evidence received, with the same evidenceId; never invent an evidence id.',
  'Rewrite each bullet in the requested writing method and tone, keeping roughly the requested average bullet length when it is provided.',
  'For experience apply the writing method: STAR is Situation, Task, Action, Result;',
  'XYZ is Accomplished X as measured by Y by doing Z; CAR is Challenge, Action, Result;',
  'APR is Action, Problem, Result, with the action first; free means concise factual prose without a forced shape.',
  'Write every bullet in the same language as its source evidence statement: when the statement is Brazilian Portuguese write Portuguese, when it is English write English; never translate and never mix languages.',
  'A bullet may only state a number, tool, scale or role present in its own source evidence;',
  'never introduce a number, tool, scale, company or role the evidence does not state;',
  'when the evidence is vague, keep it vague instead of completing it with plausible detail.',
].join(' ');

registerPrompt({
  name: 'rewrite-bullets-in-style',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: rewriteBulletsInStyleOutputSchema,
});
