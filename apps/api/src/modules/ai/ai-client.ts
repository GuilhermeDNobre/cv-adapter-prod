import type { ZodType } from 'zod';

export type PromptName =
  | 'parse-job-description'
  | 'extract-resume-draft'
  | 'detect-writing-style'
  | 'evaluate-coverage'
  | 'plan-adaptation'
  | 'write-section'
  | 'synthesize-section'
  | 'draft-suggestions'
  | 'refine-item'
  | 'rewrite-bullets-in-style'
  | 'write-profile-summary'
  | 'suggest-tailored-skills';

export interface AiRequest<TOutput> {
  readonly promptName: PromptName;
  readonly payload: Record<string, unknown>;
  readonly outputSchema: ZodType<TOutput>;
  readonly attempt?: number;
}

export interface AiClient {
  complete<TOutput>(request: AiRequest<TOutput>): Promise<TOutput>;
}

export const AI_CLIENT = 'AI_CLIENT';
