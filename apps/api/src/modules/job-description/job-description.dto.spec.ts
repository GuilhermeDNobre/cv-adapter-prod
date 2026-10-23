import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MAX_JOB_DESCRIPTION_TEXT_LENGTH } from 'schema/contracts/job-description';
import { CreateJobDescriptionPipe } from './job-description.dto';

describe('CreateJobDescriptionPipe', () => {
  const pipe = new CreateJobDescriptionPipe();

  it('should accept text inside the limit and return it trimmed', () => {
    // Arrange
    const body = { text: `  ${'a'.repeat(MAX_JOB_DESCRIPTION_TEXT_LENGTH - 1)}  ` };

    // Act
    const result = pipe.transform(body);

    // Assert
    expect(result.text).toHaveLength(MAX_JOB_DESCRIPTION_TEXT_LENGTH - 1);
    expect(result.text).toBe('a'.repeat(MAX_JOB_DESCRIPTION_TEXT_LENGTH - 1));
  });

  it('should reject with 400 when text is missing', () => {
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it('should reject with 400 when text is only whitespace', () => {
    // Act & Assert
    try {
      pipe.transform({ text: '   ' });
      expect.unreachable('pipe accepted whitespace-only text');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('text must not be empty');
    }
  });

  it('should reject with 400 naming the limit when text is above it', () => {
    // Arrange
    const body = { text: 'a'.repeat(MAX_JOB_DESCRIPTION_TEXT_LENGTH + 1) };

    // Act & Assert
    try {
      pipe.transform(body);
      expect.unreachable('pipe accepted oversized text');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain(
        String(MAX_JOB_DESCRIPTION_TEXT_LENGTH),
      );
    }
  });
});
