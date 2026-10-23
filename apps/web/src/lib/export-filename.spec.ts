import { describe, expect, it } from 'vitest';
import { buildExportFilename } from './export-filename';

describe('buildExportFilename', () => {
  it('should slug the readable resume name in lowercase without accents', () => {
    expect(buildExportFilename('Backend focus')).toBe('curriculo-backend-focus.pdf');
  });

  it('should remove accents before slugging', () => {
    expect(buildExportFilename('Currículo São Paulo')).toBe('curriculo-curriculo-sao-paulo.pdf');
  });

  it('should cut the slug at 60 characters', () => {
    const longName = 'a'.repeat(80);
    expect(buildExportFilename(longName)).toBe(`curriculo-${'a'.repeat(60)}.pdf`);
  });

  it('should fall back to a generic name when nothing sluggable remains', () => {
    expect(buildExportFilename('---')).toBe('curriculo.pdf');
  });
});
