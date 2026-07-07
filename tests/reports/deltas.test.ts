import { describe, it, expect } from 'vitest';
import { monthOverMonth } from '../../src/reports/deltas';
import type { Category, Transaction, TransactionDirection } from '../../src/types';

function tx(
  amount: number,
  category: Category,
  direction: TransactionDirection = 'expense',
): Transaction {
  return {
    id: crypto.randomUUID(), amount, currency: 'VND',
    occurredAt: '2026-06-01T00:00:00.000Z', direction, category, source: 'manual',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  } as Transaction;
}

describe('monthOverMonth', () => {
  it('returns 0/0 for empty months', () => {
    const out = monthOverMonth([], []);
    expect(out['food-drinks']).toEqual({ curr: 0, prev: 0, deltaPct: 0 });
  });
  it('computes deltaPct when prev > 0', () => {
    const out = monthOverMonth([tx(1400, 'coffee-bubble-tea')], [tx(1000, 'coffee-bubble-tea')]);
    expect(out['coffee-bubble-tea'].deltaPct).toBeCloseTo(0.4);
  });
  it('returns deltaPct=0 when prev=0', () => {
    const out = monthOverMonth([tx(1000, 'food-drinks')], []);
    expect(out['food-drinks'].deltaPct).toBe(0);
  });
  it('ignores income rows', () => {
    const out = monthOverMonth(
      [tx(10000, 'food-drinks'), tx(50000, 'salary', 'income')],
      [tx(5000, 'food-drinks'), tx(25000, 'salary', 'income')],
    );

    expect(out['food-drinks']).toEqual({ curr: 10000, prev: 5000, deltaPct: 1 });
    expect(out.salary).toEqual({ curr: 0, prev: 0, deltaPct: 0 });
  });
});
