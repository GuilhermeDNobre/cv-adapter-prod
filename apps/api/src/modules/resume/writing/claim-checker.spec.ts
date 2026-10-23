import { describe, expect, it } from 'vitest';
import { findUnsupportedClaims } from './claim-checker';

describe('findUnsupportedClaims', () => {
  it('should accept a number present with a different spelling', () => {
    const text = 'processed 1,5 million records';
    const sources = ['processed 1.5 million records'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should flag a number absent from every source', () => {
    const text = 'Reduced latency by 30%';
    const sources = ['improved system performance'];

    const unsupported = findUnsupportedClaims(text, sources);

    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]).toMatchObject({ kind: 'number' });
    expect(unsupported[0]?.value).toContain('30%');
  });

  it('should match 30% across an English bullet and a Portuguese evidence', () => {
    const text = 'reduced latency by 30% tuning queries';
    const sources = ['reduziu a latencia em 30% otimizando consultas'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should flag an absent tool', () => {
    const text = 'Deployed services to Kubernetes';
    const sources = ['Deployed services to Docker'];

    const unsupported = findUnsupportedClaims(text, sources);

    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]).toMatchObject({ kind: 'term', value: 'Kubernetes' });
  });

  it('should accept a present acronym regardless of casing', () => {
    const text = 'Used AWS for hosting';
    const sources = ['migrated workloads to aws'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should not flag a capitalized word at the start of a sentence', () => {
    const text = 'Kubernetes is complex';
    const sources = ['something else entirely'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should match accents without case sensitivity', () => {
    const text = 'improved Latência of queries';
    const sources = ['improved latencia of queries'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should return an empty list when the text carries no claim', () => {
    const text = 'led the team and improved the process';
    const sources = ['led the team', 'improved the process'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should support claims from a source composed of evidence plus company and role', () => {
    const text = 'Led backend team at Acme as Senior Engineer';
    const sources = ['Led the backend team', 'Acme', 'Senior Engineer'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should approve 60% from sixty percent written out in english', () => {
    const text = 'cut query cost by 60%';
    const sources = ['cut query cost by sixty percent'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should approve 60% from sessenta por cento written out in portuguese', () => {
    const text = 'reduzi o custo de consulta em 60%';
    const sources = ['reduzi o custo de consulta em sessenta por cento'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should approve 25 from twenty-five engineers written with a hyphen', () => {
    const text = 'led a team of 25 engineers';
    const sources = ['led a team of twenty-five engineers'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should not approve 70% from sixty percent written out', () => {
    const text = 'cut query cost by 70%';
    const sources = ['cut query cost by sixty percent'];

    const unsupported = findUnsupportedClaims(text, sources);

    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]).toMatchObject({ kind: 'number' });
  });

  it('should accept APIs when the source says API', () => {
    const text = 'Built APIs with caching';
    const sources = ['Built API REST with caching'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should accept API when the source says APIs', () => {
    const text = 'Built API with caching';
    const sources = ['Built APIs with caching'];

    expect(findUnsupportedClaims(text, sources)).toEqual([]);
  });

  it('should still reject a term truly absent from the sources', () => {
    const text = 'Built APIs with Kafka';
    const sources = ['Built API REST with caching'];

    const unsupported = findUnsupportedClaims(text, sources);

    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]).toMatchObject({ kind: 'term', value: 'Kafka' });
  });
});
