import { describe, expect, it } from 'vitest';
import { deriveAge, fmtClock, fmtDist, fmtDur, kmh, pct, sportName } from './format';

describe('format helpers', () => {
  it('formats durations with hours only when needed', () => {
    expect(fmtDur(65.4)).toBe('1m 05s');
    expect(fmtDur(3661)).toBe('1h 1m');
  });

  it('formats clock, distance, speed, and percentage values', () => {
    expect(fmtClock(125)).toBe('2:05');
    expect(fmtDist(999.4)).toBe('999 m');
    expect(fmtDist(1234)).toBe('1.23 km');
    expect(kmh(5)).toBe('18.0');
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 0)).toBe(0);
  });

  it('normalizes sport names and rejects invalid ages', () => {
    expect(sportName(7)).toBe('Soccer');
    expect(sportName(42)).toBe('Sport 42');
    expect(sportName('futsal')).toBe('Futsal');
    expect(sportName(null)).toBeNull();
    expect(deriveAge('not-a-date')).toBeNull();
    expect(deriveAge('1900-01-01')).toBeNull();
  });
});
