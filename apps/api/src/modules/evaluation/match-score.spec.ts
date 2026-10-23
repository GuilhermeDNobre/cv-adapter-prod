import { describe, expect, it } from 'vitest';
import { calculateMatchScore } from './match-score';
import type { CoverageLevel, RequirementCoverageInput, RequirementKind } from './match-score';

function coverage(kind: RequirementKind, level: CoverageLevel): RequirementCoverageInput {
  return { kind, coverage: level };
}

describe('calculateMatchScore', () => {
  it('should return the reference score of 70 for the mixed coverage example from the spec', () => {
    // Arrange: 6 mandatory (4 covered, 1 partial, 1 gap) + 4 desirable (2 covered, 2 gap)
    // numerator = 3 * (4 + 0.5) + 1 * 2 = 15.5 ; denominator = 3 * 6 + 1 * 4 = 22
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'covered'),
      coverage('mandatory', 'covered'),
      coverage('mandatory', 'covered'),
      coverage('mandatory', 'covered'),
      coverage('mandatory', 'partial'),
      coverage('mandatory', 'gap'),
      coverage('desirable', 'covered'),
      coverage('desirable', 'covered'),
      coverage('desirable', 'gap'),
      coverage('desirable', 'gap'),
    ];

    // Act
    const score = calculateMatchScore(coverages);

    // Assert: exact integer, not 70.45
    expect(score).toBe(70);
    expect(Number.isInteger(score)).toBe(true);
  });

  it('should return 100 when every requirement is covered', () => {
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'covered'),
      coverage('desirable', 'covered'),
    ];

    expect(calculateMatchScore(coverages)).toBe(100);
  });

  it('should return 0 when every requirement is a gap', () => {
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'gap'),
      coverage('desirable', 'gap'),
    ];

    expect(calculateMatchScore(coverages)).toBe(0);
  });

  it('should return 100 when the only requirements are mandatory and all covered', () => {
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'covered'),
      coverage('mandatory', 'covered'),
    ];

    expect(calculateMatchScore(coverages)).toBe(100);
  });

  it('should return 0 when the only requirements are mandatory and all gaps', () => {
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'gap'),
      coverage('mandatory', 'gap'),
    ];

    expect(calculateMatchScore(coverages)).toBe(0);
  });

  it('should return 0 for an empty list instead of NaN', () => {
    expect(calculateMatchScore([])).toBe(0);
  });

  it('should weight a mandatory gap three times the impact of a desirable one', () => {
    // Kills mandatory weight 3 -> 1 (would be 50) and 3 -> 4 (would be 20).
    // Both sides here are gaps on one mandatory vs one desirable fully covered, so the
    // only way to reach 25 is mandatory contributing 3 of a total weight of 4.
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'gap'),
      coverage('desirable', 'covered'),
    ];

    expect(calculateMatchScore(coverages)).toBe(25);
  });

  it('should give a mandatory partial exactly half the credit of a covered mandatory', () => {
    // Kills partial 0.5 -> 1 (would be 100) and 0.5 -> 0 (would be 0).
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'covered'),
      coverage('mandatory', 'partial'),
    ];

    expect(calculateMatchScore(coverages)).toBe(75);
  });

  it('should give a desirable partial exactly half the credit of a covered desirable', () => {
    // Kills partial 0.5 -> 1 (would be 100) and 0.5 -> 0 (would be 0).
    const coverages: RequirementCoverageInput[] = [
      coverage('desirable', 'covered'),
      coverage('desirable', 'partial'),
    ];

    expect(calculateMatchScore(coverages)).toBe(75);
  });

  it('should count a gap as zero credit, including a gap the person denied (RF-25)', () => {
    // Kills gap 0 -> 0.5 (would be 75). Denied and unanswered gaps are both `gap` here.
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'covered'),
      coverage('mandatory', 'gap'),
    ];

    expect(calculateMatchScore(coverages)).toBe(50);
  });

  it('should divide by the sum of weights, not multiply by it', () => {
    // Kills swapping numerator and denominator (would be 400).
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'gap'),
      coverage('desirable', 'covered'),
    ];

    expect(calculateMatchScore(coverages)).toBe(25);
  });

  it('should round an exact half up to the next integer', () => {
    // numerator = 3 * 0.5 + 1 * 0 = 1.5 ; denominator = 3 * 1 + 1 * 1 = 4 ; raw = 37.5
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'partial'),
      coverage('desirable', 'gap'),
    ];

    expect(calculateMatchScore(coverages)).toBe(38);
  });

  it('should keep the result an integer between 0 and 100 on an uneven mix', () => {
    const coverages: RequirementCoverageInput[] = [
      coverage('mandatory', 'partial'),
      coverage('desirable', 'covered'),
      coverage('desirable', 'gap'),
    ];

    // numerator = 3 * 0.5 + 1 = 2.5 ; denominator = 3 + 1 + 1 = 5 ; raw = 50
    const score = calculateMatchScore(coverages);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should not mutate the input array', () => {
    const coverages: RequirementCoverageInput[] = [coverage('mandatory', 'partial')];
    const snapshot = [...coverages];

    calculateMatchScore(coverages);

    expect(coverages).toEqual(snapshot);
  });

  it('should not depend on the order of the coverages', () => {
    const first: RequirementCoverageInput[] = [
      coverage('mandatory', 'covered'),
      coverage('mandatory', 'partial'),
      coverage('desirable', 'gap'),
    ];
    const second: RequirementCoverageInput[] = [
      coverage('desirable', 'gap'),
      coverage('mandatory', 'partial'),
      coverage('mandatory', 'covered'),
    ];

    expect(calculateMatchScore(first)).toBe(calculateMatchScore(second));
  });
});
