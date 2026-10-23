import { describe, expect, it } from 'vitest';
import { normalizeConcept, toRequirementRows } from './requirement-mapping';

describe('normalizeConcept', () => {
  it('should collide across letter casing of the same term', () => {
    expect(normalizeConcept('Kubernetes')).toBe(normalizeConcept('kubernetes'));
    expect(normalizeConcept('KUBERNETES')).toBe(normalizeConcept('kubernetes'));
  });

  it('should collide across surrounding and repeated whitespace', () => {
    expect(normalizeConcept('  machine   learning ')).toBe(normalizeConcept('machine learning'));
  });

  it('should collide across diacritics of the same term', () => {
    expect(normalizeConcept('Análise de Dados')).toBe(normalizeConcept('analise de dados'));
  });

  it('should keep distinct terms distinct', () => {
    expect(normalizeConcept('react')).not.toBe(normalizeConcept('angular'));
    expect(normalizeConcept('c++')).not.toBe(normalizeConcept('c#'));
  });

  it('should produce a lowercase, single-spaced, diacritic-free form', () => {
    expect(normalizeConcept('  Excel  Avançado  ')).toBe('excel avancado');
  });
});

describe('toRequirementRows', () => {
  const parsed = [
    {
      literalTerm: 'Sólida experiência com PostgreSQL',
      concept: 'Strong PostgreSQL experience',
      kind: 'mandatory' as const,
    },
    {
      literalTerm: 'inglês fluente',
      concept: 'Fluent English',
      kind: 'desirable' as const,
    },
  ];

  it('should preserve the literal term used by the job description verbatim', () => {
    const [first] = toRequirementRows(parsed);
    expect(first?.literalTerm).toBe('Sólida experiência com PostgreSQL');
  });

  it('should keep the concept and the kind as the model presented them', () => {
    const rows = toRequirementRows(parsed);
    expect(rows.map((row) => row.concept)).toEqual([
      'Strong PostgreSQL experience',
      'Fluent English',
    ]);
    expect(rows.map((row) => row.kind)).toEqual(['mandatory', 'desirable']);
  });

  it('should derive normalized_concept from the literal term, not the concept', () => {
    const [first] = toRequirementRows(parsed);
    expect(first?.normalizedConcept).toBe('solida experiencia com postgresql');
  });

  it('should assign ordinals in the order the requirements were returned', () => {
    const rows = toRequirementRows(parsed);
    expect(rows.map((row) => row.ordinal)).toEqual([0, 1]);
  });

  it('should return an empty array for an empty extraction', () => {
    expect(toRequirementRows([])).toEqual([]);
  });
});
