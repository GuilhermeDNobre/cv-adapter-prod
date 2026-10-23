import { describe, expect, it } from 'vitest';
import { resolveResumeStructure } from './resume-structure';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    sectionOrder: undefined,
    hasSummary: true,
    hasExperience: true,
    hasEducation: true,
    hasSkills: true,
    hasLanguages: true,
    hasCertifications: false,
    hasCustom: false,
    experienceRows: [{ startedOn: '2020-01', endedOn: null }],
    educationRows: [{ endedOn: '2019' }],
    ...overrides,
  };
}

describe('resolveResumeStructure', () => {
  it('should keep the original sectionOrder with its own languages section', () => {
    const result = resolveResumeStructure(
      baseInput({
        sectionOrder: ['summary', 'skills', 'experience', 'custom', 'education', 'languages'],
        hasCertifications: false,
        hasCustom: true,
        experienceRows: [{ startedOn: '2020-01', endedOn: null }],
        educationRows: [{ endedOn: '2019' }],
      }),
    );

    expect(result).toEqual(['summary', 'skills', 'experience', 'custom', 'education', 'languages']);
  });

  it('should use Resumo, Experiencia, Habilidades, Educacao without a separate languages section when there is no import', () => {
    const result = resolveResumeStructure(
      baseInput({
        sectionOrder: undefined,
        hasSummary: true,
        hasExperience: true,
        hasEducation: true,
        hasSkills: true,
        hasLanguages: true,
        hasCertifications: false,
        hasCustom: false,
        experienceRows: [{ startedOn: '2018-01', endedOn: '2024-01' }],
        educationRows: [{ endedOn: '2019' }],
      }),
    );

    expect(result).toEqual(['summary', 'experience', 'skills', 'education']);
  });

  it('should move education right after summary for a student', () => {
    const result = resolveResumeStructure(
      baseInput({
        sectionOrder: undefined,
        hasSummary: true,
        hasExperience: true,
        hasEducation: true,
        hasSkills: true,
        hasLanguages: true,
        hasCertifications: false,
        hasCustom: false,
        experienceRows: [],
        educationRows: [{ endedOn: null }],
      }),
    );

    expect(result[0]).toBe('summary');
    expect(result[1]).toBe('education');
  });

  it('should move education second when experience sums to less than a year', () => {
    const result = resolveResumeStructure(
      baseInput({
        sectionOrder: undefined,
        hasSummary: true,
        hasExperience: true,
        hasEducation: true,
        hasSkills: true,
        hasLanguages: false,
        hasCertifications: false,
        hasCustom: false,
        experienceRows: [{ startedOn: '2026-03', endedOn: '2026-06' }],
        educationRows: [{ endedOn: '2019' }],
      }),
    );

    expect(result).toEqual(['summary', 'education', 'experience', 'skills']);
  });

  it('should append certifications after education in the template default', () => {
    const result = resolveResumeStructure(
      baseInput({
        sectionOrder: undefined,
        hasSummary: true,
        hasExperience: true,
        hasEducation: true,
        hasSkills: true,
        hasLanguages: true,
        hasCertifications: true,
        hasCustom: false,
        experienceRows: [{ startedOn: '2018-01', endedOn: '2024-01' }],
        educationRows: [{ endedOn: '2019' }],
      }),
    );

    expect(result).toEqual(['summary', 'experience', 'skills', 'education', 'certifications']);
  });
});
