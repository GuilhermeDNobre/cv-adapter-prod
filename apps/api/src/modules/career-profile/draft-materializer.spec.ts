import { describe, expect, it } from 'vitest';
import type { ResumeImportDraft } from 'schema/contracts/resume-import';
import { InvalidDraftDateError, materializeDraft } from './draft-materializer';

describe('materializeDraft', () => {
  it('should map an empty draft to empty collections', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    const result = materializeDraft(draft);

    expect(result.evidences).toHaveLength(0);
    expect(result.experiences).toHaveLength(0);
    expect(result.educationEntries).toHaveLength(0);
    expect(result.contactDetails.fullName).toBeNull();
  });

  it('should map a full draft correctly', () => {
    const draft: ResumeImportDraft = {
      evidences: [
        { statement: 'Led a team of 5 engineers', experienceIndex: 0 },
        { statement: 'Increased revenue by 20%' },
      ],
      experiences: [
        { company: 'Acme Corp', role: 'Senior Engineer', startedOn: '2020-01-01', endedOn: '2023-12-31' },
      ],
      education: [
        { institution: 'MIT', degree: 'BS Computer Science', startedOn: '2016-09-01', endedOn: '2020-06-01' },
      ],
      contactDetails: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+5511999999999',
        city: 'Quixadá, CE',
        links: [{ title: null, url: 'https://linkedin.com/in/jane' }],
      },
    };

    const result = materializeDraft(draft);

    expect(result.evidences).toHaveLength(2);
    expect(result.evidences[0]!.statement).toBe('Led a team of 5 engineers');
    expect(result.evidences[0]!.experienceIndex).toBe(0);
    expect(result.evidences[1]!.statement).toBe('Increased revenue by 20%');
    expect(result.evidences[1]!.experienceIndex).toBeNull();
    expect(result.experiences).toHaveLength(1);
    expect(result.experiences[0]!.company).toBe('Acme Corp');
    expect(result.educationEntries).toHaveLength(1);
    expect(result.educationEntries[0]!.institution).toBe('MIT');
    expect(result.contactDetails.fullName).toBe('Jane Doe');
    expect(result.contactDetails.city).toBe('Quixadá, CE');
  });

  it('should default undefined experienceIndex to null', () => {
    const draft: ResumeImportDraft = {
      evidences: [{ statement: 'Some fact' }],
      experiences: [],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    const result = materializeDraft(draft);

    expect(result.evidences[0]!.experienceIndex).toBeNull();
  });

  it('should preserve null endedOn values', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [
        { company: 'Current Co', role: 'Engineer', startedOn: '2023-01-01', endedOn: null },
      ],
      education: [
        { institution: 'University', degree: 'MS', startedOn: '2021-09-01', endedOn: null },
      ],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    const result = materializeDraft(draft);

    expect(result.experiences[0]!.endedOn).toBeNull();
    expect(result.educationEntries[0]!.endedOn).toBeNull();
  });

  it('should preserve null contact detail fields', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    const result = materializeDraft(draft);

    expect(result.contactDetails.fullName).toBeNull();
    expect(result.contactDetails.email).toBeNull();
    expect(result.contactDetails.phone).toBeNull();
    expect(result.contactDetails.city).toBeNull();
    expect(result.contactDetails.links).toBeNull();
  });

  it('should map contact details with all fields populated', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: {
        fullName: 'John Smith',
        email: 'john@example.com',
        phone: '+1234567890',
        city: 'Lisboa, Portugal',
        links: [
          { title: null, url: 'https://github.com/john' },
          { title: null, url: 'https://linkedin.com/in/john' },
        ],
      },
    };

    const result = materializeDraft(draft);

    expect(result.contactDetails.fullName).toBe('John Smith');
    expect(result.contactDetails.email).toBe('john@example.com');
    expect(result.contactDetails.phone).toBe('+1234567890');
    expect(result.contactDetails.city).toBe('Lisboa, Portugal');
    expect(result.contactDetails.links).toHaveLength(2);
  });

  it('should map multiple evidences linked to the same experience', () => {
    const draft: ResumeImportDraft = {
      evidences: [
        { statement: 'First fact', experienceIndex: 0 },
        { statement: 'Second fact', experienceIndex: 0 },
      ],
      experiences: [
        { company: 'Co', role: 'Role', startedOn: '2020-01-01', endedOn: '2023-01-01' },
      ],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    const result = materializeDraft(draft);

    expect(result.evidences[0]!.experienceIndex).toBe(0);
    expect(result.evidences[1]!.experienceIndex).toBe(0);
  });

  it('should normalize partial dates keeping their precision', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [
        { company: 'Acme Corp', role: 'Engineer', startedOn: '2019', endedOn: '03/2023' },
      ],
      education: [
        { institution: 'State University', degree: 'BS', startedOn: '2015', endedOn: '2019' },
      ],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    const result = materializeDraft(draft);

    expect(result.experiences[0]!.startedOn).toBe('2019');
    expect(result.experiences[0]!.endedOn).toBe('2023-03');
    expect(result.educationEntries[0]!.startedOn).toBe('2015');
    expect(result.educationEntries[0]!.endedOn).toBe('2019');
  });

  it('should throw InvalidDraftDateError with the field for an unreadable experience date', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [
        { company: 'Acme Corp', role: 'Engineer', startedOn: 'Present', endedOn: null },
      ],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    try {
      materializeDraft(draft);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDraftDateError);
      expect((error as InvalidDraftDateError).field).toBe('experiences[0].startedOn');
    }
  });

  it('should throw InvalidDraftDateError with the field for an unreadable education date', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [],
      education: [
        { institution: 'State University', degree: 'BS', startedOn: '2015', endedOn: 'someday' },
      ],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    try {
      materializeDraft(draft);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDraftDateError);
      expect((error as InvalidDraftDateError).field).toBe('educationEntries[0].endedOn');
    }
  });

  it('should materialize skills with groups, languages and certifications', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
      skills: [
        { name: 'Node.js', group: null },
        { name: 'React', group: 'Front-end' },
      ],
      languages: [{ name: 'English', level: 'Advanced' }],
      certifications: [{ name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' }],
    };

    const result = materializeDraft(draft);

    expect(result.skills).toHaveLength(2);
    expect(result.skills[0]).toEqual({ name: 'Node.js', group: null, ordinal: 0 });
    expect(result.skills[1]).toEqual({ name: 'React', group: 'Front-end', ordinal: 1 });
    expect(result.languages).toEqual([{ name: 'English', level: 'Advanced' }]);
    expect(result.certifications).toEqual([
      { name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' },
    ]);
  });

  it('should default missing skills, languages and certifications to empty collections', () => {
    const draft: ResumeImportDraft = {
      evidences: [],
      experiences: [],
      education: [],
      contactDetails: { fullName: null, email: null, phone: null, city: null, links: null },
    };

    const result = materializeDraft(draft);

    expect(result.skills).toHaveLength(0);
    expect(result.languages).toHaveLength(0);
    expect(result.certifications).toHaveLength(0);
  });
});
