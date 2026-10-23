import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './write-profile-summary';
import { calculateExperienceYears } from './write-profile-summary';

describe('write-profile-summary prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('write-profile-summary').name).toBe('write-profile-summary');
  });

  it('should carry the original summary, positions, education and skills in the payload shape', () => {
    const { systemMessage } = getPrompt('write-profile-summary');

    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('Brazilian Portuguese');
    expect(systemMessage).toContain('Estudante de Engenharia de Software');
  });

  it('should forbid copying evidences and metrics in the system text', () => {
    const { systemMessage } = getPrompt('write-profile-summary');
    const lowered = systemMessage.toLowerCase();

    expect(lowered).toContain('never copy');
    expect(lowered).toContain('evidences');
    expect(lowered).toContain('never state metrics');
  });

  it('should state that the tailored summary is aligned to the job', () => {
    const { systemMessage } = getPrompt('write-profile-summary');

    expect(systemMessage).toContain('FOR THE JOB');
    expect(systemMessage).toContain('mandatory Requirements first');
  });

  it('should only allow technologies, tools and titles from the input lists and keep the job wording to order and area', () => {
    const { systemMessage } = getPrompt('write-profile-summary');

    expect(systemMessage).toContain('may only come from the input skills');
    expect(systemMessage).toContain('only sets the order and the area');
    expect(systemMessage).toContain('never new technology or title names');
  });

  it('should always require two to three sentences with the identity first and honor rejectedTerms', () => {
    const { systemMessage } = getPrompt('write-profile-summary');

    expect(systemMessage).toContain('Always output two to three sentences');
    expect(systemMessage).toContain('first sentence always carrying the professional identity');
    expect(systemMessage).toContain('When rejectedTerms are provided, do not use');
  });

  it('should separate softRequirements and decide with at most one clause without exceeding 3 sentences', () => {
    const { systemMessage } = getPrompt('write-profile-summary');

    expect(systemMessage).toContain('softRequirements');
    expect(systemMessage).toContain('at most one clause');
    expect(systemMessage).toContain('without inventing experience');
    expect(systemMessage).toContain('keep the summary succinct');
    expect(systemMessage).toContain('Never output more than 3 sentences');
  });

  it('should accept a well-formed profile summary output', () => {
    const { outputSchema } = getPrompt('write-profile-summary');

    const parsed = outputSchema.safeParse({
      bullets: [{ text: 'Estudante de Engenharia de Software buscando estagio.' }],
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject a malformed profile summary output', () => {
    const { outputSchema } = getPrompt('write-profile-summary');

    const parsed = outputSchema.safeParse({ bullets: [{ text: '' }] });

    expect(parsed.success).toBe(false);
  });

  it('should calculate seniority from position periods', () => {
    expect(
      calculateExperienceYears(
        [{ startedOn: '2020-01', endedOn: '2022-01' }],
        new Date('2026-09-25T00:00:00.000Z'),
      ),
    ).toBe(2);
    expect(
      calculateExperienceYears(
        [
          { startedOn: '2018-01', endedOn: '2020-01' },
          { startedOn: '2020-01', endedOn: null },
        ],
        new Date('2026-09-25T00:00:00.000Z'),
      ),
    ).toBe(8);
    expect(calculateExperienceYears([])).toBe(0);
  });
});
