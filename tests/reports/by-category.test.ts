import { describe, it, expect } from 'vitest';
import { sumByCategory } from '../../src/reports/by-category';
import type { Transaction } from '../../src/types';

function tx(amount: number, category: any, occurredAt = '2026-06-15T10:00:00.000Z'): Transaction {
  return {
    id: crypto.randomUUID(), amount, currency: 'VND', occurredAt,
    category, source: 'manual',
    createdAt: occurredAt, updatedAt: occurredAt,
  };
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
});
