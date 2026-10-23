import { describe, expect, it } from 'vitest';
import { buildSourceDocumentKey, OBJECT_STORAGE } from './object-storage';

describe('buildSourceDocumentKey', () => {
  it('should nest the key under the owning user id', () => {
    // Act
    const key = buildSourceDocumentKey('user-7', '.pdf');

    // Assert
    expect(key.startsWith('source-documents/user-7/')).toBe(true);
    expect(key.split('/')).toHaveLength(3);
  });

  // The worker reads the key back and derives a filename from its last segment to pick a parser.
  // A key with no extension makes every real import fail as unsupported_format.
  it('should end in the extension the caller gave, so the extractor can read the key back', () => {
    expect(buildSourceDocumentKey('user-7', '.pdf').endsWith('.pdf')).toBe(true);
    expect(buildSourceDocumentKey('user-7', '.tex').endsWith('.tex')).toBe(true);
    expect(buildSourceDocumentKey('user-7', '.html').endsWith('.html')).toBe(true);
  });

  it('should produce a different key on every call for the same user', () => {
    // Act
    const first = buildSourceDocumentKey('user-7', '.pdf');
    const second = buildSourceDocumentKey('user-7', '.pdf');

    // Assert
    expect(first).not.toBe(second);
  });

  it('should keep keys of different users disjoint by prefix', () => {
    // Act
    const aliceKey = buildSourceDocumentKey('alice-id', '.pdf');
    const bobKey = buildSourceDocumentKey('bob-id', '.pdf');

    // Assert
    expect(aliceKey.startsWith('source-documents/bob-id/')).toBe(false);
    expect(bobKey.startsWith('source-documents/alice-id/')).toBe(false);
  });
});

describe('OBJECT_STORAGE', () => {
  it('should be a unique injection token', () => {
    // Assert
    expect(typeof OBJECT_STORAGE).toBe('symbol');
    expect(OBJECT_STORAGE).not.toBe(Symbol('OBJECT_STORAGE'));
  });
});
