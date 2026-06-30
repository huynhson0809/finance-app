import { describe, it, expect } from 'vitest';
import { hints } from '../../src/reports/anomalies';

describe('hints', () => {
  it('returns empty when no category exceeds 25%', () => {
    expect(hints({
      'food-drinks':       { curr: 110, prev: 100, deltaPct: 0.10 },
    } as any)).toEqual([]);
  });
  it('returns categories above threshold, sorted desc', () => {
    const out = hints({
      'coffee-bubble-tea': { curr: 140, prev: 100, deltaPct: 0.40 },
      'food-drinks':       { curr: 130, prev: 100, deltaPct: 0.30 },
      'transportation':    { curr: 110, prev: 100, deltaPct: 0.10 },
    } as any);
    expect(out.map(h => h.category)).toEqual(['coffee-bubble-tea', 'food-drinks']);
  });
  it('ignores categories with prev=0', () => {
    expect(hints({
      'food-drinks': { curr: 1000, prev: 0, deltaPct: 0 },
    } as any)).toEqual([]);
  });
});
