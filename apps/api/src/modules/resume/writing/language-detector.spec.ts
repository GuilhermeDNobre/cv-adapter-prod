import { describe, expect, it } from 'vitest';
import { detectTextLanguage, needsTranslation } from './language-detector';

describe('detectTextLanguage', () => {
  it('should detect Portuguese from frequent words', () => {
    expect(detectTextLanguage('Liderei uma equipe de cinco pessoas na empresa')).toBe('pt');
  });

  it('should detect English from frequent words', () => {
    expect(detectTextLanguage('Led a team of five engineers at the company')).toBe('en');
  });

  it('should return unknown for an empty text', () => {
    expect(detectTextLanguage('')).toBe('unknown');
    expect(detectTextLanguage('   ')).toBe('unknown');
  });

  it('should return unknown when no marker word is present', () => {
    expect(detectTextLanguage('Kubernetes Docker Terraform')).toBe('unknown');
  });

  it('should return unknown on a tie between the two languages', () => {
    expect(detectTextLanguage('the não')).toBe('unknown');
  });
});

describe('needsTranslation', () => {
  it('should flag a Portuguese bullet for an English document', () => {
    expect(needsTranslation('Liderei uma equipe de cinco pessoas na empresa', 'en')).toBe(true);
  });

  it('should keep an English bullet for an English document', () => {
    expect(needsTranslation('Led a team of five engineers at the company', 'en')).toBe(false);
  });

  it('should keep a bullet with no detectable language', () => {
    expect(needsTranslation('Kubernetes Docker Terraform', 'en')).toBe(false);
  });
});
