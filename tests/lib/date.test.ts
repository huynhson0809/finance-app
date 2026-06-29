import { describe, it, expect } from 'vitest';
import { todayISO, monthOf, isSameDay } from '../../src/lib/date';

describe('date helpers', () => {
  it('monthOf extracts YYYY-MM', () => {
    expect(monthOf('2026-06-29T10:00:00.000Z')).toBe('2026-06');
  });
  it('todayISO is parseable', () => {
    expect(() => new Date(todayISO()).toISOString()).not.toThrow();
  });
  it('isSameDay compares calendar days in local time', () => {
    const a = new Date(2026, 5, 29, 1, 0).toISOString();
    const b = new Date(2026, 5, 29, 23, 0).toISOString();
    const c = new Date(2026, 5, 30, 1, 0).toISOString();
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });
});
