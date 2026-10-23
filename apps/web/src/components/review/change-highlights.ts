import type {
  AdaptationChanges,
  AdaptationReviewResponse,
  ResumeSectionResponse,
} from 'schema/contracts/resume';

export interface ComputeHighlightsInput {
  readonly sections: readonly ResumeSectionResponse[];
  readonly adaptationChanges: AdaptationChanges | null;
  readonly adaptationReview: AdaptationReviewResponse;
}

export interface HighlightBulletRef {
  readonly bulletId: string;
  readonly evidenceId: string;
  readonly text: string;
}

export interface ChangeHighlights {
  readonly highlightedBulletIds: readonly string[];
  readonly pendingRemoved: readonly AdaptationChanges['removedEvidences'][number][];
}

export function computeChangeHighlights(input: ComputeHighlightsInput): ChangeHighlights {
  if (input.adaptationChanges === null) {
    return { highlightedBulletIds: [], pendingRemoved: [] };
  }
  const addedIds = new Set(input.adaptationChanges.addedEvidences.map((item) => item.id));
  const orderedSections = [...input.sections].sort((left, right) => left.ordinal - right.ordinal);
  const highlighted: string[] = [];
  for (const section of orderedSections) {
    const orderedEntries = [...section.entries].sort((left, right) => left.ordinal - right.ordinal);
    for (const entry of orderedEntries) {
      const orderedBullets = [...entry.bullets].sort((left, right) => left.ordinal - right.ordinal);
      for (const bullet of orderedBullets) {
        if (bullet.evidenceId === null || !addedIds.has(bullet.evidenceId)) continue;
        const decision = input.adaptationReview[bullet.evidenceId];
        if (decision === 'accepted' || decision === 'rejected') continue;
        highlighted.push(bullet.id);
      }
    }
  }
  const pendingRemoved = input.adaptationChanges.removedEvidences.filter(
    (item) => input.adaptationReview[item.id] !== 'restored',
  );
  return { highlightedBulletIds: highlighted, pendingRemoved };
}

export function findHighlightBullet(
  sections: readonly ResumeSectionResponse[],
  bulletId: string,
): HighlightBulletRef | null {
  for (const section of sections) {
    for (const entry of section.entries) {
      for (const bullet of entry.bullets) {
        if (bullet.id === bulletId && bullet.evidenceId !== null) {
          return { bulletId: bullet.id, evidenceId: bullet.evidenceId, text: bullet.text };
        }
      }
    }
  }
  return null;
}
