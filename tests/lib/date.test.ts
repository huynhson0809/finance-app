import { describe, it, expect } from 'vitest';
import { todayISO, monthOf, isSameDay, monthStartISO, prevMonth, monthRangeISO } from '../../src/lib/date';

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

describe('monthStartISO', () => {
  it('returns first-of-month at local midnight', () => {
    const sample = new Date(2026, 5, 29, 10, 0).toISOString(); // June 29, 2026
    const start = new Date(monthStartISO(sample));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
  });
});

describe('prevMonth', () => {
  it('rolls year back', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
  });
  it('handles mid-year', () => {
    expect(prevMonth('2026-06')).toBe('2026-05');
  });
});

describe('monthRangeISO', () => {
  it('returns local-midnight boundaries inclusive of month', () => {
    const { sinceISO, untilISO } = monthRangeISO('2026-06');
    expect(sinceISO < untilISO).toBe(true);
    expect(new Date(sinceISO).toISOString()).toBe(sinceISO);
    expect(new Date(untilISO).toISOString()).toBe(untilISO);
    // With TZ=UTC pinned in tests/setup.ts:
    expect(sinceISO).toBe('2026-06-01T00:00:00.000Z');
    expect(untilISO).toBe('2026-07-01T00:00:00.000Z');
  });
  it('rolls year boundary in untilISO', () => {
    const { untilISO } = monthRangeISO('2026-12');
    expect(untilISO).toBe('2027-01-01T00:00:00.000Z');
  });
});
