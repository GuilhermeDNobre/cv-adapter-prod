import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './write-section';

describe('write-section prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('write-section').name).toBe('write-section');
  });

  it('should cite the veracity rules, title case avoidance and the document language', () => {
    const { systemMessage } = getPrompt('write-section');
    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('only state a number, tool, scale or role');
    expect(systemMessage).toContain('never introduce a number, tool, scale');
    expect(systemMessage).toContain('ClaimChecker');
    expect(systemMessage).toContain('Avoid title case');
    expect(systemMessage).toContain('Brazilian Portuguese');
  });

  it('should prioritize the person instruction without dropping the veracity rules', () => {
    const { systemMessage } = getPrompt('write-section');
    expect(systemMessage).toContain('person');
    expect(systemMessage).toContain('instruction');
    expect(systemMessage).toContain('priority');
    expect(systemMessage).toContain('ClaimChecker');
  });

  it('should accept a well-formed section output', () => {
    const { outputSchema } = getPrompt('write-section');

    const parsed = outputSchema.safeParse({
      bullets: [
        {
          evidenceId: '22222222-2222-4222-8222-222222222222',
          text: 'Reduced latency by 30% by tuning PostgreSQL queries.',
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject a malformed section output', () => {
    const { outputSchema } = getPrompt('write-section');

    const parsed = outputSchema.safeParse({
      bullets: [{ evidenceId: 'not-a-uuid', text: '' }],
    });

    expect(parsed.success).toBe(false);
  });
});
