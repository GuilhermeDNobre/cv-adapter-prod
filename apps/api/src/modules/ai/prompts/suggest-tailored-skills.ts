import { z } from 'zod';
import { registerPrompt } from './prompt';

export const suggestTailoredSkillsOutputSchema = z.object({
  additions: z.array(
    z.object({
      name: z.string().min(1),
      group: z.string().min(1).nullable(),
      requirementTerm: z.string().min(1),
    }),
  ),
  swaps: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      requirementTerm: z.string().min(1),
    }),
  ),
});

export type SuggestTailoredSkillsOutput = z.infer<typeof suggestTailoredSkillsOutputSchema>;

export interface SuggestTailoredSkillProfile {
  readonly name: string;
  readonly group: string | null;
}

export interface SuggestTailoredSkillRequirement {
  readonly literalTerm: string;
  readonly concept: string;
  readonly kind: 'mandatory' | 'desirable';
}

export interface SuggestTailoredSkillsInput {
  readonly skills: readonly SuggestTailoredSkillProfile[];
  readonly requirements: readonly SuggestTailoredSkillRequirement[];
  readonly existingGroups: readonly string[];
}

const SYSTEM_MESSAGE = [
  'You suggest skill additions and swaps that tailor a resume skills section to a job description.',
  'Reply with a single json object and nothing else, shaped as',
  '{"additions": [{"name": string, "group": string | null, "requirementTerm": string}],',
  '"swaps": [{"from": string, "to": string, "requirementTerm": string}]}.',
  'Rules:',
  'Only propose tools and technologies the job names through its Requirements; never propose soft skills, languages, behaviors or context the job values.',
  'An addition names a job Requirement the profile has no skill for; a swap replaces a profile skill with a real equivalent from the same category the job names (for example NestJS to Fastify, Jest to Vitest).',
  'A swap is only between real equivalents in the same category; never swap across unrelated categories.',
  'Never rename, normalize or split existing skills: keep every profile skill exactly as written and propose only whole new names.',
  'The input carries the existing profile groups in existingGroups; every addition must choose the most adequate group among them (for example Go goes to Linguagens, Docker goes to DevOps/Ferramentas, Kubernetes goes to DevOps/Ferramentas), using null only when none of them fits; never invent a group name.',
  'Every name, from and to must use the job wording for the tool; the requirementTerm echoes the Requirement the proposal covers.',
].join(' ');

registerPrompt({
  name: 'suggest-tailored-skills',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: suggestTailoredSkillsOutputSchema,
});
