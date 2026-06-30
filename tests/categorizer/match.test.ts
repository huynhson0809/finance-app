import { describe, it, expect } from 'vitest';
import { classify } from '../../src/categorizer/match';
import type { CategoryRule } from '../../src/types';

function rule(p: string, cat: any, opts: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: opts.id ?? `r-${p}`,
    pattern: p,
    category: cat,
    weight: opts.weight ?? 1,
    learned: opts.learned ?? false,
    createdAt: opts.createdAt ?? '1970-01-01T00:00:00.000Z',
  };
}

describe('classify', () => {
  it('returns null for empty merchant', () => {
    expect(classify('', [rule('coffee', 'coffee-bubble-tea')])).toBeNull();
  });
  it('returns null when no rule matches', () => {
    expect(classify('Unknown Place', [rule('coffee', 'coffee-bubble-tea')])).toBeNull();
  });
  it('matches substring after normalization', () => {
    const r = rule('highlands', 'coffee-bubble-tea');
    const res = classify('Highlands Coffee Hà Nội', [r]);
    expect(res?.category).toBe('coffee-bubble-tea');
    expect(res?.ruleId).toBe(r.id);
  });
  it('returns highest-score candidate', () => {
    const rules = [
      rule('coffee', 'coffee-bubble-tea', { weight: 1 }),
      rule('highlands', 'food-drinks',     { weight: 5 }),
    ];
    expect(classify('Highlands Coffee', rules)?.category).toBe('food-drinks');
  });
  it('learned rule outranks any seed rule regardless of weight', () => {
    const rules = [
      rule('coffee', 'coffee-bubble-tea', { weight: 99, learned: false }),
      rule('highlands', 'food-drinks',     { weight: 1,  learned: true,
        createdAt: '2026-06-30T00:00:00.000Z' }),
    ];
    expect(classify('Highlands Coffee', rules)?.category).toBe('food-drinks');
  });
  it('among learned matches, most recent createdAt wins', () => {
    const rules = [
      rule('highlands', 'food-drinks',       { learned: true,
        createdAt: '2026-01-01T00:00:00.000Z', id: 'old' }),
      rule('highlands', 'coffee-bubble-tea', { learned: true,
        createdAt: '2026-06-29T00:00:00.000Z', id: 'new' }),
    ];
    expect(classify('Highlands Coffee', rules)?.ruleId).toBe('new');
  });
});
