import { describe, expect, it } from 'vitest';
import { formatLanguage } from './language-format';

describe('formatLanguage', () => {
  it('should put the level after a colon keeping its parentheses', () => {
    expect(formatLanguage('Português', 'Nativo')).toBe('Português: Nativo');
    expect(formatLanguage('Inglês', 'Avançado (C1)')).toBe('Inglês: Avançado (C1)');
  });

  it('should collapse whitespace in the level', () => {
    expect(formatLanguage('Inglês', '  Avançado   (C1)  ')).toBe('Inglês: Avançado (C1)');
  });

  it('should return only the name when the level is missing', () => {
    expect(formatLanguage('Português', null)).toBe('Português');
    expect(formatLanguage('Português', '')).toBe('Português');
    expect(formatLanguage('Português', '   ')).toBe('Português');
  });
});
