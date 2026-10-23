import { describe, expect, it } from 'vitest';
import { isResumeAreaPath, resumeStepHref, stepOfPath, wizardQueryOf } from './wizard-route';

const JOB_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';

describe('wizardQueryOf', () => {
  it('should be empty without ids', () => {
    expect(wizardQueryOf({})).toBe('');
  });

  it('should keep vaga, avaliacao and base in that order and skip empty values', () => {
    expect(wizardQueryOf({ jobDescriptionId: 'j1', evaluationId: 'e1', baseResumeId: 'b1' })).toBe(
      '?vaga=j1&avaliacao=e1&base=b1',
    );
    expect(wizardQueryOf({ jobDescriptionId: 'j1', evaluationId: '', baseResumeId: 'b1' })).toBe(
      '?vaga=j1&base=b1',
    );
  });
});

describe('resumeStepHref', () => {
  it('should point at the resume step with the flow ids', () => {
    expect(resumeStepHref({})).toBe('/curriculo');
    expect(resumeStepHref({ jobDescriptionId: JOB_ID })).toBe(`/curriculo?vaga=${JOB_ID}`);
  });
});

describe('stepOfPath', () => {
  it.each([
    ['/vaga', 'vaga'],
    ['/curriculo', 'curriculo'],
    ['/importacao', 'curriculo'],
    ['/revisao', 'curriculo'],
    ['/revisao/base-resume', 'curriculo'],
    ['/pronto', 'curriculo'],
    ['/avaliacao', 'avaliacao'],
    ['/avaliacao/3f2a7c5b', 'avaliacao'],
    ['/adaptar', 'adaptar'],
    ['/revisar/6a1e4f8c', 'revisar'],
    ['/exportar/6a1e4f8c', 'exportar'],
  ])('should map %s to %s', (pathname, step) => {
    expect(stepOfPath(pathname)).toBe(step);
  });
});

describe('isResumeAreaPath', () => {
  it.each(['/importacao', '/revisao', '/revisao/base-resume', '/pronto'])(
    'should frame %s as the resume area when no vaga is carried',
    (pathname) => {
      expect(isResumeAreaPath(pathname, null)).toBe(true);
      expect(isResumeAreaPath(pathname, '')).toBe(true);
    },
  );

  it('should frame the import screens as the wizard when a vaga is carried', () => {
    expect(isResumeAreaPath('/revisao', JOB_ID)).toBe(false);
    expect(isResumeAreaPath('/pronto', JOB_ID)).toBe(false);
  });

  it.each(['/vaga', '/curriculo', '/avaliacao', '/adaptar', '/revisar/6a1e4f8c'])(
    'should keep %s inside the wizard',
    (pathname) => {
      expect(isResumeAreaPath(pathname, null)).toBe(false);
    },
  );
});
