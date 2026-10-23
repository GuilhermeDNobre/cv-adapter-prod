import { describe, expect, it } from 'vitest';
import { normalizePartialDate } from './partial-date';

describe('normalizePartialDate', () => {
  it('should keep a year as is', () => {
    expect(normalizePartialDate('2019')).toBe('2019');
  });

  it('should keep a year and month as is', () => {
    expect(normalizePartialDate('2019-03')).toBe('2019-03');
  });

  it('should keep a full date as is', () => {
    expect(normalizePartialDate('2019-03-15')).toBe('2019-03-15');
  });

  it('should pad a single digit month to two digits', () => {
    expect(normalizePartialDate('3/2019')).toBe('2019-03');
  });

  it('should convert month and year to year and month', () => {
    expect(normalizePartialDate('03/2019')).toBe('2019-03');
  });

  it('should ignore spaces around the date', () => {
    expect(normalizePartialDate('  2019-03  ')).toBe('2019-03');
  });

  it('should reject an empty string', () => {
    expect(normalizePartialDate('')).toBeNull();
  });

  it('should reject a present marker', () => {
    expect(normalizePartialDate('Present')).toBeNull();
  });

  it('should reject a month beyond december', () => {
    expect(normalizePartialDate('2019-13')).toBeNull();
  });

  it('should reject a month beyond december in month year form', () => {
    expect(normalizePartialDate('13/2019')).toBeNull();
  });

  it('should reject a day that does not exist in the calendar', () => {
    expect(normalizePartialDate('2023-02-30')).toBeNull();
  });

  it('should reject a year first slash form', () => {
    expect(normalizePartialDate('2019/03')).toBeNull();
  });
});
