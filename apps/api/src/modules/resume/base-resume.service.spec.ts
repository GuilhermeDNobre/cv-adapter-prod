import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BaseResumeService } from './base-resume.service';
import { ResumeRepository } from './resume.repository';

function makeDatabase(options: {
  hasProfile: boolean;
  experiences: Array<{ id: string; startedOn: string; endedOn: string | null }>;
  education?: Array<{ id: string }>;
  evidences?: Array<{ id: string; statement: string; experienceId: string | null }>;
  skills?: Array<{ id: string }>;
  languages?: Array<{ id: string }>;
  certifications?: Array<{ id: string }>;
  sectionOrder?: readonly string[];
}): unknown {
  const profileRows = options.hasProfile ? [{ id: 'profile-id' }] : [];
  const experienceRows = options.experiences.map((exp) => ({
    id: exp.id,
    careerProfileId: 'profile-id',
    company: 'Acme',
    role: 'Engineer',
    startedOn: exp.startedOn,
    endedOn: exp.endedOn,
    createdAt: new Date(),
  }));
  const educationRows = (options.education ?? []).map((edu) => ({
    id: edu.id,
    careerProfileId: 'profile-id',
    institution: 'MIT',
    degree: 'BS',
    startedOn: '2015',
    endedOn: '2019',
    createdAt: new Date(),
  }));
  const evidenceRows = (options.evidences ?? []).map((ev) => ({
    id: ev.id,
    careerProfileId: 'profile-id',
    experienceId: ev.experienceId,
    statement: ev.statement,
    createdAt: new Date(),
  }));
  const skillRows = (options.skills ?? []).map((skill) => ({
    id: skill.id,
    careerProfileId: 'profile-id',
    name: 'Node.js',
    group: null,
    createdAt: new Date(),
  }));
  const languageRows = (options.languages ?? []).map((language) => ({
    id: language.id,
    careerProfileId: 'profile-id',
    name: 'Português',
    level: 'Nativo',
    createdAt: new Date(),
  }));
  const certificationRows = (options.certifications ?? []).map((certification) => ({
    id: certification.id,
    careerProfileId: 'profile-id',
    name: 'AWS SAA',
    issuer: 'Amazon',
    year: '2023',
    createdAt: new Date(),
  }));
  const importRows =
    options.sectionOrder === undefined
      ? []
      : [{ draft: { sectionOrder: [...options.sectionOrder] } }];
  let callIndex = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      callIndex += 1;
      if (callIndex === 1) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(profileRows) }) };
      }
      if (callIndex === 2) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(experienceRows) }) };
      }
      if (callIndex === 3) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(educationRows) }) };
      }
      if (callIndex === 4) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(evidenceRows) }) };
      }
      if (callIndex === 5) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(skillRows) }) };
      }
      if (callIndex === 6) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(languageRows) }) };
      }
      if (callIndex === 7) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(certificationRows) }) };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(importRows),
            }),
          }),
        }),
      };
    }),
  };
}

function makeRepository(): ResumeRepository & { createBaseResume: ReturnType<typeof vi.fn> } {
  return {
    createBaseResume: vi.fn().mockResolvedValue('resume-id'),
  } as unknown as ResumeRepository & { createBaseResume: ReturnType<typeof vi.fn> };
}

