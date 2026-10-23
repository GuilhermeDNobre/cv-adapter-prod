import { describe, expect, it } from 'vitest';
import { CHARS_PER_PAGE } from 'resume-templates';
import { buildPlanInput, ensureEveryExperienceAllocated, resolveSectionBudgets, validatePlanOutput } from './adaptation-planner';

const EVIDENCE_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const EVIDENCE_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const REQUIREMENT_A = '11111111-1111-4111-8111-111111111111';
const REQUIREMENT_B = '22222222-2222-4222-8222-222222222222';
const INVENTED_EVIDENCE = '33333333-3333-4333-8333-333333333333';
const EXP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXP_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EXP_D = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EVID_A = '11111111-1111-4111-8111-111111111111';
const EVID_B = '22222222-2222-4222-8222-222222222222';
const EVID_C = '33333333-3333-4333-8333-333333333333';
const EVID_D = '44444444-4444-4333-8333-444444444444';
const EVID_A2 = '55555555-5555-4555-8555-555555555555';
const EVID_B2 = '66666666-6666-4666-8666-666666666666';

describe('resolveSectionBudgets', () => {
  it('should split the total budget equally across sections', () => {
    const budgets = resolveSectionBudgets({
      sections: [{ kind: 'experience' }, { kind: 'skills' }],
      template: 'comfortable',
      lengthTarget: 1,
    });
    expect(budgets).toHaveLength(2);
    expect(budgets[0]!.charBudget).toBe(Math.floor(CHARS_PER_PAGE.comfortable / 2));
    expect(budgets[1]!.charBudget).toBe(Math.floor(CHARS_PER_PAGE.comfortable / 2));
  });

  it('should use the resume-templates layout budget instead of a local duplicate', () => {
    const comfortable = resolveSectionBudgets({ sections: [{ kind: 'experience' }], template: 'comfortable', lengthTarget: 1 });
    const dense = resolveSectionBudgets({ sections: [{ kind: 'experience' }], template: 'dense', lengthTarget: 1 });
    expect(comfortable[0]!.charBudget).toBe(CHARS_PER_PAGE.comfortable);
    expect(dense[0]!.charBudget).toBe(CHARS_PER_PAGE.dense);
  });

  it('should give the dense template a larger budget', () => {
    const comfortable = resolveSectionBudgets({ sections: [{ kind: 'experience' }], template: 'comfortable', lengthTarget: 1 });
    const dense = resolveSectionBudgets({ sections: [{ kind: 'experience' }], template: 'dense', lengthTarget: 1 });
    expect(dense[0]!.charBudget).toBeGreaterThan(comfortable[0]!.charBudget);
  });
});

describe('buildPlanInput', () => {
  it('should carry requirements, evidences, base ids, budgets and language', () => {
    const input = buildPlanInput({
      requirements: [{ id: REQUIREMENT_A, literalTerm: 'Kubernetes', concept: 'Kubernetes', kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_A, statement: 'Managed clusters', company: 'Acme', role: 'Engineer', statementLength: 16 }],
      baseEvidenceIds: [EVIDENCE_A],
      sections: [{ kind: 'experience' }],
      template: 'comfortable',
      lengthTarget: 1,
      language: 'en',
    });
    expect(input.requirements).toHaveLength(1);
    expect(input.evidences).toHaveLength(1);
    expect(input.baseEvidenceIds).toEqual([EVIDENCE_A]);
    expect(input.sectionBudgets).toHaveLength(1);
    expect(input.language).toBe('en');
  });
});

