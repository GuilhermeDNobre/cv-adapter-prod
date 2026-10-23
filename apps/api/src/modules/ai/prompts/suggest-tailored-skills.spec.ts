import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './suggest-tailored-skills';

describe('suggest-tailored-skills prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('suggest-tailored-skills').name).toBe('suggest-tailored-skills');
  });

  it('should contain the addition, swap and group rules from the brief', () => {
    const { systemMessage } = getPrompt('suggest-tailored-skills');

    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('Only propose tools and technologies the job names');
    expect(systemMessage).toContain('real equivalents in the same category');
    expect(systemMessage).toContain('NestJS to Fastify');
    expect(systemMessage).toContain('Jest to Vitest');
    expect(systemMessage).toContain('Never rename, normalize or split existing skills');
    expect(systemMessage).toContain('existingGroups');
    expect(systemMessage).toContain('most adequate group');
    expect(systemMessage).toContain('Go');
    expect(systemMessage).toContain('Linguagens');
    expect(systemMessage).toContain('Docker');
    expect(systemMessage).toContain('DevOps/Ferramentas');
    expect(systemMessage).toContain('Kubernetes');
  });

  it('should accept a valid additions and swaps output', () => {
    const { outputSchema } = getPrompt('suggest-tailored-skills');

    const parsed = outputSchema.safeParse({
      additions: [{ name: 'Fastify', group: 'Back-end', requirementTerm: 'Fastify' }],
      swaps: [{ from: 'NestJS', to: 'Fastify', requirementTerm: 'Fastify' }],
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject an output with missing fields', () => {
    const { outputSchema } = getPrompt('suggest-tailored-skills');

    const parsed = outputSchema.safeParse({
      additions: [{ name: 'Fastify' }],
      swaps: [{ from: 'NestJS' }],
    });

    expect(parsed.success).toBe(false);
  });
});
