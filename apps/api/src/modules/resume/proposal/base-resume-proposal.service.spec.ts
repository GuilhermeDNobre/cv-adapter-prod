import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { BaseResumeProposalService } from './base-resume-proposal.service';
import type { AiClient } from '../../ai/ai-client';
import type { Database } from '../../database/database.provider';

const IMPORT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const EXP_1 = '22222222-2222-4222-8222-222222222222';
const EXP_2 = '33333333-3333-4333-8333-333333333333';
const EV_1 = '44444444-4444-4444-8444-444444444444';
const EV_2 = '55555555-5555-4555-8555-555555555555';
const EV_3 = '66666666-6666-4666-8666-666666666666';
const SKILL_1 = '77777777-7777-4777-8777-777777777777';
const EDU_1 = '88888888-8888-4888-8888-888888888888';

const STYLE = { writingMethod: 'xyz', tone: 'direct', averageBulletWords: 12 } as const;

function makeImportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IMPORT_ID,
    userId: USER_ID,
    storageKey: null,
    status: 'confirmed',
    failureReason: null,
    draft: { sectionOrder: ['experience', 'education', 'skills'] },
    writingStyle: { ...STYLE },
    baseResumeProposal: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCareerRows(): {
  experiences: Array<{
    id: string;
    careerProfileId: string;
    company: string;
    role: string;
    startedOn: string;
    endedOn: string | null;
    createdAt: Date;
  }>;
  education: Array<{
    id: string;
    careerProfileId: string;
    institution: string;
    degree: string;
    startedOn: string;
    endedOn: string | null;
    createdAt: Date;
  }>;
  evidences: Array<{
    id: string;
    careerProfileId: string;
    experienceId: string | null;
    statement: string;
    createdAt: Date;
  }>;
  skills: Array<{
    id: string;
    careerProfileId: string;
    name: string;
    group: string | null;
    createdAt: Date;
  }>;
  languages: Array<{ id: string; careerProfileId: string; name: string; level: string | null; createdAt: Date }>;
  certifications: Array<{
    id: string;
    careerProfileId: string;
    name: string;
    issuer: string | null;
    year: string | null;
    createdAt: Date;
  }>;
} {
  return {
    experiences: [
      {
        id: EXP_1,
        careerProfileId: PROFILE_ID,
        company: 'Acme',
        role: 'Engineer',
        startedOn: '2020-01',
        endedOn: null,
        createdAt: new Date(),
      },
      {
        id: EXP_2,
        careerProfileId: PROFILE_ID,
        company: 'Globex',
        role: 'Senior Engineer',
        startedOn: '2022-01',
        endedOn: null,
        createdAt: new Date(),
      },
    ],
    education: [
      {
        id: EDU_1,
        careerProfileId: PROFILE_ID,
        institution: 'USP',
        degree: 'Computer Science',
        startedOn: '2016',
        endedOn: '2019',
        createdAt: new Date(),
      },
    ],
    evidences: [
      {
        id: EV_1,
        careerProfileId: PROFILE_ID,
        experienceId: EXP_1,
        statement: 'Led a team of five engineers',
        createdAt: new Date(),
      },
      {
        id: EV_2,
        careerProfileId: PROFILE_ID,
        experienceId: EXP_2,
        statement: 'Shipped checkout flow',
        createdAt: new Date(),
      },
      {
        id: EV_3,
        careerProfileId: PROFILE_ID,
        experienceId: EXP_2,
        statement: 'Reduced latency by tuning queries',
        createdAt: new Date(),
      },
    ],
    skills: [
      {
        id: SKILL_1,
        careerProfileId: PROFILE_ID,
        name: 'Node.js',
        group: null,
        createdAt: new Date(),
      },
    ],
    languages: [],
    certifications: [],
  };
}

