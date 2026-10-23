import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './synthesize-section';

describe('synthesize-section prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('synthesize-section').name).toBe('synthesize-section');
  });

  it('should cite the veracity rules and the document language', () => {
    const { systemMessage } = getPrompt('synthesize-section');

    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('only state a number, tool, scale or role');
    expect(systemMessage).toContain('ClaimChecker');
    expect(systemMessage).toContain('Brazilian Portuguese');
  });

  it('should accept a well-formed synthesis output', () => {
    const { outputSchema } = getPrompt('synthesize-section');

    const parsed = outputSchema.safeParse({
      bullets: [{ text: 'Engineer with experience in backend systems.' }],
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject a malformed synthesis output', () => {
    const { outputSchema } = getPrompt('synthesize-section');

    const parsed = outputSchema.safeParse({ bullets: [{ text: '' }] });

    expect(parsed.success).toBe(false);
  });

  it('should carry instruction and currentText as rewrite inputs', () => {
    const { systemMessage } = getPrompt('synthesize-section');
    expect(systemMessage).toContain('instruction');
    expect(systemMessage).toContain('currentText');
    expect(systemMessage).toContain('main instruction');
  });

  it('should default summary to a single paragraph unless instructed otherwise', () => {
    const { systemMessage } = getPrompt('synthesize-section');
    expect(systemMessage).toContain('single paragraph');
    expect(systemMessage.toLowerCase()).toContain('summary');
  });
});
