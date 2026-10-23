import { describe, expect, it } from 'vitest';
import { orderSkills } from './skill-order';

function skill(id: string, name: string, group: string | null, ordinal: number) {
  return { id, name, group, ordinal, createdAt: new Date('2026-01-01T00:00:00.000Z') };
}

describe('orderSkills', () => {
  it('should keep Linguagens before Back-end following the extraction order', () => {
    const ordered = orderSkills([
      skill('a', 'A', 'Linguagens', 0),
      skill('b', 'B', 'Linguagens', 1),
      skill('c', 'C', 'Back-end', 2),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    const groups: string[] = [];
    for (const item of ordered) {
      if (item.group !== null && !groups.includes(item.group)) {
        groups.push(item.group);
      }
    }
    expect(groups).toEqual(['Linguagens', 'Back-end']);
  });

  it('should order groups by their first skill even when names are alphabetical reversed', () => {
    const ordered = orderSkills([
      skill('c', 'C', 'Back-end', 2),
      skill('a', 'A', 'Linguagens', 0),
      skill('b', 'B', 'Linguagens', 1),
    ]);

    expect(ordered.map((item) => item.name)).toEqual(['A', 'B', 'C']);
  });

  it('should keep ungrouped skills last', () => {
    const ordered = orderSkills([
      skill('u', 'Docker', null, 3),
      skill('a', 'A', 'Linguagens', 0),
      skill('c', 'C', 'Back-end', 1),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['a', 'c', 'u']);
  });
});
