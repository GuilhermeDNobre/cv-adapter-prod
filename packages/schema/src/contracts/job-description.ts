import { z } from 'zod';
import { requirementKind } from '../enums';

export const MAX_JOB_DESCRIPTION_TEXT_LENGTH = 20_000;

export const createJobDescriptionRequestSchema = z.object({
  text: z
    .string({ required_error: 'text is required' })
    .trim()
    .min(1, 'text must not be empty')
    .max(
      MAX_JOB_DESCRIPTION_TEXT_LENGTH,
      `text exceeds the ${String(MAX_JOB_DESCRIPTION_TEXT_LENGTH)}-character job description limit`,
    ),
});

export type CreateJobDescriptionRequest = z.infer<typeof createJobDescriptionRequestSchema>;

export const jobDescriptionIdSchema = z.string().uuid();

export const requirementResponseSchema = z.object({
  id: z.string().uuid(),
  literalTerm: z.string().min(1),
  concept: z.string().min(1),
  normalizedConcept: z.string().min(1),
  kind: z.enum(requirementKind.enumValues),
  ordinal: z.number().int().nonnegative(),
});

export type RequirementResponse = z.infer<typeof requirementResponseSchema>;

export const jobDescriptionResponseSchema = z.object({
  id: z.string().uuid(),
  language: z.string().min(1),
  requirements: z.array(requirementResponseSchema),
});

export type JobDescriptionResponse = z.infer<typeof jobDescriptionResponseSchema>;
