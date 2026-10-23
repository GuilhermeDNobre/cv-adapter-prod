import { z } from 'zod';
import { registerPrompt } from './prompt';

export const writeSectionOutputSchema = z.object({
  bullets: z.array(
    z.object({
      evidenceId: z.string().uuid(),
      text: z.string().min(1),
    }),
  ),
});

export type WriteSectionOutput = z.infer<typeof writeSectionOutputSchema>;

export interface SectionEvidenceInput {
  readonly id: string;
  readonly statement: string;
  readonly company: string | null;
  readonly role: string | null;
}

export interface SectionWritingInput {
  readonly evidences: readonly SectionEvidenceInput[];
  readonly sectionKind: 'summary' | 'experience' | 'education' | 'skills' | 'custom';
  readonly writingMethod: 'star' | 'xyz' | 'car' | 'apr' | 'free';
  readonly tone: 'formal' | 'direct' | 'technical';
  readonly language: 'pt' | 'en';
  readonly openComments: readonly string[];
  readonly instruction?: string;
}

const SYSTEM_MESSAGE = [
  'You write resume bullets for a single section from verified career evidences.',
  'Reply with a single json object and nothing else, shaped as',
  '{"bullets": [{"evidenceId": string, "text": string}]}.',
  'Rules:',
  'Return exactly one bullet for each evidence received, with the same evidenceId; never invent an evidence id.',
  'A bullet may only state a number, tool, scale or role present in its own source evidence;',
  'never introduce a number, tool, scale or job title the evidence does not state;',
  'the deterministic ClaimChecker rejects anything without such backing (ADR 0009).',
  'Apply the requested writing method for experience sections: STAR is Situation, Task, Action, Result;',
  'XYZ is Accomplished X as measured by Y by doing Z; CAR is Challenge, Action, Result;',
  'APR is Action, Problem, Result, with the action first.',
  'For non-experience sections write concise factual sentences in the requested tone.',
  'Follow the open comments for this section; rewrite only this section and never touch a neighboring one.',
  'When a person instruction is provided, follow it as the main instruction for this section;',
  'it has priority over open comments but never overrides the veracity rules above.',
  'Avoid title case headings and title case capitalization inside bullets; prefer sentence case,',
  'which is what most generates false positives in the deterministic checker.',
  'Write every bullet in the target document language from the input:',
  '"pt" means Brazilian Portuguese, "en" means English.',
].join(' ');

registerPrompt({
  name: 'write-section',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: writeSectionOutputSchema,
});
