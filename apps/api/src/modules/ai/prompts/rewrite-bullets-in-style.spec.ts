import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './rewrite-bullets-in-style';

describe('rewrite-bullets-in-style prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('rewrite-bullets-in-style').name).toBe('rewrite-bullets-in-style');
  });

  it('should cite json, the writing methods, the same-language rule and the no-invention rule', () => {
    const { systemMessage } = getPrompt('rewrite-bullets-in-style');

    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('STAR');
    expect(systemMessage).toContain('XYZ');
    expect(systemMessage).toContain('same language');
    expect(systemMessage).toContain('never introduce a number');
  });

  it('should accept a well-formed rewrite output', () => {
    const { outputSchema } = getPrompt('rewrite-bullets-in-style');

    const parsed = outputSchema.safeParse({
      bullets: [
        {
          evidenceId: '00000000-0000-0000-0000-000000000001',
          text: 'Shipped checkout flow handling 10k orders per day.',
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject a bullet without evidence id', () => {
    const { outputSchema } = getPrompt('rewrite-bullets-in-style');

    const parsed = outputSchema.safeParse({
      bullets: [{ text: 'Shipped checkout flow.' }],
    });

    expect(parsed.success).toBe(false);
  });
});
