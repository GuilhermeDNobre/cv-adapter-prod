import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './draft-suggestions';

describe('draft-suggestions prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('draft-suggestions').name).toBe('draft-suggestions');
  });

  it('should cite the suggestion format, the veracity rules and the document language', () => {
    const { systemMessage } = getPrompt('draft-suggestions');

    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('one direct question');
    expect(systemMessage).toContain('complete draft bullet');
    expect(systemMessage).toContain('number, tool, scale or role');
    expect(systemMessage).toContain('ClaimChecker');
    expect(systemMessage).toContain('Brazilian Portuguese');
    expect(systemMessage).toContain('experiences');
    expect(systemMessage).toContain('experienceId');
    expect(systemMessage).toContain('most plausible');
    expect(systemMessage).toContain('cite the technology');
  });

  it('should accept a well-formed suggestions output', () => {
    const { outputSchema } = getPrompt('draft-suggestions');

    const parsed = outputSchema.safeParse({
      suggestions: [
        {
          requirementId: '11111111-1111-4111-8111-111111111111',
          gapKind: 'existence',
          question: 'Have you ever worked with Kubernetes in production?',
          draftBullet: 'Assisted the migration of backend services to Kubernetes.',
          experienceId: '22222222-2222-4222-8222-222222222222',
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('should accept a suggestion without experienceId for the loose entry', () => {
    const { outputSchema } = getPrompt('draft-suggestions');

    const parsed = outputSchema.safeParse({
      suggestions: [
        {
          requirementId: '11111111-1111-4111-8111-111111111111',
          gapKind: 'existence',
          question: 'Have you ever worked with Kubernetes in production?',
          draftBullet: 'Assisted the migration of backend services to Kubernetes.',
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject a malformed suggestions output', () => {
    const { outputSchema } = getPrompt('draft-suggestions');

    const parsed = outputSchema.safeParse({
      suggestions: [
        {
          requirementId: 'not-a-uuid',
          gapKind: 'existence',
          question: '',
          draftBullet: '',
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
