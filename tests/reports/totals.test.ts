import { describe, it, expect } from 'vitest';
import { totalsByDirection } from '../../src/reports/totals';
import type { Transaction, TransactionDirection } from '../../src/types';

function tx(amount: number, direction: TransactionDirection): Transaction {
  const occurredAt = '2026-06-15T10:00:00.000Z';
  return {
    id: crypto.randomUUID(),
    amount,
    currency: 'VND',
    occurredAt,
    direction,
    category: direction === 'income' ? 'salary' : 'food-drinks',
    source: 'manual',
    createdAt: occurredAt,
    updatedAt: occurredAt,
  } as Transaction;
}

describe('totalsByDirection', () => {
  it('returns expense, income, and net totals', () => {
    const out = totalsByDirection([
      tx(10000, 'expense'),
      tx(50000, 'income'),
      tx(5000, 'expense'),
    ]);

    expect(out).toEqual({ expense: 15000, income: 50000, net: 35000 });
  });

  it('counts legacy rows without direction as expense', () => {
    const legacy = {
      ...tx(10000, 'expense'),
      direction: undefined,
    } as unknown as Transaction;

    expect(totalsByDirection([legacy])).toEqual({ expense: 10000, income: 0, net: -10000 });
  });
});
