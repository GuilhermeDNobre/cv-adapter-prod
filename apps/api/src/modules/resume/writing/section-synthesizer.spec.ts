import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSummaryClaimSources,
  orderProfileSkills,
  orderTailoredSkills,
  splitTechnicalAndSoftRequirements,
  synthesizeSections,
} from './section-synthesizer';
import { findUnsupportedClaims } from './claim-checker';
import type { AiClient } from '../../ai/ai-client';

afterEach(() => {
  vi.restoreAllMocks();
});

const EXAMPLE_SUMMARY =
  'Estudante de Engenharia de Software buscando estagio ou primeira oportunidade em desenvolvimento Fullstack, com foco em tecnologias web modernas (React, Node.js, NestJS, Spring Boot) e entrega de solucoes escalaveis de ponta a ponta.';

function skill(id: string, name: string, group: string | null, createdAt: string, ordinal = 0) {
  return { id, name, group, ordinal, createdAt: new Date(createdAt) };
}

describe('orderProfileSkills', () => {
  it('should order groups by first occurrence with ungrouped last', () => {
    const ordered = orderProfileSkills([
      skill('c', 'Docker', null, '2026-03-01T00:00:00.000Z', 3),
      skill('a', 'React', 'Frontend', '2026-02-01T00:00:00.000Z', 1),
      skill('b', 'TypeScript', 'Frontend', '2026-01-01T00:00:00.000Z', 0),
      skill('d', 'PostgreSQL', 'Back-end', '2026-01-15T00:00:00.000Z', 2),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('should keep Linguagens before Back-end following the extraction order', () => {
    const ordered = orderProfileSkills([
      skill('c', 'C', 'Back-end', '2026-01-03T00:00:00.000Z', 2),
      skill('a', 'A', 'Linguagens', '2026-01-01T00:00:00.000Z', 0),
      skill('b', 'B', 'Linguagens', '2026-01-02T00:00:00.000Z', 1),
    ]);

    expect(ordered.map((item) => item.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('orderTailoredSkills', () => {
  it('should put skills matching the job requirements first', () => {
    const ordered = orderTailoredSkills(
      [
        skill('docker', 'Docker', null, '2026-01-01T00:00:00.000Z'),
        skill('nestjs', 'NestJS', 'Back-end', '2026-02-01T00:00:00.000Z'),
        skill('react', 'React', 'Frontend', '2026-03-01T00:00:00.000Z'),
      ],
      [
        { literalTerm: 'NestJS', concept: 'NestJS framework' },
        { literalTerm: 'PostgreSQL', concept: 'PostgreSQL database' },
      ],
    );

    expect(ordered[0]?.name).toBe('NestJS');
    expect(ordered.map((item) => item.name)).toContain('Docker');
  });

  it('should match without case and without accent', () => {
    const ordered = orderTailoredSkills(
      [skill('pg', 'PostgreSQL', 'Back-end', '2026-01-01T00:00:00.000Z')],
      [{ literalTerm: 'postgresql', concept: 'banco de dados' }],
    );

    expect(ordered).toHaveLength(1);
    expect(ordered[0]?.name).toBe('PostgreSQL');
  });
});

describe('synthesizeSections profile summary', () => {
  it('should write the summary from positions, education and skills without repeating an evidence', async () => {
    const aiClient = {
      complete: vi.fn(async () => ({ bullets: [{ text: EXAMPLE_SUMMARY }] })),
    } as unknown as AiClient;

    const result = await synthesizeSections(
      { aiClient },
      {
        sections: [{ sectionId: 'summary-1', kind: 'summary' }],
        originalSummary: null,
        positions: [
          { role: 'Desenvolvedor Fullstack', company: 'Acme', startedOn: '2024-01', endedOn: null },
        ],
        education: [
          {
            institution: 'UFC',
            degree: 'Engenharia de Software',
            startedOn: '2022',
            endedOn: null,
          },
        ],
        skills: [
          { name: 'React', group: 'Frontend' },
          { name: 'Node.js', group: 'Frontend' },
          { name: 'NestJS', group: 'Back-end' },
          { name: 'Spring Boot', group: 'Back-end' },
        ],
        tone: 'direct',
        language: 'pt',
      },
    );

    expect(result).toHaveLength(1);
    const [first] = result[0]?.texts ?? [];
    expect(first).toBe(EXAMPLE_SUMMARY);
    expect(first).not.toBe('Built checkout flow with React');
  });

  it('should let the claim checker accept the identity and the years computed from the periods', () => {
    const sources = buildSummaryClaimSources({
      originalSummary: null,
      positions: [{ role: 'Engineer', company: 'Acme', startedOn: '2018-01', endedOn: '2024-01' }],
      education: [],
      skills: [{ name: 'React', group: null }],
    });
    const text = 'Engenheiro de Software com 6 anos de experiencia em React.';

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should accept a Requirement term matching a person skill and reject a job term the person does not have', () => {
    const sources = buildSummaryClaimSources({
      originalSummary: null,
      positions: [{ role: 'Desenvolvedor Fullstack', company: 'Acme', startedOn: '2024-01', endedOn: null }],
      education: [{ institution: 'UFC', degree: 'Engenharia de Software', startedOn: '2022', endedOn: null }],
      skills: [
        { name: 'React', group: null },
        { name: 'NestJS', group: 'Back-end' },
      ],
      jobTitle: 'Desenvolvedor Back-end',
      requirements: [
        { literalTerm: 'NestJS', concept: 'NestJS framework' },
        { literalTerm: 'Kafka', concept: 'Kafka messaging' },
      ],
    });

    expect(findUnsupportedClaims('Trabalho com NestJS em backend.', sources)).toEqual([]);
    expect(findUnsupportedClaims('Desenvolvedor Back-end com experiencia em React.', sources)).toEqual([]);
    const rejected = findUnsupportedClaims('Trabalho com Kafka em projetos de backend.', sources);
    expect(rejected.map((claim) => claim.value)).toContain('Kafka');
  });

  it('should accept a term present only in an evidence statement', () => {
    const withEvidence = buildSummaryClaimSources({
      originalSummary: null,
      positions: [{ role: 'Desenvolvedor Fullstack', company: 'Acme', startedOn: '2024-01', endedOn: null }],
      education: [],
      skills: [{ name: 'Fastify', group: 'Back-end' }],
      evidenceStatements: ['API REST em Fastify com testes automatizados'],
    });
    const withoutEvidence = buildSummaryClaimSources({
      originalSummary: null,
      positions: [{ role: 'Desenvolvedor Fullstack', company: 'Acme', startedOn: '2024-01', endedOn: null }],
      education: [],
      skills: [{ name: 'Fastify', group: 'Back-end' }],
    });

    expect(findUnsupportedClaims('Trabalho com API REST em backend.', withEvidence)).toEqual([]);
    const rejected = findUnsupportedClaims('Trabalho com API REST em backend.', withoutEvidence);
    expect(rejected.map((claim) => claim.value)).toContain('REST');
  });

  it('should discard a sentence with a job term the person lacks, log it, retry with rejectedTerms and keep identity', async () => {    const identity = 'Estudante de Engenharia de Software buscando estagio com React e NestJS.';
    const generic = 'Valorizo codigo limpo, testes automatizados e entregas organizadas.';
    const kafkaSentence = 'Trabalho com Kafka em projetos de backend.';
    const flinkSentence = 'Tenho experiencia com Flink em dados.';
    const aiClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          bullets: [{ text: identity }, { text: kafkaSentence }, { text: flinkSentence }],
        })
        .mockResolvedValueOnce({ bullets: [{ text: identity }, { text: generic }] }),
    } as unknown as AiClient;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await synthesizeSections(
      { aiClient },
      {
        sections: [{ sectionId: 'summary-1', kind: 'summary' }],
        originalSummary: null,
        positions: [{ role: 'Desenvolvedor Fullstack', company: 'Acme', startedOn: '2024-01', endedOn: null }],
        education: [{ institution: 'UFC', degree: 'Engenharia de Software', startedOn: '2022', endedOn: null }],
        skills: [
          { name: 'React', group: null },
          { name: 'NestJS', group: 'Back-end' },
        ],
        tone: 'direct',
        language: 'pt',
        jobTitle: 'Desenvolvedor Back-end',
        requirements: [
          { literalTerm: 'NestJS', concept: 'NestJS framework' },
          { literalTerm: 'Kafka', concept: 'Kafka messaging' },
        ],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.texts).toHaveLength(2);
    expect(result[0]?.texts[0]).toBe(identity);
    expect(result[0]?.texts).toContain(generic);
    expect(aiClient.complete).toHaveBeenCalledTimes(2);
    const secondPayload = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as {
      payload: { rejectedTerms?: readonly string[] };
    };
    expect(secondPayload.payload.rejectedTerms).toContain('Kafka');
    const rejectedLogs = logSpy.mock.calls.filter(
      ([message]) => message === 'resume.summary.claim_rejected',
    );
    expect(rejectedLogs.length).toBeGreaterThan(0);
    const loggedTerms = rejectedLogs.flatMap(([ , details ]) => {
      const payload = details as { unsupported?: readonly string[] };
      return [...(payload.unsupported ?? [])];
    });
    expect(loggedTerms).toContain('Kafka');
  });
});

describe('splitTechnicalAndSoftRequirements', () => {
  it('should keep matching skills as technical and the rest as soft', () => {
    const { technical, soft } = splitTechnicalAndSoftRequirements(
      [{ name: 'NestJS', group: 'Back-end' }],
      [
        { literalTerm: 'NestJS', concept: 'NestJS framework' },
        { literalTerm: 'boa comunicação', concept: 'comunicacao em time' },
      ],
    );

    expect(technical.map((item) => item.literalTerm)).toEqual(['NestJS']);
    expect(soft.map((item) => item.literalTerm)).toEqual(['boa comunicação']);
  });

  it('should carry softRequirements separated into the tailored prompt payload', async () => {
    const aiClient = {
      complete: vi.fn(async () => ({ bullets: [{ text: EXAMPLE_SUMMARY }, { text: EXAMPLE_SUMMARY }] })),
    } as unknown as AiClient;

    await synthesizeSections(
      { aiClient },
      {
        sections: [{ sectionId: 'summary-1', kind: 'summary' }],
        originalSummary: null,
        positions: [{ role: 'Desenvolvedor Fullstack', company: 'Acme', startedOn: '2024-01', endedOn: null }],
        education: [],
        skills: [{ name: 'NestJS', group: 'Back-end' }],
        tone: 'direct',
        language: 'pt',
        jobTitle: 'Desenvolvedor Back-end',
        requirements: [{ literalTerm: 'NestJS', concept: 'NestJS framework' }],
        softRequirements: [{ literalTerm: 'boa comunicação', concept: 'comunicacao em time' }],
      },
    );

    const payload = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      payload: { requirements: unknown[]; softRequirements: unknown[] };
    };
    expect(payload.payload.requirements).toHaveLength(1);
    expect(payload.payload.softRequirements).toHaveLength(1);
  });
});
