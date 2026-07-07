import { describe, expect, it } from 'vitest';
import { categorySummaries } from '../../src/reports/category-summary';
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

describe('categorySummaries', () => {
  it('returns non-zero expense categories with percentages', () => {
    const out = categorySummaries([
      tx({ id: 'food', amount: 30_000, category: 'food-drinks' }),
      tx({ id: 'health', amount: 10_000, category: 'healthcare' }),
      tx({ id: 'income', amount: 100_000, direction: 'income', category: 'salary' }),
    ], 'expense');

    expect(out).toEqual([
      { category: 'food-drinks', direction: 'expense', total: 30_000, percentage: 0.75 },
      { category: 'healthcare', direction: 'expense', total: 10_000, percentage: 0.25 },
    ]);
  });

  it('returns non-zero income categories with percentages', () => {
    const out = categorySummaries([
      tx({ id: 'salary', amount: 80_000, direction: 'income', category: 'salary' }),
      tx({ id: 'bonus', amount: 20_000, direction: 'income', category: 'bonus' }),
      tx({ id: 'expense', amount: 10_000, category: 'food-drinks' }),
    ], 'income');

    expect(out).toEqual([
      { category: 'salary', direction: 'income', total: 80_000, percentage: 0.8 },
      { category: 'bonus', direction: 'income', total: 20_000, percentage: 0.2 },
    ]);
  });

  it('treats legacy transactions without direction as expenses', () => {
    const legacy = tx({ id: 'legacy', amount: 12_000, category: 'others' }) as Transaction & { direction?: never };
    delete legacy.direction;

    expect(categorySummaries([legacy], 'expense')).toEqual([
      { category: 'others', direction: 'expense', total: 12_000, percentage: 1 },
    ]);
    expect(categorySummaries([legacy], 'income')).toEqual([]);
  });

  it('returns an empty array when the selected direction has no total', () => {
    expect(categorySummaries([], 'expense')).toEqual([]);
    expect(categorySummaries([tx({ direction: 'income', category: 'salary' })], 'expense')).toEqual([]);
  });
});