function makeDatabase(importRow: unknown, career = makeCareerRows()): Database {
  let selectCalls = 0;
  const updates: unknown[] = [];
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(async () => {
        selectCalls += 1;
        if (selectCalls === 1) {
          return importRow === undefined ? [] : [importRow];
        }
        if (selectCalls === 2) {
          return [{ id: PROFILE_ID }];
        }
        if (selectCalls === 3) {
          return career.experiences;
        }
        if (selectCalls === 4) {
          return career.education;
        }
        if (selectCalls === 5) {
          return career.evidences;
        }
        if (selectCalls === 6) {
          return career.skills;
        }
        if (selectCalls === 7) {
          return career.languages;
        }
        return career.certifications;
      }),
    }),
  }));
  const update = vi.fn().mockReturnValue({
    set: vi.fn((values: unknown) => {
      updates.push(values);
      return { where: vi.fn().mockResolvedValue([]) };
    }),
  });
  return { select, update } as unknown as Database;
}

function makeAiClient(
  rewrite: (evidences: Array<{ id: string }>) => Array<{ evidenceId: string; text: string }>,
): AiClient {
  return {
    complete: vi.fn(
      async (request: { promptName: string; payload: { evidences?: Array<{ id: string }> } }) => {
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: 'Estudante de Engenharia de Software buscando estagio.' }] };
        }
        return { bullets: rewrite(request.payload.evidences ?? []) };
      },
    ),
  } as unknown as AiClient;
}

function makeCareerDatabase(career = makeCareerRows()): Database {
  let selectCalls = 0;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          selectCalls += 1;
          if (selectCalls === 1) {
            return [{ id: PROFILE_ID }];
          }
          if (selectCalls === 2) {
            return career.experiences;
          }
          if (selectCalls === 3) {
            return career.education;
          }
          if (selectCalls === 4) {
            return career.evidences;
          }
          if (selectCalls === 5) {
            return career.skills;
          }
          if (selectCalls === 6) {
            return career.languages;
          }
          return career.certifications;
        }),
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    }),
  } as unknown as Database;
}

