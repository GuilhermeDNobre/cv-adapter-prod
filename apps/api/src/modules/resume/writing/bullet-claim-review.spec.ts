import { describe, expect, it } from 'vitest';
import { BulletClaimReview } from './bullet-claim-review';
import type { ResumeDocument } from '../resume.repository';

function document(): ResumeDocument {
  return {
    resume: {},
    sections: [],
    entries: [],
    bullets: [],
    comments: [],
    sectionSkills: [],
    skills: [],
    exports: [],
  } as unknown as ResumeDocument;
}

describe('BulletClaimReview summary sources', () => {
  it('should accept a Requirement term matching a person skill and the job title', () => {
    const review = new BulletClaimReview();
    const career = {
      evidenceById: new Map(),
      experienceById: new Map([
        ['exp-1', { role: 'Desenvolvedor Fullstack', company: 'Acme', startedOn: '2024-01', endedOn: null }],
      ]),
      educationById: new Map([
        ['edu-1', { institution: 'UFC', degree: 'Engenharia de Software', startedOn: '2022', endedOn: null }],
      ]),
      skills: [
        { name: 'React', group: null },
        { name: 'NestJS', group: 'Back-end' },
      ],
    } as unknown as Parameters<BulletClaimReview['reviewClaims']>[0]['career'];
    const section = {
      sectionId: 'summary-1',
      kind: 'summary',
      ordinal: 0,
      bullets: [{ bulletId: 'b-1', evidenceId: 'e-1', currentText: '' }],
    };

    const updates = review.reviewClaims({
      resumeId: 'resume-1',
      language: 'pt',
      section,
      document: document(),
      career,
      allStatements: [],
      aiBullets: [{ evidenceId: 'e-1', text: 'Desenvolvedor Back-end com experiencia em NestJS.' }],
      jobTitle: 'Desenvolvedor Back-end',
      requirements: [
        { literalTerm: 'NestJS', concept: 'NestJS framework' },
        { literalTerm: 'Kafka', concept: 'Kafka messaging' },
      ],
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe('assumed');
  });

  it('should reject a job term the person does not have', () => {
    const review = new BulletClaimReview();
    const career = {
      evidenceById: new Map(),
      experienceById: new Map([
        ['exp-1', { role: 'Desenvolvedor Fullstack', company: 'Acme', startedOn: '2024-01', endedOn: null }],
      ]),
      educationById: new Map(),
      skills: [{ name: 'React', group: null }],
    } as unknown as Parameters<BulletClaimReview['reviewClaims']>[0]['career'];
    const section = {
      sectionId: 'summary-1',
      kind: 'summary',
      ordinal: 0,
      bullets: [{ bulletId: 'b-1', evidenceId: 'e-1', currentText: '' }],
    };

    const updates = review.reviewClaims({
      resumeId: 'resume-1',
      language: 'pt',
      section,
      document: document(),
      career,
      allStatements: [],
      aiBullets: [{ evidenceId: 'e-1', text: 'Trabalho com Kafka em projetos de backend.' }],
      jobTitle: 'Desenvolvedor Back-end',
      requirements: [{ literalTerm: 'Kafka', concept: 'Kafka messaging' }],
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe('suggestion');
    expect(updates[0]?.suggestionQuestion).toContain('Kafka');
  });
});
