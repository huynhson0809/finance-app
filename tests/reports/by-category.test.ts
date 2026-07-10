import { describe, it, expect } from 'vitest';
import { sumByCategory } from '../../src/reports/by-category';
import type { Category, Transaction, TransactionDirection } from '../../src/types';

function tx(
  amount: number,
  category: Category,
  direction: TransactionDirection = 'expense',
  occurredAt = '2026-06-15T10:00:00.000Z',
): Transaction {
  return {
    id: crypto.randomUUID(), amount, currency: 'VND', occurredAt,
    direction, category, source: 'manual',
    createdAt: occurredAt, updatedAt: occurredAt,
  } as Transaction;
}

describe('sumByCategory', () => {
  it('returns zeros for empty input', () => {
    const out = sumByCategory([]);
    expect(out['food-drinks']).toBe(0);
    expect(out['others']).toBe(0);
  });
  it('sums per category', () => {
    const out = sumByCategory([
      tx(1000, 'food-drinks'),
      tx(500,  'food-drinks'),
      tx(750,  'coffee-bubble-tea'),
    ]);
    expect(out['food-drinks']).toBe(1500);
    expect(out['coffee-bubble-tea']).toBe(750);
    expect(out['shopping']).toBe(0);
  });
  it('ignores income rows', () => {
    const out = sumByCategory([
      tx(10000, 'food-drinks'),
      tx(50000, 'salary', 'income'),
    ]);

    expect(out['food-drinks']).toBe(10000);
    expect(out.salary).toBe(0);
  });
  it('counts legacy rows without direction as expense', () => {
    const legacy = {
      ...tx(10000, 'food-drinks'),
      direction: undefined,
    } as unknown as Transaction;

    expect(sumByCategory([legacy])['food-drinks']).toBe(10000);
  });

  it('sums custom expense categories and still ignores custom income categories', () => {
    const out = sumByCategory([
      tx(332000, 'custom-expense-date-night'),
      tx(50000, 'custom-income-side-gig', 'income'),
    ]);

    expect(out['custom-expense-date-night']).toBe(332000);
    expect(out['custom-income-side-gig']).toBeUndefined();
  });
});
