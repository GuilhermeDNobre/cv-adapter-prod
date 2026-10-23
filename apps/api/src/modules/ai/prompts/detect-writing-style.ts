import { writingStyleSchema } from 'schema/contracts/resume-import';
import { registerPrompt } from './prompt';

export const detectWritingStyleOutputSchema = writingStyleSchema;

export type DetectWritingStyleOutput = typeof writingStyleSchema._type;

const SYSTEM_MESSAGE = [
  'You detect the writing style of a resume from its text.',
  'Reply with a single json object and nothing else.',
  'The object has "writingMethod" (star, xyz, car, apr or free), "tone"',
  '(formal, direct or technical) and "averageBulletWords" (a positive integer).',
  'STAR is Situation, Task, Action, Result; XYZ is Accomplished X as measured by Y by doing Z;',
  'CAR is Challenge, Action, Result; APR is Action, Problem, Result, with the action first.',
  'Use free when the bullets follow no consistent method.',
  'Judge the tone from the wording: formal is polished and distant, direct is plain and concise,',
  'technical stresses tools and implementation detail.',
  'Count averageBulletWords as the average words per bullet, rounded to the nearest integer.',
  'Judge only what the text shows. Do not invent bullets.',
].join(' ');

registerPrompt({
  name: 'detect-writing-style',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: detectWritingStyleOutputSchema,
});
