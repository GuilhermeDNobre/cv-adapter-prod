import { z } from 'zod';
import { registerPrompt } from './prompt';

export const parseJobDescriptionOutputSchema = z.object({
  isJobDescription: z.boolean(),
  language: z.string().min(1),
  requirements: z.array(
    z.object({
      literalTerm: z.string().min(1),
      concept: z.string().min(1),
      kind: z.enum(['mandatory', 'desirable']),
    }),
  ),
});

export type ParseJobDescriptionOutput = z.infer<typeof parseJobDescriptionOutputSchema>;

const SYSTEM_MESSAGE = [
  'You parse job advertisements into structured requirements.',
  'Reply with a single json object and nothing else, shaped as',
  '{"isJobDescription": boolean, "language": "BCP 47 tag of the ad text",',
  '"requirements": [{"literalTerm": string, "concept": string, "kind": "mandatory" | "desirable"}]}.',
  'Rules:',
  'Set isJobDescription to false unless the text really is a job advertisement someone could apply to;',
  'when it is false, return an empty requirements array.',
  'For each requirement the ad states: copy literalTerm verbatim, exactly as the ad writes it,',
  'without translating, expanding or rephrasing it;',
  'write concept in Brazilian Portuguese as a short canonical description of the same requirement;',
  'set kind strictly as the ad presents it - wording such as required, must have, minimum,',
  'obrigatorio, exigido or necessaria maps to mandatory, and wording such as nice to have, plus,',
  'diferencial, desejavel or desejado maps to desirable - never according to your own opinion of',
  'how important the requirement is.',
  'Do not invent requirements the ad does not state, and do not merge two distinct stated',
  'requirements into one.',
].join(' ');

registerPrompt({
  name: 'parse-job-description',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: parseJobDescriptionOutputSchema,
});
