import { describe, it, expect } from 'vitest';
import { dailyTotals } from '../../src/reports/by-day';
import type { Transaction } from '../../src/types';

function tx(amount: number, occurredAt: string): Transaction {
  return {
    id: crypto.randomUUID(), amount, currency: 'VND', occurredAt,
    category: 'food-drinks', source: 'manual',
    createdAt: occurredAt, updatedAt: occurredAt,
  };
}

describe('dailyTotals', () => {
  it('returns one entry per day in month, zeros for empty days', () => {
    const out = dailyTotals([], '2026-06');
    expect(out).toHaveLength(30);
    expect(out[0].date).toBe('2026-06-01');
    expect(out[29].date).toBe('2026-06-30');
    expect(out.every(d => d.total === 0)).toBe(true);
  });
  it('sums all transactions on the same day', () => {
    const out = dailyTotals([
      tx(100, '2026-06-05T08:00:00.000Z'),
      tx(200, '2026-06-05T14:00:00.000Z'),
      tx(50,  '2026-06-06T09:00:00.000Z'),
    ], '2026-06');
    const d5 = out.find(d => d.date === '2026-06-05')!;
    const d6 = out.find(d => d.date === '2026-06-06')!;
    expect(d5.total).toBe(300);
    expect(d6.total).toBe(50);
  });
  it('ignores transactions outside the month', () => {
    const out = dailyTotals([
      tx(999, '2026-05-31T16:59:59.000Z'),
      tx(999, '2026-06-30T17:00:00.000Z'),
    ], '2026-06');
    expect(out.every(d => d.total === 0)).toBe(true);
  });

  it('groups bank transactions by Vietnam calendar day', () => {
    const out = dailyTotals([
      tx(100, '2026-06-30T17:30:00.000Z'),
      tx(200, '2026-07-31T16:30:00.000Z'),
      tx(999, '2026-07-31T17:00:00.000Z'),
    ], '2026-07');

    expect(out.find(d => d.date === '2026-07-01')?.total).toBe(100);
    expect(out.find(d => d.date === '2026-07-31')?.total).toBe(200);
  });
});
