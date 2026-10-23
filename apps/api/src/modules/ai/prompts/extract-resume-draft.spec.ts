import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './extract-resume-draft';

describe('extract-resume-draft prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('extract-resume-draft').name).toBe('extract-resume-draft');
  });

  it('should require json output and forbid education, languages, certifications, courses and skills in evidences', () => {
    const { systemMessage } = getPrompt('extract-resume-draft');

    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('never become evidences');
    expect(systemMessage).toContain('Education');
    expect(systemMessage).toContain('never a sentence');
  });

  it('should copy skills exactly as written, keeping the group label', () => {
    const { systemMessage } = getPrompt('extract-resume-draft');

    expect(systemMessage).toContain('copied exactly as it is written');
    expect(systemMessage).toContain('"group"');
    expect(systemMessage).not.toContain('short keyword');
  });

  it('should keep a composite skill with a slash as one skill', () => {
    const { systemMessage } = getPrompt('extract-resume-draft');

    expect(systemMessage).toContain('"JavaScript/TypeScript"');
    expect(systemMessage).toContain('never split into parts');
  });

  it('should separate skills only by the list separators of the resume', () => {
    const { systemMessage } = getPrompt('extract-resume-draft');

    expect(systemMessage).toContain(
      'Only the list separators of the resume itself (comma, semicolon, bullet, line break) separate one skill from the next.',
    );
  });

  it('should accept a draft with skills, languages, certifications and sectionOrder', () => {
    const { outputSchema } = getPrompt('extract-resume-draft');

    const parsed = outputSchema.safeParse({
      evidences: [{ statement: 'Led a team' }],
      experiences: [],
      education: [],
      skills: [
        { name: 'Node.js', group: null },
        { name: 'React', group: 'Front-end' },
      ],
      languages: [{ name: 'English', level: 'Advanced' }],
      certifications: [{ name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' }],
      sectionOrder: ['experience', 'education', 'skills', 'languages', 'certifications'],
    });

    expect(parsed.success).toBe(true);
  });

  it('should accept the legacy output without the new optional fields', () => {
    const { outputSchema } = getPrompt('extract-resume-draft');

    const parsed = outputSchema.safeParse({
      evidences: [],
      experiences: [],
      education: [],
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject a skill phrased as a sentence', () => {
    const { outputSchema } = getPrompt('extract-resume-draft');

    const parsed = outputSchema.safeParse({
      evidences: [],
      experiences: [],
      education: [],
      skills: [{ name: '   ', group: null }],
    });

    expect(parsed.success).toBe(false);
  });

  it('should accept a summary and describe it as never becoming an evidence', () => {
    const { outputSchema, systemMessage } = getPrompt('extract-resume-draft');

    const parsed = outputSchema.safeParse({
      evidences: [{ statement: 'Led a team' }],
      experiences: [],
      education: [],
      summary: 'Estudante de Engenharia de Software buscando estágio Fullstack.',
    });

    expect(parsed.success).toBe(true);
    expect(systemMessage).toContain('summary');
    expect(systemMessage.toLowerCase()).toContain('never becomes an evidence');
  });

  it('should reject an empty summary', () => {
    const { outputSchema } = getPrompt('extract-resume-draft');

    const parsed = outputSchema.safeParse({
      evidences: [],
      experiences: [],
      education: [],
      summary: '   ',
    });

    expect(parsed.success).toBe(false);
  });
});
