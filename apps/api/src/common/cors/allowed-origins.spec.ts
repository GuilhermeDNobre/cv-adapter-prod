import { describe, expect, it } from 'vitest';
import { readAllowedOrigins } from './allowed-origins';

describe('readAllowedOrigins', () => {
  it('should fall back to the local front when nothing is configured', () => {
    expect(readAllowedOrigins(undefined)).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
  });

  it('should split a configured list and drop the surrounding blanks', () => {
    expect(readAllowedOrigins('https://cv-adapter.app , https://staging.cv-adapter.app')).toEqual([
      'https://cv-adapter.app',
      'https://staging.cv-adapter.app',
    ]);
  });

  it('should drop the trailing slash so the value matches the browser Origin header', () => {
    expect(readAllowedOrigins('https://cv-adapter.app/')).toEqual(['https://cv-adapter.app']);
  });

  it('should never widen to a wildcard, even when the value is blank', () => {
    expect(readAllowedOrigins('  ,  ')).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
    expect(readAllowedOrigins('')).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
  });
});