function makeQueue(): { add: ReturnType<typeof vi.fn> } {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

describe('BaseResumeService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should apply defaults comfortable, xyz and direct', async () => {
    const database = makeDatabase({ hasProfile: true, experiences: [] });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await service.createBaseResume('user-1', { name: 'Backend focus' });

    expect(repository.createBaseResume).toHaveBeenCalledTimes(1);
    const input = repository.createBaseResume.mock.calls[0]![0] as {
      template: string;
      writingMethod: string;
      tone: string;
      language: string;
    };
    expect(input.template).toBe('comfortable');
    expect(input.writingMethod).toBe('xyz');
    expect(input.tone).toBe('direct');
    expect(input.language).toBe('pt');
  });

  it('should default lengthTarget to 2 when experience exceeds 5 years', async () => {
    const database = makeDatabase({
      hasProfile: true,
      experiences: [{ id: 'exp-1', startedOn: '2015-01-01', endedOn: '2022-01-01' }],
    });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await service.createBaseResume('user-1', {
      name: 'Long career',
      sections: [{ kind: 'experience', experienceIds: ['exp-1'] }],
    });

    const input = repository.createBaseResume.mock.calls[0]![0] as { lengthTarget: number };
    expect(input.lengthTarget).toBe(2);
  });

  it('should default lengthTarget to 1 when experience is within 5 years', async () => {
    const database = makeDatabase({
      hasProfile: true,
      experiences: [{ id: 'exp-1', startedOn: '2020-01-01', endedOn: '2023-01-01' }],
    });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await service.createBaseResume('user-1', {
      name: 'Short career',
      sections: [{ kind: 'experience', experienceIds: ['exp-1'] }],
    });

    const input = repository.createBaseResume.mock.calls[0]![0] as { lengthTarget: number };
    expect(input.lengthTarget).toBe(1);
  });

  it('should throw 422 when there is no Career Profile', async () => {
    const database = makeDatabase({ hasProfile: false, experiences: [] });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await expect(service.createBaseResume('user-1', { name: 'No profile' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repository.createBaseResume).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('should keep one bullet per evidence and no evidence in two sections', async () => {
    const evidenceA = 'aaaaaaaa-1111-4111-8111-111111111111';
    const evidenceB = 'bbbbbbbb-2222-4222-8222-222222222222';
    const database = makeDatabase({
      hasProfile: true,
      experiences: [{ id: 'exp-1', startedOn: '2020-01-01', endedOn: null }],
      evidences: [
        { id: evidenceA, statement: 'Led team of five engineers', experienceId: 'exp-1' },
        { id: evidenceB, statement: 'Shipped checkout flow', experienceId: 'exp-1' },
      ],
    });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await service.createBaseResume('user-1', {
      name: 'Dedup',
      sections: [
        { kind: 'experience', experienceIds: ['exp-1'], evidenceIds: [evidenceA, evidenceB] },
        { kind: 'skills', evidenceIds: [evidenceA, evidenceB] },
      ],
    });

    const input = repository.createBaseResume.mock.calls[0]![0] as {
      sections: Array<{ kind: string; entries: Array<{ bullets: Array<{ evidenceId: string }> }> }>;
    };
    const allEvidenceIds = input.sections.flatMap((section) =>
      section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.evidenceId)),
    );
    expect(allEvidenceIds).toHaveLength(2);
    expect(new Set(allEvidenceIds).size).toBe(2);
    const firstSectionBullets = input.sections[0]!.entries.flatMap((entry) => entry.bullets);
    const secondSectionBullets = input.sections[1]!.entries.flatMap((entry) => entry.bullets);
    expect(firstSectionBullets).toHaveLength(2);
    expect(secondSectionBullets).toHaveLength(0);
  });

  it('should enqueue write-base with default job options', async () => {
    const database = makeDatabase({ hasProfile: true, experiences: [] });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await service.createBaseResume('user-1', { name: 'Queue check' });

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'write-base',
      { resumeId: 'resume-id', userId: 'user-1' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('should persist approved bullets with the chosen text instead of the evidence statement', async () => {
    const evidenceId = 'aaaaaaaa-1111-4111-8111-111111111111';
    const database = makeDatabase({
      hasProfile: true,
      experiences: [{ id: 'exp-1', startedOn: '2020-01-01', endedOn: null }],
      evidences: [{ id: evidenceId, statement: 'Led team of five engineers', experienceId: 'exp-1' }],
    });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await service.createBaseResume('user-1', {
      name: 'Approved proposal',
      writingMethod: 'xyz',
      tone: 'direct',
      sections: [
        {
          kind: 'experience',
          entries: [
            {
              experienceId: 'exp-1',
              bullets: [{ evidenceId, text: 'Rewritten chosen text' }],
            },
          ],
        },
      ],
    });

    const input = repository.createBaseResume.mock.calls[0]![0] as {
      writingMethod: string;
      tone: string;
      sections: Array<{ kind: string; entries: Array<{ bullets: Array<{ evidenceId: string; text: string }> }> }>;
    };
    expect(input.writingMethod).toBe('xyz');
    expect(input.tone).toBe('direct');
    expect(input.sections[0]!.entries[0]!.bullets[0]?.text).toBe('Rewritten chosen text');
    expect(input.sections[0]!.entries[0]!.bullets[0]?.evidenceId).toBe(evidenceId);
  });

  it('should carry skillIds into the created skills section', async () => {
    const skillId = 'bbbbbbbb-2222-4222-8222-222222222222';
    const database = makeDatabase({
      hasProfile: true,
      experiences: [],
      skills: [{ id: skillId }],
    });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await service.createBaseResume('user-1', {
      name: 'With skills',
      sections: [{ kind: 'skills', skillIds: [skillId] }],
    });

    const input = repository.createBaseResume.mock.calls[0]![0] as {
      sections: Array<{ kind: string; skillIds?: string[] }>;
    };
    expect(input.sections[0]?.kind).toBe('skills');
    expect(input.sections[0]?.skillIds).toEqual([skillId]);
  });

  it('should follow the original sectionOrder for a manual form with an existing import', async () => {
    const database = makeDatabase({
      hasProfile: true,
      experiences: [{ id: 'exp-1', startedOn: '2018-01-01', endedOn: null }],
      education: [{ id: 'edu-1' }],
      skills: [{ id: 'bbbbbbbb-2222-4222-8222-222222222222' }],
      sectionOrder: ['summary', 'skills', 'experience', 'education'],
    });
    const repository = makeRepository();
    const queue = makeQueue();
    const service = new BaseResumeService(
      database as never,
      repository as never,
      queue as never,
    );

    await service.createBaseResume('user-1', {
      name: 'Manual with import',
      sections: [
        { kind: 'experience', experienceIds: ['exp-1'] },
        { kind: 'education', educationEntryIds: ['edu-1'] },
        { kind: 'skills', skillIds: ['bbbbbbbb-2222-4222-8222-222222222222'] },
        { kind: 'summary' },
      ],
    });

    const created = repository.createBaseResume.mock.calls[0]![0] as {
      sections: Array<{ kind: string }>;
    };
    expect(created.sections.map((section) => section.kind)).toEqual([
      'summary',
      'skills',
      'experience',
      'education',
    ]);
  });
});
