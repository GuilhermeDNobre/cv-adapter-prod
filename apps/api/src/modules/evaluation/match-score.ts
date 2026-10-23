import { coverageLevel, requirementKind } from 'schema';

export type RequirementKind = (typeof requirementKind.enumValues)[number];
export type CoverageLevel = (typeof coverageLevel.enumValues)[number];

export interface RequirementCoverageInput {
  readonly kind: RequirementKind;
  readonly coverage: CoverageLevel;
}

const MANDATORY_WEIGHT = 3;
const DESIRABLE_WEIGHT = 1;
const COVERED_CREDIT = 1;
const PARTIAL_CREDIT = 0.5;
const GAP_CREDIT = 0;
const SCORE_SCALE = 100;
const EMPTY_LIST_SCORE = 0;

const kindWeights: Record<RequirementKind, number> = {
  mandatory: MANDATORY_WEIGHT,
  desirable: DESIRABLE_WEIGHT,
};

const coverageCredits: Record<CoverageLevel, number> = {
  covered: COVERED_CREDIT,
  partial: PARTIAL_CREDIT,
  gap: GAP_CREDIT,
};

/**
 * Match Score: `100 × Σ(weight × credit) ÷ Σ(weight)`, rounded to an integer between 0 and
 * 100. Mandatory Requirements weigh 3, desirable 1; covered counts 1, partial 0.5, gap 0.
 * A denied Gap is structurally invisible here (RF-25): denied and unanswered both arrive as
 * `gap` and weigh the same. Rounding is `Math.round`, so an exact half always rounds up.
 */
export function calculateMatchScore(coverages: readonly RequirementCoverageInput[]): number {
  const totalWeight = coverages.reduce((sum, entry) => sum + kindWeights[entry.kind], 0);
  if (totalWeight === 0) {
    // A job without Requirements never reaches here (RF-5 rejects non-jobs), but the empty
    // list gets a defined score: 0, not NaN.
    return EMPTY_LIST_SCORE;
  }
  const weightedCredit = coverages.reduce(
    (sum, entry) => sum + kindWeights[entry.kind] * coverageCredits[entry.coverage],
    0,
  );
  return Math.round((SCORE_SCALE * weightedCredit) / totalWeight);
}
