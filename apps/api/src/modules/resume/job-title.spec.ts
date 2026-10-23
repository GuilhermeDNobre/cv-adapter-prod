import { describe, expect, it } from 'vitest';
import { buildTailoredName, deriveJobTitle } from './job-title';

describe('deriveJobTitle', () => {
  it('should return the first non-empty trimmed line', () => {
    expect(deriveJobTitle('\n  Senior Full Stack Developer  \n\nBody')).toBe('Senior Full Stack Developer');
  });

  it('should cut a long title at 120 characters', () => {
    const longTitle = `A${'a'.repeat(200)}`;
    expect(deriveJobTitle(`${longTitle}\nBody`)).toHaveLength(120);
  });

  it('should return null for a blank job text', () => {
    expect(deriveJobTitle('\n   \n')).toBeNull();
  });
});

describe('buildTailoredName', () => {
  it('should combine the base name with the job title', () => {
    expect(buildTailoredName({ baseName: 'Base', jobTitle: 'Senior Developer' })).toBe(
      'Base — Senior Developer',
    );
  });

  it('should keep the base name when the job title is null', () => {
    expect(buildTailoredName({ baseName: 'Base', jobTitle: null })).toBe('Base');
  });

  it('should cut the combined name at the contract limit', () => {
    const baseName = `B${'b'.repeat(200)}`;
    expect(buildTailoredName({ baseName, jobTitle: 'Senior Developer' }).length).toBeLessThanOrEqual(200);
  });
});
