import { describe, expect, it } from 'vitest';
import { CreateTailoredResumePipe } from './tailored-resume.controller';

const BASE_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';

describe('CreateTailoredResumePipe', () => {
  it('should accept a request without a language', () => {
    const pipe = new CreateTailoredResumePipe();

    const result = pipe.transform({ baseResumeId: BASE_ID, jobDescriptionId: JOB_ID });

    expect(result).toEqual({ baseResumeId: BASE_ID, jobDescriptionId: JOB_ID });
  });

  it('should accept a request with an explicit language', () => {
    const pipe = new CreateTailoredResumePipe();

    const result = pipe.transform({ baseResumeId: BASE_ID, jobDescriptionId: JOB_ID, language: 'en' });

    expect(result).toEqual({ baseResumeId: BASE_ID, jobDescriptionId: JOB_ID, language: 'en' });
  });

  it('should reject an unsupported language', () => {
    const pipe = new CreateTailoredResumePipe();

    expect(() => pipe.transform({ baseResumeId: BASE_ID, jobDescriptionId: JOB_ID, language: 'es' })).toThrow();
  });
});
