import { pgEnum } from 'drizzle-orm/pg-core';

export const requirementKind = pgEnum('requirement_kind', ['mandatory', 'desirable']);

export const coverageLevel = pgEnum('coverage_level', ['covered', 'partial', 'gap']);

export const importStatus = pgEnum('import_status', [
  'queued',
  'extracting',
  'structuring',
  'ready_for_review',
  'confirmed',
  'failed',
]);

export const importFailureReason = pgEnum('import_failure_reason', [
  'no_text_layer',
  'unsupported_format',
  'too_large',
  'not_a_resume',
  'extraction_empty',
  'ai_key_rejected',
  'ai_balance_exhausted',
  'ai_unavailable',
]);

export const evaluationFailureReason = pgEnum('evaluation_failure_reason', [
  'ai_key_rejected',
  'ai_balance_exhausted',
  'ai_unavailable',
  'nothing_to_rewrite',
  'rewrite_claims_rejected',
]);

export const evaluationStatus = pgEnum('evaluation_status', ['queued', 'analyzing', 'ready', 'failed']);

export const resumeKind = pgEnum('resume_kind', ['base', 'tailored']);

export const resumeLanguage = pgEnum('resume_language', ['pt', 'en']);

export const resumeTemplate = pgEnum('resume_template', ['comfortable', 'dense']);

export const writingMethod = pgEnum('writing_method', ['star', 'xyz', 'car', 'apr', 'free']);

export const resumeTone = pgEnum('resume_tone', ['formal', 'direct', 'technical']);

export const resumeSectionKind = pgEnum('resume_section_kind', [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
  'certifications',
  'custom',
]);

export const resumeGenerationStatus = pgEnum('resume_generation_status', [
  'ready',
  'generating',
  'failed',
]);

export const resumeGenerationStep = pgEnum('resume_generation_step', [
  'planning',
  'writing',
  'suggesting',
  'saving',
]);

export const bulletStatus = pgEnum('bullet_status', ['assumed', 'suggestion']);

export const gapKind = pgEnum('gap_kind', ['existence', 'detail']);

export const skillProposalKind = pgEnum('skill_proposal_kind', ['addition', 'swap']);

export const skillProposalStatus = pgEnum('skill_proposal_status', ['pending', 'accepted', 'rejected']);
