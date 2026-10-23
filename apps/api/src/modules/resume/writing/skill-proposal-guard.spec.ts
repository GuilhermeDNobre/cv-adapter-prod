import { describe, expect, it } from 'vitest';
import { BEHAVIORAL_STOPWORDS, guardSkillProposals } from './skill-proposal-guard';

const SKILL_NEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SKILL_JEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQ_FASTIFY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REQ_VITEST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REQ_KAFKA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function profileSkills() {
  return [
    { id: SKILL_NEST, name: 'NestJS', group: 'Back-end' },
    { id: SKILL_JEST, name: 'Jest', group: 'Testes' },
  ];
}

function requirements() {
  return [
    { id: REQ_FASTIFY, literalTerm: 'Fastify', kind: 'mandatory' as const, ordinal: 0 },
    { id: REQ_VITEST, literalTerm: 'Vitest', kind: 'desirable' as const, ordinal: 1 },
  ];
}

describe('guardSkillProposals', () => {
  it('should accept an addition matching a requirement literal with its spelling, requirementId and profile group label', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: requirements(),
      output: {
        additions: [{ name: 'fastify', group: 'back-end ', requirementTerm: 'Fastify' }],
        swaps: [],
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: 'addition',
      name: 'Fastify',
      group: 'Back-end',
      replacesSkillId: null,
      requirementId: REQ_FASTIFY,
      ordinal: 0,
    });
    expect(result[1]).toMatchObject({
      kind: 'addition',
      name: 'Vitest',
      group: null,
      requirementId: REQ_VITEST,
      ordinal: 1,
    });
  });

  it('should accept a swap matching a requirement with replacesSkillId and the replaced group', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: requirements(),
      output: {
        additions: [],
        swaps: [{ from: 'nestjs', to: 'FASTIFY', requirementTerm: 'Fastify' }],
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: 'swap',
      name: 'Fastify',
      group: 'Back-end',
      replacesSkillId: SKILL_NEST,
      requirementId: REQ_FASTIFY,
      ordinal: 0,
    });
    expect(result[1]).toMatchObject({
      kind: 'addition',
      name: 'Vitest',
      group: null,
      requirementId: REQ_VITEST,
      ordinal: 1,
    });
  });

  it('should discard a name outside the job requirements but still add the missing technical ones', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: requirements(),
      output: {
        additions: [{ name: 'Elixir', group: null, requirementTerm: 'Elixir' }],
        swaps: [{ from: 'NestJS', to: 'Elixir', requirementTerm: 'Elixir' }],
      },
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name)).toEqual(['Fastify', 'Vitest']);
    expect(result.every((item) => item.kind === 'addition')).toBe(true);
    expect(result.every((item) => item.group === null)).toBe(true);
  });

  it('should discard a swap whose from is outside the profile but still add the missing technical ones', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: requirements(),
      output: {
        additions: [],
        swaps: [{ from: 'Django', to: 'Fastify', requirementTerm: 'Fastify' }],
      },
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name)).toEqual(['Fastify', 'Vitest']);
  });

  it('should discard a proposal that already matches a profile skill', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: [
        { id: REQ_FASTIFY, literalTerm: 'NestJS', kind: 'mandatory' as const, ordinal: 0 },
      ],
      output: {
        additions: [{ name: 'NestJS', group: null, requirementTerm: 'NestJS' }],
        swaps: [{ from: 'Jest', to: 'NestJS', requirementTerm: 'NestJS' }],
      },
    });

    expect(result).toHaveLength(0);
  });

  it('should discard duplicates keeping the first in requirement order and add the missing technical one', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: requirements(),
      output: {
        additions: [
          { name: 'Fastify', group: null, requirementTerm: 'Fastify' },
          { name: 'FASTIFY', group: null, requirementTerm: 'Fastify' },
        ],
        swaps: [{ from: 'NestJS', to: 'fastify', requirementTerm: 'Fastify' }],
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.kind).toBe('addition');
    expect(result[0]?.name).toBe('Fastify');
    expect(result[1]).toMatchObject({ kind: 'addition', name: 'Vitest', group: null });
  });

  it('should discard a repeated from in swaps and add the missing technical ones', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: [
        { id: REQ_FASTIFY, literalTerm: 'Fastify', kind: 'mandatory' as const, ordinal: 0 },
        { id: REQ_VITEST, literalTerm: 'Vitest', kind: 'mandatory' as const, ordinal: 1 },
        { id: REQ_KAFKA, literalTerm: 'Kafka', kind: 'mandatory' as const, ordinal: 2 },
      ],
      output: {
        additions: [],
        swaps: [
          { from: 'NestJS', to: 'Fastify', requirementTerm: 'Fastify' },
          { from: 'nestjs', to: 'Vitest', requirementTerm: 'Vitest' },
        ],
      },
    });

    expect(result).toHaveLength(3);
    expect(result[0]?.name).toBe('Fastify');
    expect(result.map((item) => item.name)).toEqual(['Fastify', 'Vitest', 'Kafka']);
  });

  it('should turn an unknown addition group into null and add the missing technical one', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: requirements(),
      output: {
        additions: [{ name: 'Fastify', group: 'Unknown group', requirementTerm: 'Fastify' }],
        swaps: [],
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.group).toBeNull();
    expect(result[1]).toMatchObject({ name: 'Vitest', group: null });
  });

  it('should order mandatory requirements before desirable ones', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: [
        { id: REQ_VITEST, literalTerm: 'Vitest', kind: 'desirable' as const, ordinal: 0 },
        { id: REQ_FASTIFY, literalTerm: 'Fastify', kind: 'mandatory' as const, ordinal: 1 },
      ],
      output: {
        additions: [
          { name: 'Vitest', group: null, requirementTerm: 'Vitest' },
          { name: 'Fastify', group: null, requirementTerm: 'Fastify' },
        ],
        swaps: [],
      },
    });

    expect(result.map((item) => item.name)).toEqual(['Fastify', 'Vitest']);
    expect(result.map((item) => item.ordinal)).toEqual([0, 1]);
  });

  it('should add a technical requirement missed by the model with null group', () => {
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: requirements(),
      output: { additions: [], swaps: [] },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: 'addition', name: 'Fastify', group: null, requirementId: REQ_FASTIFY });
    expect(result[1]).toMatchObject({ kind: 'addition', name: 'Vitest', group: null, requirementId: REQ_VITEST });
  });

  it('should not add a behavioral requirement missed by the model', () => {
    expect(BEHAVIORAL_STOPWORDS).toContain('comunicacao');
    expect(BEHAVIORAL_STOPWORDS).toContain('lideranca');
    expect(BEHAVIORAL_STOPWORDS).toContain('proatividade');
    expect(BEHAVIORAL_STOPWORDS).toContain('equipe');
    expect(BEHAVIORAL_STOPWORDS).toContain('trabalho');
    expect(BEHAVIORAL_STOPWORDS).toContain('ingles');
    const behavioralId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: [
        { id: REQ_FASTIFY, literalTerm: 'Fastify', kind: 'mandatory' as const, ordinal: 0 },
        { id: behavioralId, literalTerm: 'boa comunicação', kind: 'mandatory' as const, ordinal: 1 },
        { id: REQ_VITEST, literalTerm: 'Vitest', kind: 'desirable' as const, ordinal: 2 },
      ],
      output: { additions: [], swaps: [] },
    });

    expect(result.map((item) => item.requirementId)).not.toContain(behavioralId);
    expect(result.map((item) => item.name)).toEqual(['Fastify', 'Vitest']);
  });

  it('should add a long technical term when the model proposed it as an addition', () => {
    const longId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const longTerm = 'Continuous Integration and Deployment Pipelines';
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: [
        { id: REQ_FASTIFY, literalTerm: 'Fastify', kind: 'mandatory' as const, ordinal: 0 },
        { id: longId, literalTerm: longTerm, kind: 'mandatory' as const, ordinal: 1 },
      ],
      output: {
        additions: [{ name: 'CI', group: null, requirementTerm: longTerm }],
        swaps: [],
      },
    });

    expect(result.map((item) => item.requirementId)).toContain(longId);
    expect(result.find((item) => item.requirementId === longId)).toMatchObject({ name: longTerm, group: null });
  });

  it('should not add a long technical term the model missed', () => {
    const longId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const result = guardSkillProposals({
      profileSkills: profileSkills(),
      requirements: [
        { id: REQ_FASTIFY, literalTerm: 'Fastify', kind: 'mandatory' as const, ordinal: 0 },
        { id: longId, literalTerm: 'Continuous Integration and Deployment Pipelines', kind: 'mandatory' as const, ordinal: 1 },
      ],
      output: { additions: [], swaps: [] },
    });

    expect(result.map((item) => item.requirementId)).not.toContain(longId);
    expect(result).toHaveLength(1);
  });

  it('should cap proposals at eight keeping requirement order with sequential ordinals', () => {
    const reqs = Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      literalTerm: `Tool${index}`,
      kind: 'mandatory' as const,
      ordinal: index,
    }));
    const result = guardSkillProposals({
      profileSkills: [],
      requirements: reqs,
      output: {
        additions: reqs.map((req) => ({ name: req.literalTerm, group: null, requirementTerm: req.literalTerm })),
        swaps: [],
      },
    });

    expect(result).toHaveLength(8);
    expect(result.map((item) => item.name)).toEqual(reqs.slice(0, 8).map((req) => req.literalTerm));
    expect(result.map((item) => item.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
