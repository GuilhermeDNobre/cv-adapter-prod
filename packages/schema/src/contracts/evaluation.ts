import { z } from 'zod';
import {
  coverageLevel,
  evaluationFailureReason,
  evaluationStatus,
  requirementKind,
} from '../enums';

export const evaluationIdSchema = z.string().uuid();

export const createEvaluationRequestSchema = z.object({
  jobDescriptionId: z.string().uuid(),
});

export type CreateEvaluationRequest = z.infer<typeof createEvaluationRequestSchema>;

export const requirementCoverageResponseSchema = z.object({
  requirementId: z.string().uuid(),
  literalTerm: z.string().min(1),
  concept: z.string().min(1),
  kind: z.enum(requirementKind.enumValues),
  coverage: z.enum(coverageLevel.enumValues),
  evidenceId: z.string().uuid().nullable(),
  // RF-23 asks the list to point at the Evidence that covers each Requirement so the person can
  // judge whether the coverage is fair. An id alone is not auditable by a human, so the statement
  // travels with it. Null when the coverage cites no Evidence, or when the cited one is gone.
  evidenceStatement: z.string().min(1).nullable(),
  rationale: z.string().min(1),
  denied: z.boolean(),
});

export type RequirementCoverageResponse = z.infer<typeof requirementCoverageResponseSchema>;

export const evaluationResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(evaluationStatus.enumValues),
  matchScore: z.number().int().min(0).max(100).nullable(),
  failureReason: z.enum(evaluationFailureReason.enumValues).nullable(),
  resumeId: z.string().uuid().nullable(),
  requirementCoverages: z.array(requirementCoverageResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;

export const reevaluationComparisonSchema = z.object({
  requirementId: z.string().uuid(),
  literalTerm: z.string().min(1),
  kind: z.enum(requirementKind.enumValues),
  coverageBefore: z.enum(coverageLevel.enumValues).nullable(),
  coverageAfter: z.enum(coverageLevel.enumValues),
  improved: z.boolean(),
});

export type ReevaluationComparison = z.infer<typeof reevaluationComparisonSchema>;

export const reevaluationBaselineSchema = z.object({
  id: z.string().uuid(),
  matchScore: z.number().int().min(0).max(100).nullable(),
  requirementCoverages: z.array(requirementCoverageResponseSchema),
});

export type ReevaluationBaseline = z.infer<typeof reevaluationBaselineSchema>;

export const resumeReevaluationLatestResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(evaluationStatus.enumValues),
  matchScore: z.number().int().min(0).max(100).nullable(),
  failureReason: z.enum(evaluationFailureReason.enumValues).nullable(),
  resumeId: z.string().uuid().nullable(),
  requirementCoverages: z.array(requirementCoverageResponseSchema),
  baseline: reevaluationBaselineSchema.nullable(),
  comparisons: z.array(reevaluationComparisonSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ResumeReevaluationLatestResponse = z.infer<typeof resumeReevaluationLatestResponseSchema>;

export const evaluateCoverageItemSchema = z.object({
  requirementId: z.string().uuid(),
  literalTerm: z.string().min(1),
  concept: z.string().min(1),
  kind: z.enum(requirementKind.enumValues),
  coverage: z.enum(coverageLevel.enumValues),
  evidenceId: z.string().uuid().nullable(),
  rationale: z.string().min(1),
});

export type EvaluateCoverageItem = z.infer<typeof evaluateCoverageItemSchema>;

export const evaluateCoverageOutputSchema = z.object({
  coverages: z.array(evaluateCoverageItemSchema),
});

export type EvaluateCoverageOutput = z.infer<typeof evaluateCoverageOutputSchema>;

export const denyGapRequestSchema = z.object({
  requirementId: z.string().uuid(),
});

export type DenyGapRequest = z.infer<typeof denyGapRequestSchema>;

export const denyGapResponseSchema = z.object({
  denied: z.literal(true),
  normalizedConcept: z.string().min(1),
});

export type DenyGapResponse = z.infer<typeof denyGapResponseSchema>;
