import { describe, expect, it } from 'vitest';
import { categoryDayTotals } from '../../src/reports/category-day-totals';
import type { Transaction } from '../../src/types';

function tx(overrides: Partial<Transaction> & { direction?: Transaction['direction'] } = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    amount: overrides.amount ?? 10_000,
    currency: 'VND',
    occurredAt: overrides.occurredAt ?? '2026-07-04T14:48:00.000Z',
    category: 'food-drinks',
    direction: 'expense',
    source: 'manual',
    createdAt: '2026-07-04T14:48:00.000Z',
    updatedAt: '2026-07-04T14:48:00.000Z',
    ...overrides,
  } as Transaction;
}

describe('categoryDayTotals', () => {
  it('returns one bucket per day and filters by direction and category', () => {
    const out = categoryDayTotals([
      tx({ id: 'food-4', amount: 10_000, category: 'food-drinks', occurredAt: '2026-07-04T14:48:00.000Z' }),
      tx({ id: 'food-4-again', amount: 5_000, category: 'food-drinks', occurredAt: '2026-07-04T16:00:00.000Z' }),
      tx({ id: 'health', amount: 12_000, category: 'healthcare', occurredAt: '2026-07-04T14:48:00.000Z' }),
      tx({ id: 'income', amount: 90_000, direction: 'income', category: 'salary', occurredAt: '2026-07-04T14:48:00.000Z' }),
      tx({ id: 'next-month', amount: 8_000, category: 'food-drinks', occurredAt: '2026-08-01T14:48:00.000Z' }),
    ], '2026-07', 'expense', 'food-drinks');

    expect(out).toHaveLength(31);
    expect(out.find(d => d.date === '2026-07-04')?.total).toBe(15_000);
    expect(out.find(d => d.date === '2026-07-05')?.total).toBe(0);
  });

  it('supports income categories', () => {
    const out = categoryDayTotals([
      tx({ id: 'salary', amount: 100_000, direction: 'income', category: 'salary', occurredAt: '2026-07-10T08:00:00.000Z' }),
      tx({ id: 'expense', amount: 20_000, category: 'food-drinks', occurredAt: '2026-07-10T08:00:00.000Z' }),
    ], '2026-07', 'income', 'salary');

    expect(out.find(d => d.date === '2026-07-10')?.total).toBe(100_000);
  });

  it('treats legacy transactions without direction as expenses', () => {
    const legacy = tx({ id: 'legacy', amount: 7_000, category: 'others' }) as Transaction & { direction?: never };
    delete legacy.direction;

    expect(categoryDayTotals([legacy], '2026-07', 'expense', 'others').find(d => d.date === '2026-07-04')?.total).toBe(7_000);
    expect(categoryDayTotals([legacy], '2026-07', 'income', 'salary').find(d => d.date === '2026-07-04')?.total).toBe(0);
  });
});
