import { describe, expect, it } from 'vitest';
import { diffAdaptationPlan } from './adaptation-diff';

const ADDED = '22222222-2222-4222-8222-222222222222';
const REMOVED = '33333333-3333-4333-8333-333333333333';
const KEPT = '55555555-5555-4555-8555-555555555555';

describe('diffAdaptationPlan', () => {
  it('should derive added evidence from base and allocations', () => {
    const plan = {
      baseEvidenceIds: [REMOVED, KEPT],
      allocations: [{ sectionKind: 'experience', evidenceIds: [ADDED, KEPT] }],
      coverages: [],
    };
    expect(diffAdaptationPlan(plan)).toEqual({ added: [ADDED], removed: [REMOVED] });
  });

  it('should derive removed evidence from base and allocations', () => {
    const plan = {
      baseEvidenceIds: [REMOVED, KEPT],
      allocations: [{ sectionKind: 'experience', evidenceIds: [KEPT] }],
    };
    expect(diffAdaptationPlan(plan)).toEqual({ added: [], removed: [REMOVED] });
  });

  it('should return empty diff when nothing changed', () => {
    const plan = {
      baseEvidenceIds: [KEPT],
      allocations: [{ sectionKind: 'experience', evidenceIds: [KEPT] }],
    };
    expect(diffAdaptationPlan(plan)).toEqual({ added: [], removed: [] });
  });

  it('should deduplicate allocated ids', () => {
    const plan = {
      baseEvidenceIds: [],
      allocations: [
        { sectionKind: 'experience', evidenceIds: [ADDED] },
        { sectionKind: 'education', evidenceIds: [ADDED] },
      ],
    };
    expect(diffAdaptationPlan(plan)).toEqual({ added: [ADDED], removed: [] });
  });

  it('should support the legacy added and removed format', () => {
    const plan = { addedEvidenceIds: [ADDED], removedEvidenceIds: [REMOVED] };
    expect(diffAdaptationPlan(plan)).toEqual({ added: [ADDED], removed: [REMOVED] });
  });

  it('should return null for null, array and invalid plans', () => {
    expect(diffAdaptationPlan(null)).toBeNull();
    expect(diffAdaptationPlan([])).toBeNull();
    expect(diffAdaptationPlan({})).toBeNull();
    expect(diffAdaptationPlan({ baseEvidenceIds: 'nope', allocations: [] })).toBeNull();
  });
});