describe('validatePlanOutput', () => {
  it('should keep a repeated evidence only in the first section', () => {
    const result = validatePlanOutput({
      raw: {
        allocations: [
          { sectionKind: 'experience', evidenceIds: [EVIDENCE_A] },
          { sectionKind: 'skills', evidenceIds: [EVIDENCE_A, EVIDENCE_B] },
        ],
        coverages: [
          { requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null },
          { requirementId: REQUIREMENT_B, coverage: 'covered', evidenceId: EVIDENCE_B, gapKind: null },
        ],
      },
      requirementIds: [REQUIREMENT_A, REQUIREMENT_B],
      knownEvidenceIds: new Set([EVIDENCE_A, EVIDENCE_B]),
      evidenceLengths: new Map([[EVIDENCE_A, 10], [EVIDENCE_B, 10]]),
      sectionBudgets: new Map([['experience', 3000], ['skills', 3000]]),
    });
    expect(result.allocations[0]!.evidenceIds).toEqual([EVIDENCE_A]);
    expect(result.allocations[1]!.evidenceIds).toEqual([EVIDENCE_B]);
  });

  it('should discard an invented evidence id', () => {
    const result = validatePlanOutput({
      raw: {
        allocations: [{ sectionKind: 'experience', evidenceIds: [INVENTED_EVIDENCE, EVIDENCE_A] }],
        coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: INVENTED_EVIDENCE, gapKind: null }],
      },
      requirementIds: [REQUIREMENT_A],
      knownEvidenceIds: new Set([EVIDENCE_A]),
      evidenceLengths: new Map([[EVIDENCE_A, 10]]),
      sectionBudgets: new Map([['experience', 3000]]),
    });
    expect(result.allocations[0]!.evidenceIds).toEqual([EVIDENCE_A]);
    expect(result.coverages[0]!.coverage).toBe('gap');
    expect(result.coverages[0]!.evidenceId).toBeNull();
  });

  it('should turn a missing requirement into a gap', () => {
    const result = validatePlanOutput({
      raw: {
        allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
        coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
      },
      requirementIds: [REQUIREMENT_A, REQUIREMENT_B],
      knownEvidenceIds: new Set([EVIDENCE_A]),
      evidenceLengths: new Map([[EVIDENCE_A, 10]]),
      sectionBudgets: new Map([['experience', 3000]]),
    });
    expect(result.coverages).toHaveLength(2);
    const missing = result.coverages.find((item) => item.requirementId === REQUIREMENT_B);
    expect(missing?.coverage).toBe('gap');
    expect(missing?.evidenceId).toBeNull();
    expect(missing?.gapKind).toBe('existence');
  });

  it('should keep evidences above the per-section slice because size is enforced on the page total', () => {
    const result = validatePlanOutput({
      raw: {
        allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A, EVIDENCE_B] }],
        coverages: [
          { requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null },
          { requirementId: REQUIREMENT_B, coverage: 'covered', evidenceId: EVIDENCE_B, gapKind: null },
        ],
      },
      requirementIds: [REQUIREMENT_A, REQUIREMENT_B],
      knownEvidenceIds: new Set([EVIDENCE_A, EVIDENCE_B]),
      evidenceLengths: new Map([[EVIDENCE_A, 100], [EVIDENCE_B, 5000]]),
      sectionBudgets: new Map([['experience', 200]]),
    });
    expect(result.allocations[0]!.evidenceIds).toEqual([EVIDENCE_A, EVIDENCE_B]);
  });
  it('should cut nothing when the experience section is above the slice but the page has slack', () => {
    const validated = validatePlanOutput({
      raw: {
        allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A, EVIDENCE_B] }],
        coverages: [],
      },
      requirementIds: [],
      knownEvidenceIds: new Set([EVIDENCE_A, EVIDENCE_B]),
      evidenceLengths: new Map([[EVIDENCE_A, 100], [EVIDENCE_B, 5000]]),
      sectionBudgets: new Map([['experience', 200]]),
    });
    const result = ensureEveryExperienceAllocated({
      allocations: validated.allocations,
      coverages: validated.coverages,
      evidenceExperience: new Map([[EVIDENCE_A, EXP_A], [EVIDENCE_B, EXP_B]]),
      requiredExperienceIds: [EXP_A, EXP_B],
      preferredEvidenceByExperience: new Map([[EXP_A, EVIDENCE_A], [EXP_B, EVIDENCE_B]]),
      fallbackEvidenceByExperience: new Map([[EXP_A, EVIDENCE_A], [EXP_B, EVIDENCE_B]]),
      evidenceIdsByExperience: new Map([[EXP_A, [EVIDENCE_A]], [EXP_B, [EVIDENCE_B]]]),
      evidenceLengths: new Map([[EVIDENCE_A, 100], [EVIDENCE_B, 5000]]),
      totalBudget: 10000,
    });
    expect(result.allocations[0]!.evidenceIds).toEqual([EVIDENCE_A, EVIDENCE_B]);
  });
});

