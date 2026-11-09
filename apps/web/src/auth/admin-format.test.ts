import { describe, expect, it } from 'vitest';
import { deviceCount, formatDateTime } from './admin-format.js';

describe('formatDateTime', () => {
  it('writes ISO 8601 date and 24 h time with the zone name', () => {
    expect(formatDateTime('2026-11-08T23:34:05.000Z', 'Europe/Paris')).toBe(
      '2026-11-09 00:34 GMT+1',
    );
  });

  it('writes UTC as such', () => {
    expect(formatDateTime('2026-11-08T12:04:59.000Z', 'UTC')).toBe('2026-11-08 12:04 UTC');
  });

  it('writes midnight as 00, never 24', () => {
    expect(formatDateTime('2026-01-01T00:00:00.000Z', 'UTC')).toBe('2026-01-01 00:00 UTC');
  });

  it('says never for no date', () => {
    expect(formatDateTime(null)).toBe('never');
  });

  it('keeps an unparsable value as it came', () => {
    expect(formatDateTime('not a date')).toBe('not a date');
  });
});

describe('deviceCount', () => {
  it.each([
    [0, '0 devices'],
    [1, '1 device'],
    [2, '2 devices'],
  ])('words %i', (count, text) => {
    expect(deviceCount(count)).toBe(text);
  });
});
