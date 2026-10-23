import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './refine-item';

describe('refine-item prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('refine-item').name).toBe('refine-item');
  });

  it('should cite the no-invention rule, the writing methods and the document language', () => {
    const { systemMessage } = getPrompt('refine-item');

    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('Never invent facts');
    expect(systemMessage).toContain('STAR');
    expect(systemMessage).toContain('XYZ');
    expect(systemMessage).toContain('Brazilian Portuguese');
  });

  it('should accept a well-formed refine output', () => {
    const { outputSchema } = getPrompt('refine-item');

    const parsed = outputSchema.safeParse({
      refined: 'Reduced latency by 30% by tuning PostgreSQL queries.',
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject an empty refined text', () => {
    const { outputSchema } = getPrompt('refine-item');

    const parsed = outputSchema.safeParse({ refined: '' });

    expect(parsed.success).toBe(false);
  });
});
