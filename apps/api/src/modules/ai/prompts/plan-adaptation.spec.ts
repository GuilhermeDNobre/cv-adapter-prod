import { describe, expect, it } from 'vitest';
import { getPrompt } from './prompt';
import './plan-adaptation';

describe('plan-adaptation prompt', () => {
  it('should be registered under its own name', () => {
    expect(getPrompt('plan-adaptation').name).toBe('plan-adaptation');
  });

  it('should cite the veracity rules and the document language in the system message', () => {
    const { systemMessage } = getPrompt('plan-adaptation');
    expect(systemMessage.toLowerCase()).toContain('json');
    expect(systemMessage).toContain('same evidence in two sections');
    expect(systemMessage).toContain('never invent');
    expect(systemMessage).toContain('exactly one coverage entry');
    expect(systemMessage).toContain('number, tool, scale or role');
    expect(systemMessage).toContain('ClaimChecker');
    expect(systemMessage).toContain('Brazilian Portuguese');
    expect(systemMessage).toContain('every experience at least one evidence');
    expect(systemMessage).toContain('never removes an experience');
  });

  it('should accept a well-formed plan output', () => {
    const { outputSchema } = getPrompt('plan-adaptation');
    const requirementId = '11111111-1111-4111-8111-111111111111';
    const evidenceId = '22222222-2222-4222-8222-222222222222';

    const parsed = outputSchema.safeParse({
      allocations: [{ sectionKind: 'experience', evidenceIds: [evidenceId] }],
      coverages: [
        {
          requirementId,
          coverage: 'covered',
          evidenceId,
          gapKind: null,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('should reject a malformed plan output', () => {
    const { outputSchema } = getPrompt('plan-adaptation');

    const parsed = outputSchema.safeParse({
      allocations: [{ sectionKind: 'experience', evidenceIds: ['not-a-uuid'] }],
      coverages: [{ requirementId: 'also-not-a-uuid', coverage: 'maybe' }],
    });

    expect(parsed.success).toBe(false);
  });
});
