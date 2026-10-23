import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './detect-writing-style';

describe('detect-writing-style prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('detect-writing-style').name).toBe('detect-writing-style');
  });

  it('should describe the writing methods, tones and average words in the system message', () => {
    const { systemMessage } = getPrompt('detect-writing-style');

    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('writingMethod');
    expect(systemMessage).toContain('star');
    expect(systemMessage).toContain('averageBulletWords');
  });

  it('should accept a well-formed writing style output', () => {
    const { outputSchema } = getPrompt('detect-writing-style');

    const parsed = outputSchema.safeParse({
      writingMethod: 'xyz',
      tone: 'direct',
      averageBulletWords: 14,
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject an unknown writing method', () => {
    const { outputSchema } = getPrompt('detect-writing-style');

    const parsed = outputSchema.safeParse({
      writingMethod: 'narrative',
      tone: 'direct',
      averageBulletWords: 12,
    });

    expect(parsed.success).toBe(false);
  });
});
