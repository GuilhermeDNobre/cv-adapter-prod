import { z } from 'zod';

export const dataErasureRequestSchema = z.object({
  scope: z.enum(['job_descriptions', 'career_profile', 'everything', 'resumes']),
});

export type DataErasureRequest = z.infer<typeof dataErasureRequestSchema>;
