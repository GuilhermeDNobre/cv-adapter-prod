import { describe, expect, it } from 'vitest';
import {
  coverageLevel,
  evaluationFailureReason,
  evaluationStatus,
  importFailureReason,
  importStatus,
  requirementKind,
  resumeSectionKind,
  skillProposalKind,
  skillProposalStatus,
  writingMethod,
} from './enums';

describe('requirement_kind enum', () => {
  it('should have exactly the techspec name and values', () => {
    expect(requirementKind.enumName).toBe('requirement_kind');
    expect(requirementKind.enumValues).toEqual(['mandatory', 'desirable']);
  });
});

describe('coverage_level enum', () => {
  it('should have exactly the techspec name and values', () => {
    expect(coverageLevel.enumName).toBe('coverage_level');
    expect(coverageLevel.enumValues).toEqual(['covered', 'partial', 'gap']);
  });
});

describe('import_status enum', () => {
  it('should have exactly the techspec name and values', () => {
    expect(importStatus.enumName).toBe('import_status');
    expect(importStatus.enumValues).toEqual([
      'queued',
      'extracting',
      'structuring',
      'ready_for_review',
      'confirmed',
      'failed',
    ]);
  });
});

describe('import_failure_reason enum', () => {
  it('should have exactly the techspec name and values', () => {
    expect(importFailureReason.enumName).toBe('import_failure_reason');
    expect(importFailureReason.enumValues).toEqual([
      'no_text_layer',
      'unsupported_format',
      'too_large',
      'not_a_resume',
      'extraction_empty',
      'ai_key_rejected',
      'ai_balance_exhausted',
      'ai_unavailable',
    ]);
  });
});

describe('evaluation_failure_reason enum', () => {
  it('should have exactly the techspec name and values', () => {
    expect(evaluationFailureReason.enumName).toBe('evaluation_failure_reason');
    expect(evaluationFailureReason.enumValues).toEqual([
      'ai_key_rejected',
      'ai_balance_exhausted',
      'ai_unavailable',
      'nothing_to_rewrite',
      'rewrite_claims_rejected',
    ]);
  });
});

describe('evaluation_status enum', () => {
  it('should have exactly the techspec name and values', () => {
    expect(evaluationStatus.enumName).toBe('evaluation_status');
    expect(evaluationStatus.enumValues).toEqual(['queued', 'analyzing', 'ready', 'failed']);
  });
});

describe('writing_method enum', () => {
  it('should have exactly the techspec name and values with free', () => {
    expect(writingMethod.enumName).toBe('writing_method');
    expect(writingMethod.enumValues).toEqual(['star', 'xyz', 'car', 'apr', 'free']);
  });
});

describe('resume_section_kind enum', () => {
  it('should have languages and certifications for the base structure', () => {
    expect(resumeSectionKind.enumName).toBe('resume_section_kind');
    expect(resumeSectionKind.enumValues).toEqual([
      'summary',
      'experience',
      'education',
      'skills',
      'languages',
      'certifications',
      'custom',
    ]);
  });
});

describe('skill_proposal_kind enum', () => {
  it('should have exactly the techspec name and values', () => {
    expect(skillProposalKind.enumName).toBe('skill_proposal_kind');
    expect(skillProposalKind.enumValues).toEqual(['addition', 'swap']);
  });
});

describe('skill_proposal_status enum', () => {
  it('should have exactly the techspec name and values', () => {
    expect(skillProposalStatus.enumName).toBe('skill_proposal_status');
    expect(skillProposalStatus.enumValues).toEqual(['pending', 'accepted', 'rejected']);
  });
});
