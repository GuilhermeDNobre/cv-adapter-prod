import { describe, expect, it } from 'vitest';
import {
  isSameCertification,
  isSameEducation,
  isSameEvidence,
  isSameExperience,
  isSameLanguage,
  isSameSkill,
  normalizeText,
} from './profile-merge';

describe('normalizeText', () => {
  it('should treat uppercase and extra spaces as equal', () => {
    expect(normalizeText('  Acme   Corp ')).toBe(normalizeText('acme corp'));
  });

  it('should treat different words as different', () => {
    expect(normalizeText('Acme Corp')).not.toBe(normalizeText('Beta Ltd'));
  });
});

describe('isSameExperience', () => {
  it('should match when company and role differ only by case and spaces', () => {
    const stored = { company: 'Acme Corp', role: 'Senior Engineer', startedOn: '2020-01-15' };
    const incoming = { company: '  acme   corp ', role: 'SENIOR engineer', startedOn: '2020-01-15' };

    expect(isSameExperience(stored, incoming)).toBe(true);
  });

  it('should not match when the role is renamed', () => {
    const stored = { company: 'Acme Corp', role: 'Senior Engineer', startedOn: '2020-01-15' };
    const incoming = { company: 'Acme Corp', role: 'Lead Engineer', startedOn: '2020-01-15' };

    expect(isSameExperience(stored, incoming)).toBe(false);
  });

  it('should not match when the company differs', () => {
    const stored = { company: 'Acme Corp', role: 'Senior Engineer', startedOn: '2020-01-15' };
    const incoming = { company: 'Beta Ltd', role: 'Senior Engineer', startedOn: '2020-01-15' };

    expect(isSameExperience(stored, incoming)).toBe(false);
  });

  it('should not match when startedOn differs', () => {
    const stored = { company: 'Acme Corp', role: 'Senior Engineer', startedOn: '2020-01-15' };
    const incoming = { company: 'Acme Corp', role: 'Senior Engineer', startedOn: '2021-03-01' };

    expect(isSameExperience(stored, incoming)).toBe(false);
  });
});

describe('isSameEducation', () => {
  it('should match when institution and degree differ only by case and spaces', () => {
    const stored = { institution: 'MIT', degree: 'BS Computer Science', startedOn: '2016-09-01' };
    const incoming = { institution: '  mit ', degree: 'bs  computer   science', startedOn: '2016-09-01' };

    expect(isSameEducation(stored, incoming)).toBe(true);
  });

  it('should not match when the degree differs', () => {
    const stored = { institution: 'MIT', degree: 'BS Computer Science', startedOn: '2016-09-01' };
    const incoming = { institution: 'MIT', degree: 'MS Computer Science', startedOn: '2016-09-01' };

    expect(isSameEducation(stored, incoming)).toBe(false);
  });

  it('should not match when the institution differs', () => {
    const stored = { institution: 'MIT', degree: 'BS Computer Science', startedOn: '2016-09-01' };
    const incoming = { institution: 'Stanford', degree: 'BS Computer Science', startedOn: '2016-09-01' };

    expect(isSameEducation(stored, incoming)).toBe(false);
  });

  it('should not match when startedOn differs', () => {
    const stored = { institution: 'MIT', degree: 'BS Computer Science', startedOn: '2016-09-01' };
    const incoming = { institution: 'MIT', degree: 'BS Computer Science', startedOn: '2017-09-01' };

    expect(isSameEducation(stored, incoming)).toBe(false);
  });
});

describe('isSameEvidence', () => {
  it('should match the same statement with the same experience', () => {
    const stored = { experienceId: 'exp-1', statement: 'Led a team of five' };
    const incoming = { experienceId: 'exp-1', statement: '  led   A TEAM of five ' };

    expect(isSameEvidence(stored, incoming)).toBe(true);
  });

  it('should treat two null experiences as equal', () => {
    const stored = { experienceId: null, statement: 'Organized workshops' };
    const incoming = { experienceId: null, statement: 'organized   workshops' };

    expect(isSameEvidence(stored, incoming)).toBe(true);
  });

  it('should not match when the experience differs', () => {
    const stored = { experienceId: 'exp-1', statement: 'Led a team of five' };
    const incoming = { experienceId: 'exp-2', statement: 'Led a team of five' };

    expect(isSameEvidence(stored, incoming)).toBe(false);
  });

  it('should not match when the statement differs', () => {
    const stored = { experienceId: null, statement: 'Organized workshops' };
    const incoming = { experienceId: null, statement: 'Shipped a mobile app' };

    expect(isSameEvidence(stored, incoming)).toBe(false);
  });
});

describe('isSameSkill', () => {
  it('should match the same skill name ignoring case and spaces', () => {
    expect(isSameSkill({ name: 'Node.js' }, { name: '  node.js  ' })).toBe(true);
  });

  it('should not match different skill names', () => {
    expect(isSameSkill({ name: 'Node.js' }, { name: 'React' })).toBe(false);
  });
});

describe('isSameLanguage', () => {
  it('should match the same language name ignoring case', () => {
    expect(isSameLanguage({ name: 'English' }, { name: 'english' })).toBe(true);
  });

  it('should not match different language names', () => {
    expect(isSameLanguage({ name: 'English' }, { name: 'Spanish' })).toBe(false);
  });
});

describe('isSameCertification', () => {
  it('should match the same certification name ignoring case', () => {
    expect(
      isSameCertification({ name: 'Scrum Foundations' }, { name: 'scrum  foundations' }),
    ).toBe(true);
  });

  it('should not match different certification names', () => {
    expect(isSameCertification({ name: 'AWS SAA' }, { name: 'Scrum Foundations' })).toBe(false);
  });
});
