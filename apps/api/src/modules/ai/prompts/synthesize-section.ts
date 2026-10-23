import { z } from 'zod';
import { registerPrompt } from './prompt';

export const synthesizeSectionOutputSchema = z.object({
  bullets: z.array(
    z.object({
      text: z.string().min(1),
    }),
  ),
});

export type SynthesizeSectionOutput = z.infer<typeof synthesizeSectionOutputSchema>;

export interface SynthesizeSectionInput {
  readonly sources: readonly string[];
  readonly sectionKind: 'summary' | 'skills' | 'experience' | 'education' | 'languages' | 'certifications' | 'custom';
  readonly tone: 'formal' | 'direct' | 'technical';
  readonly language: 'pt' | 'en';
  readonly instruction?: string;
  readonly currentText?: string;
}

const SYSTEM_MESSAGE = [
  'You synthesize a resume section from verified career evidences.',
  'Reply with a single json object and nothing else, shaped as',
  '{"bullets": [{"text": string}]}.',
  'Rules:',
  'For summary the default is a single paragraph unless the person instruction says otherwise;',
  'for skills list short competencies such as tools, techniques and domains, one per bullet;',
  'for other sections rewrite concisely following the instruction.',
  'When currentText is provided, rewrite it using only what is already in the career sources and in currentText;',
  'never introduce a number, tool, scale or job title absent from those inputs.',
  'When a person instruction is provided, follow it as the main instruction for this section;',
  'it has priority over the default shape but never overrides the veracity rules.',
  'Every bullet must only state a number, tool, scale or role present in the sources or currentText;',
  'never introduce a number, tool, scale or job title the inputs do not state;',
  'the deterministic ClaimChecker rejects anything without such backing (ADR 0009).',
  'Write concise factual sentences in the requested tone.',
  'Write every bullet in the target document language from the input:',
  '"pt" means Brazilian Portuguese, "en" means English.',
].join(' ');

registerPrompt({
  name: 'synthesize-section',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: synthesizeSectionOutputSchema,
});
