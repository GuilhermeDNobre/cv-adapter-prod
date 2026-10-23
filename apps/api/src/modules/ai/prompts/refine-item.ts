import { z } from 'zod';
import { registerPrompt } from './prompt';

export const refineItemOutputSchema = z.object({
  refined: z.string().min(1),
});

export type RefineItemOutput = z.infer<typeof refineItemOutputSchema>;

export interface RefineItemInput {
  readonly text: string;
  readonly sectionKind: 'summary' | 'experience' | 'education' | 'skills' | 'custom';
  readonly language: 'pt' | 'en';
  readonly writingMethod: 'star' | 'xyz' | 'car' | 'apr' | 'free';
  readonly tone: 'formal' | 'direct' | 'technical';
  readonly averageBulletWords?: number;
}

const SYSTEM_MESSAGE = [
  'You refine a single resume item written by the person into the style of the resume.',
  'Reply with a single json object and nothing else, shaped as',
  '{"refined": string}.',
  'Rules:',
  'Rewrite the input text in the requested writing method, tone and document language:',
  '"pt" means Brazilian Portuguese, "en" means English.',
  'For experience sections apply the requested writing method: STAR is Situation, Task, Action, Result;',
  'XYZ is Accomplished X as measured by Y by doing Z; CAR is Challenge, Action, Result;',
  'APR is Action, Problem, Result, with the action first; free means concise factual prose without a forced shape.',
  'For non-experience sections write a concise factual sentence in the requested tone.',
  'Keep roughly the requested average bullet length when it is provided.',
  'Never invent facts the input text does not state: no new numbers, tools, scales, roles, companies or dates;',
  'when the input is vague, keep it vague instead of completing it with plausible detail.',
  'Return the refined text only, without quotes or explanations.',
].join(' ');

registerPrompt({
  name: 'refine-item',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: refineItemOutputSchema,
});
