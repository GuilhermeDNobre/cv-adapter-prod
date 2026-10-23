import { describe, expect, it } from 'vitest';
import { normalizeExtractedText } from './text-normalization';

describe('normalizeExtractedText', () => {
  it('should collapse runs of repeated horizontal whitespace into a single space', () => {
    expect(normalizeExtractedText('led   a\t\tteam')).toBe('led a team');
  });

  it('should convert carriage return sequences to plain line feeds', () => {
    expect(normalizeExtractedText('one\r\n\r\ntwo\rthree')).toBe('one\n\ntwo\nthree');
  });

  it('should join a word hyphenated across a line break', () => {
    expect(normalizeExtractedText('develop-\nment teams')).toBe('development teams');
  });

  it('should keep the line break when the next line starts uppercase', () => {
    expect(normalizeExtractedText('acme-\nCorp held')).toBe('acme-\nCorp held');
  });

  it('should keep the line break when the dash is detached from the word', () => {
    expect(normalizeExtractedText('team -\nlead shared')).toBe('team -\nlead shared');
  });

  it('should strip control characters while keeping line breaks', () => {
    expect(normalizeExtractedText('a\u0000\u0001\n\u0007b')).toBe('a\nb');
  });

  it('should strip soft hyphens left over from justification', () => {
    expect(normalizeExtractedText('Nor\u00ADwegian')).toBe('Norwegian');
  });

  it('should trim whitespace around line breaks', () => {
    expect(normalizeExtractedText('x \t \ny')).toBe('x\ny');
  });

  it('should preserve the blank line that separates blocks', () => {
    expect(normalizeExtractedText('a\n\nb')).toBe('a\n\nb');
  });

  it('should collapse a run of blank lines down to one block separator', () => {
    expect(normalizeExtractedText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('should trim the document edges', () => {
    expect(normalizeExtractedText('\n\n  hello   \n')).toBe('hello');
  });
});