describe('ensureEveryExperienceAllocated', () => {
  it('should add the base evidence for missing experiences without touching the planner output', () => {
    const result = ensureEveryExperienceAllocated({
      allocations: [{ sectionKind: 'experience', evidenceIds: [EVID_A, EVID_B] }],
      coverages: [],
      evidenceExperience: new Map([[EVID_A, EXP_A], [EVID_B, EXP_B], [EVID_C, EXP_C], [EVID_D, EXP_D]]),
      requiredExperienceIds: [EXP_A, EXP_B, EXP_C, EXP_D],
      preferredEvidenceByExperience: new Map([[EXP_A, EVID_A], [EXP_B, EVID_B], [EXP_C, EVID_C], [EXP_D, EVID_D]]),
      fallbackEvidenceByExperience: new Map([[EXP_A, EVID_A], [EXP_B, EVID_B], [EXP_C, EVID_C], [EXP_D, EVID_D]]),
      evidenceIdsByExperience: new Map([[EXP_A, [EVID_A]], [EXP_B, [EVID_B]], [EXP_C, [EVID_C]], [EXP_D, [EVID_D]]]),
      evidenceLengths: new Map([[EVID_A, 10], [EVID_B, 10], [EVID_C, 10], [EVID_D, 10]]),
      totalBudget: 1000,
    });
    expect(result.allocations[0]!.evidenceIds.slice(0, 2)).toEqual([EVID_A, EVID_B]);
    expect(result.allocations[0]!.evidenceIds).toHaveLength(4);
    expect(result.allocations[0]!.evidenceIds).toContain(EVID_C);
    expect(result.allocations[0]!.evidenceIds).toContain(EVID_D);
  });
  it('should trim extras from multi-evidence experiences when the page budget overflows', () => {
    const result = ensureEveryExperienceAllocated({
      allocations: [{ sectionKind: 'experience', evidenceIds: [EVID_A, EVID_A2, EVID_B, EVID_B2] }],
      coverages: [],
      evidenceExperience: new Map([[EVID_A, EXP_A], [EVID_A2, EXP_A], [EVID_B, EXP_B], [EVID_B2, EXP_B], [EVID_C, EXP_C], [EVID_D, EXP_D]]),
      requiredExperienceIds: [EXP_A, EXP_B, EXP_C, EXP_D],
      preferredEvidenceByExperience: new Map([[EXP_A, EVID_A], [EXP_B, EVID_B], [EXP_C, EVID_C], [EXP_D, EVID_D]]),
      fallbackEvidenceByExperience: new Map([[EXP_A, EVID_A], [EXP_B, EVID_B], [EXP_C, EVID_C], [EXP_D, EVID_D]]),
      evidenceIdsByExperience: new Map([[EXP_A, [EVID_A, EVID_A2]], [EXP_B, [EVID_B, EVID_B2]], [EXP_C, [EVID_C]], [EXP_D, [EVID_D]]]),
      evidenceLengths: new Map([[EVID_A, 100], [EVID_A2, 100], [EVID_B, 100], [EVID_B2, 100], [EVID_C, 100], [EVID_D, 100]]),
      totalBudget: 450,
    });
    const ids = result.allocations[0]!.evidenceIds;
    expect(ids).toHaveLength(4);
    expect(ids).toContain(EVID_C);
    expect(ids).toContain(EVID_D);
    const pairs = [[EVID_A, EXP_A], [EVID_A2, EXP_A], [EVID_B, EXP_B], [EVID_B2, EXP_B], [EVID_C, EXP_C], [EVID_D, EXP_D]] as const;
    const lengths = [[EVID_A, 100], [EVID_A2, 100], [EVID_B, 100], [EVID_B2, 100], [EVID_C, 100], [EVID_D, 100]] as const;
    const counts = new Map<string, number>();
    for (const id of ids) {
      const found = pairs.find((pair) => pair[0] === id)?.[1] ?? 'unknown';
      counts.set(found, (counts.get(found) ?? 0) + 1);
    }
    expect([...counts.values()].every((count) => count >= 1)).toBe(true);
    expect(ids.reduce((sum, id) => sum + (lengths.find((pair) => pair[0] === id)?.[1] ?? 0), 0)).toBeLessThanOrEqual(450);
  });
});