describe('BaseResumeProposalService.getProposal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw 404 when the import id is not a uuid', async () => {
    const service = new BaseResumeProposalService(makeDatabase(undefined), makeAiClient(() => []));

    await expect(service.getProposal('not-a-uuid', USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw 404 when the import does not exist', async () => {
    const service = new BaseResumeProposalService(makeDatabase(undefined), makeAiClient(() => []));

    await expect(service.getProposal(IMPORT_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw 422 when the import was not confirmed', async () => {
    const row = makeImportRow({ status: 'ready_for_review' });
    const service = new BaseResumeProposalService(makeDatabase(row), makeAiClient(() => []));

    await expect(service.getProposal(IMPORT_ID, USER_ID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('should return generating when no proposal was stored yet', async () => {
    const row = makeImportRow({ baseResumeProposal: null });
    const service = new BaseResumeProposalService(makeDatabase(row), makeAiClient(() => []));

    const response = await service.getProposal(IMPORT_ID, USER_ID);

    expect(response.status).toBe('generating');
    expect(response.proposal).toBeNull();
    expect(response.failureReason).toBeNull();
  });

  it('should return the stored ready proposal', async () => {
    const proposal = {
      name: 'Engineer at Acme',
      language: 'en',
      style: { ...STYLE },
      sections: [],
    };
    const row = makeImportRow({
      baseResumeProposal: { status: 'ready', proposal, failureReason: null },
    });
    const service = new BaseResumeProposalService(makeDatabase(row), makeAiClient(() => []));

    const response = await service.getProposal(IMPORT_ID, USER_ID);

    expect(response.status).toBe('ready');
    expect(response.proposal).toEqual(proposal);
  });
});

describe('BaseResumeProposalService.generateProposal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should order sections as the original sectionOrder', async () => {
    const row = makeImportRow({
      draft: { sectionOrder: ['skills', 'experience', 'education'] },
    });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Rewritten ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(), aiClient);

    const proposal = await service.generateProposal(row as never);

    expect(proposal.sections.map((section) => section.kind)).toEqual([
      'skills',
      'experience',
      'education',
    ]);
  });

  it('should link every bullet to its evidence with original and rewritten text', async () => {
    const row = makeImportRow({ draft: { sectionOrder: ['experience', 'skills'] } });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Rewritten ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(), aiClient);

    const proposal = await service.generateProposal(row as never);

    const experience = proposal.sections.find((section) => section.kind === 'experience');
    expect(experience).toBeDefined();
    const bullets = experience!.entries.flatMap((entry) => entry.bullets);
    expect(bullets).toHaveLength(3);
    for (const bullet of bullets) {
      expect(bullet.evidenceId).not.toBeNull();
      expect(bullet.original.length).toBeGreaterThan(0);
      expect(bullet.text).toContain('Rewritten');
    }
    const byEvidence = new Map(bullets.map((bullet) => [bullet.evidenceId, bullet]));
    expect(byEvidence.get(EV_1)?.original).toBe('Led a team of five engineers');
    expect(byEvidence.get(EV_2)?.original).toBe('Shipped checkout flow');
    const skillSection = proposal.sections.find((section) => section.kind === 'skills');
    expect(skillSection?.skillIds).toEqual([SKILL_1]);
  });

  it('should keep the original and mark the experience when the AI fails for it', async () => {
    const row = makeImportRow({ draft: { sectionOrder: ['experience'] } });
    const aiClient: AiClient = {
      complete: vi.fn(async (request: { payload: { evidences: Array<{ id: string }> } }) => {
        const ids = request.payload.evidences.map((evidence) => evidence.id);
        if (ids.includes(EV_1)) {
          throw new Error('ai boom');
        }
        return {
          bullets: request.payload.evidences.map((evidence) => ({
            evidenceId: evidence.id,
            text: `Rewritten ${evidence.id}`,
          })),
        };
      }),
    } as unknown as AiClient;
    const service = new BaseResumeProposalService(makeCareerDatabase(), aiClient);

    const proposal = await service.generateProposal(row as never);

    const experience = proposal.sections.find((section) => section.kind === 'experience');
    expect(experience).toBeDefined();
    const firstEntry = experience!.entries.find((entry) => entry.experienceId === EXP_1);
    expect(firstEntry?.rewriteFailed).toBe(true);
    expect(firstEntry?.bullets[0]?.text).toBe('Led a team of five engineers');
    expect(firstEntry?.bullets[0]?.original).toBe('Led a team of five engineers');
    const secondEntry = experience!.entries.find((entry) => entry.experienceId === EXP_2);
    expect(secondEntry?.rewriteFailed).toBeUndefined();
    expect(secondEntry?.bullets[0]?.text).toContain('Rewritten');
  });

  it('should log rewrite_failed with the experience id and keep the fallback when the AI fails', async () => {
    const row = makeImportRow({ draft: { sectionOrder: ['experience'] } });
    const aiClient: AiClient = {
      complete: vi.fn(async () => {
        throw new Error('ai boom');
      }),
    } as unknown as AiClient;
    const service = new BaseResumeProposalService(makeCareerDatabase(), aiClient);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const proposal = await service.generateProposal(row as never);

    expect(errorSpy).toHaveBeenCalledWith(
      'base_resume.proposal.rewrite_failed',
      expect.objectContaining({ experienceId: EXP_1, error: 'ai boom' }),
    );
    const experience = proposal.sections.find((section) => section.kind === 'experience');
    const firstEntry = experience!.entries.find((entry) => entry.experienceId === EXP_1);
    expect(firstEntry?.rewriteFailed).toBe(true);
    expect(firstEntry?.bullets[0]?.text).toBe('Led a team of five engineers');
    const loggedText = JSON.stringify(errorSpy.mock.calls);
    expect(loggedText).not.toContain('Led a team of five engineers');
  });

  it('should name the proposal with a neutral separator and no language word', async () => {
    const row = makeImportRow({ draft: { sectionOrder: ['experience'] } });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Rewritten ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(), aiClient);

    const proposal = await service.generateProposal(row as never);

    expect(proposal.language).toBe('en');
    expect(proposal.name).toContain(' · ');
    expect(proposal.name).not.toContain(' at ');
  });

  it('should name the Portuguese proposal with a neutral separator', async () => {
    const ptCareer = makeCareerRows();
    ptCareer.experiences = [
      {
        id: EXP_1,
        careerProfileId: PROFILE_ID,
        company: 'PetAgendas',
        role: 'Desenvolvedor Full Stack Independente',
        startedOn: '2026-03',
        endedOn: '2026-06',
        createdAt: new Date(),
      },
    ];
    ptCareer.evidences = [
      {
        id: EV_1,
        careerProfileId: PROFILE_ID,
        experienceId: EXP_1,
        statement: 'Liderei uma equipe com cinco pessoas e entreguei o projeto no prazo',
        createdAt: new Date(),
      },
    ];
    const row = makeImportRow({ draft: { sectionOrder: ['experience'] } });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Reescrito ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(ptCareer), aiClient);

    const proposal = await service.generateProposal(row as never);

    expect(proposal.language).toBe('pt');
    expect(proposal.name).toBe('Desenvolvedor Full Stack Independente · PetAgendas');
    expect(proposal.name).not.toContain(' at ');
  });

  it('should use the fixed fallback name by language when there is no experience', async () => {
    const emptyCareer = { ...makeCareerRows(), experiences: [], evidences: [] };
    const row = makeImportRow({ draft: { sectionOrder: ['experience'] } });
    const aiClient = makeAiClient(() => []);
    const servicePt = new BaseResumeProposalService(makeCareerDatabase(emptyCareer), aiClient);

    const proposalPt = await servicePt.generateProposal(row as never);

    expect(proposalPt.name).toBe('Currículo base');
  });

  it('should build the summary section at the sectionOrder position with a rewritten bullet', async () => {
    const summary =
      'Estudante de Engenharia de Software buscando estágio ou primeira oportunidade em desenvolvimento Fullstack.';
    const row = makeImportRow({
      draft: { sectionOrder: ['summary', 'experience'], summary },
      summary,
    });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Rewritten ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(), aiClient);

    const proposal = await service.generateProposal(row as never);

    expect(proposal.sections.map((section) => section.kind)[0]).toBe('summary');
    const summarySection = proposal.sections.find((section) => section.kind === 'summary');
    expect(summarySection).toBeDefined();
    expect(summarySection?.entries).toHaveLength(1);
    expect(summarySection?.entries[0]?.bullets).toHaveLength(1);
    expect(summarySection?.entries[0]?.bullets[0]?.original).toBe(summary);
    expect(summarySection?.entries[0]?.bullets[0]?.evidenceId).toBeNull();
  });

  it('should write the proposal summary from the career without a job', async () => {
    const summary = 'Desenvolvedor com experiencia em backend.';
    const row = makeImportRow({
      draft: { sectionOrder: ['summary', 'experience'], summary },
      summary,
    });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Rewritten ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(), aiClient);

    const proposal = await service.generateProposal(row as never);

    const summaryCalls = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => (call[0] as { promptName: string }).promptName === 'write-profile-summary',
    );
    expect(summaryCalls).toHaveLength(1);
    const payload = (summaryCalls[0]![0] as { payload: Record<string, unknown> }).payload as {
      originalSummary: string | null;
      positions: Array<{ role: string }>;
      skills: Array<{ name: string }>;
      jobTitle: string | null;
    };
    expect(payload.originalSummary).toBe(summary);
    expect(payload.positions.length).toBeGreaterThan(0);
    expect(payload.skills.map((skill) => skill.name)).toContain('Node.js');
    expect(payload.jobTitle).toBeNull();
    const summarySection = proposal.sections.find((section) => section.kind === 'summary');
    expect(summarySection?.entries[0]?.bullets[0]?.text).toContain('buscando estagio');
  });

  it('should put unlinked evidences in a custom projects section and never in an experience entry', async () => {
    const career = makeCareerRows();
    career.evidences = [
      ...career.evidences,
      {
        id: '99999999-9999-4999-8999-999999999999',
        careerProfileId: PROFILE_ID,
        experienceId: null,
        statement: 'Built a solo side project with React and Docker',
        createdAt: new Date(),
      },
    ];
    const row = makeImportRow({ draft: { sectionOrder: ['experience', 'custom'] } });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Rewritten ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(career), aiClient);

    const proposal = await service.generateProposal(row as never);

    const experience = proposal.sections.find((section) => section.kind === 'experience');
    expect(experience).toBeDefined();
    for (const entry of experience?.entries ?? []) {
      expect(entry.experienceId).not.toBeNull();
    }
    const custom = proposal.sections.find(
      (section) => section.kind === 'custom' && section.title === 'Projects and other activities',
    );
    expect(custom).toBeDefined();
    expect(
      custom?.entries.flatMap((entry) => entry.bullets).map((bullet) => bullet.original),
    ).toContain('Built a solo side project with React and Docker');
  });

  it('should title the unlinked custom section in Portuguese for a pt resume', async () => {
    const ptCareer = makeCareerRows();
    ptCareer.experiences = [
      {
        id: EXP_1,
        careerProfileId: PROFILE_ID,
        company: 'PetAgendas',
        role: 'Desenvolvedor Full Stack Independente',
        startedOn: '2026-03',
        endedOn: '2026-06',
        createdAt: new Date(),
      },
    ];
    ptCareer.evidences = [
      {
        id: EV_1,
        careerProfileId: PROFILE_ID,
        experienceId: EXP_1,
        statement: 'Liderei uma equipe com cinco pessoas e entreguei o projeto no prazo',
        createdAt: new Date(),
      },
      {
        id: EV_3,
        careerProfileId: PROFILE_ID,
        experienceId: null,
        statement: 'Desenvolvi um projeto solo com React e Docker',
        createdAt: new Date(),
      },
    ];
    const row = makeImportRow({ draft: { sectionOrder: ['experience', 'custom'] } });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Reescrito ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(ptCareer), aiClient);

    const proposal = await service.generateProposal(row as never);

    expect(proposal.language).toBe('pt');
    const custom = proposal.sections.find((section) => section.kind === 'custom');
    expect(custom?.title).toBe('Projetos e outras atividades');
  });

  it('should keep Idiomas as its own languages section in the original order', async () => {
    const career = makeCareerRows();
    career.languages = [
      { id: 'lang-1', careerProfileId: PROFILE_ID, name: 'Português', level: 'Nativo', createdAt: new Date() },
      { id: 'lang-2', careerProfileId: PROFILE_ID, name: 'Inglês', level: 'Avançado C1', createdAt: new Date() },
    ];
    const row = makeImportRow({
      draft: { sectionOrder: ['summary', 'skills', 'experience', 'custom', 'education', 'languages'] },
      summary: 'Resumo original.',
    });
    const aiClient = makeAiClient((evidences) =>
      evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Rewritten ${evidence.id}` })),
    );
    const service = new BaseResumeProposalService(makeCareerDatabase(career), aiClient);

    const proposal = await service.generateProposal(row as never);

    expect(proposal.sections.map((section) => section.kind)).toEqual([
      'summary',
      'skills',
      'experience',
      'education',
      'languages',
    ]);
    const languages = proposal.sections.find((section) => section.kind === 'languages');
    expect(languages).toBeDefined();
    expect(languages?.title).toBeNull();
  });

  it('should propose the skills in the original order whatever order the database returns them', async () => {
    const career = makeCareerRows();
    const importedAt = new Date('2026-09-25T18:34:16.000Z');
    const skill = (id: string, name: string, group: string, ordinal: number) => ({
      id,
      careerProfileId: PROFILE_ID,
      name,
      group,
      ordinal,
      createdAt: importedAt,
    });
    career.skills = [
      skill('a0000000-0000-4000-8000-000000000002', 'NestJS', 'Back-end', 2),
      skill('a0000000-0000-4000-8000-000000000001', 'Java', 'Linguagens', 1),
      skill('a0000000-0000-4000-8000-000000000000', 'JavaScript', 'Linguagens', 0),
      skill('a0000000-0000-4000-8000-000000000003', 'Fastify', 'Back-end', 3),
    ];
    career.languages = [
      { id: 'lang-1', careerProfileId: PROFILE_ID, name: 'Inglês', level: 'Avançado (C1)', createdAt: importedAt },
    ];
    const row = makeImportRow({ draft: { sectionOrder: ['skills', 'languages'] } });
    const service = new BaseResumeProposalService(makeCareerDatabase(career), makeAiClient(() => []));

    const proposal = await service.generateProposal(row as never);

    const skills = proposal.sections.find((section) => section.kind === 'skills');
    expect(skills?.skillIds).toEqual([
      'a0000000-0000-4000-8000-000000000000',
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002',
      'a0000000-0000-4000-8000-000000000003',
    ]);
    const languages = proposal.sections.find((section) => section.kind === 'languages');
    expect(languages?.entries[0]?.bullets.map((bullet) => bullet.text)).toEqual(['Inglês: Avançado (C1)']);
  });
});
