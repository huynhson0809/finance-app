import { describe, it, expect } from 'vitest';
import { monthOverMonth } from '../../src/reports/deltas';
import type { Transaction } from '../../src/types';

function tx(amount: number, category: any): Transaction {
  return {
    id: crypto.randomUUID(), amount, currency: 'VND',
    occurredAt: '2026-06-01T00:00:00.000Z', category, source: 'manual',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  };
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
});
