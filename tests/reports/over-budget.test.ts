import { describe, it, expect } from 'vitest';
import { spendableBudget, status } from '../../src/reports/over-budget';
import { CATEGORIES } from '../../src/types';
import type { Budget } from '../../src/types';

function emptySums() {
  const out = {} as Record<any, number>;
  for (const c of CATEGORIES) out[c] = 0;
  return out;
}

describe('over-budget status', () => {
  it('spendableBudget returns total minus savingsTarget', () => {
    const budget: Budget = {
      id: 'b',
      month: '2026-06',
      total: 1000,
      savingsTarget: 250,
      caps: {},
    };
    expect(spendableBudget(budget)).toBe(750);
  });

  it('spendableBudget clamps to zero if savings target exceeds total', () => {
    const budget: Budget = {
      id: 'b',
      month: '2026-06',
      total: 1000,
      savingsTarget: 1200,
      caps: {},
    };
    expect(spendableBudget(budget)).toBe(0);
  });

  it('returns ok for everything when no budget set', () => {
    const out = status(undefined, emptySums());
    expect(out.overall).toBe('ok');
    expect(out.perCategory['food-drinks']).toBe('ok');
  });
  it('overall ok when under 80%', () => {
    const budget: Budget = { id: 'b', month: '2026-06', total: 1000, caps: {} };
    const sums = { ...emptySums(), 'food-drinks': 500 };
    expect(status(budget, sums).overall).toBe('ok');
  });
  it('overall warn between 80% and 100%', () => {
    const budget: Budget = { id: 'b', month: '2026-06', total: 1000, caps: {} };
    const sums = { ...emptySums(), 'food-drinks': 850 };
    expect(status(budget, sums).overall).toBe('warn');
  });
  it('overall over above 100%', () => {
    const budget: Budget = { id: 'b', month: '2026-06', total: 1000, caps: {} };
    const sums = { ...emptySums(), 'food-drinks': 1500 };
    expect(status(budget, sums).overall).toBe('over');
  });
  it('per-category over when category exceeds its cap', () => {
    const budget: Budget = {
      id: 'b', month: '2026-06', total: 1000,
      caps: { 'coffee-bubble-tea': 100 },
    };
    const sums = { ...emptySums(), 'coffee-bubble-tea': 150 };
    expect(status(budget, sums).perCategory['coffee-bubble-tea']).toBe('over');
  });
  it('category without a cap stays ok', () => {
    const budget: Budget = { id: 'b', month: '2026-06', total: 1000, caps: {} };
    const sums = { ...emptySums(), 'shopping': 999999 };
    expect(status(budget, sums).perCategory['shopping']).toBe('ok');
  });
  it('ignores income category sums for budget status', () => {
    const budget: Budget = { id: 'b', month: '2026-06', total: 1000, caps: {} };
    const sums = { ...emptySums(), salary: 999999 };
    const out = status(budget, sums);

    expect(out.overallSpent).toBe(0);
    expect(out.overall).toBe('ok');
    expect(out.perCategory.salary).toBe('ok');
  });

  it('uses spendable budget for overall status and exposes overallLimit', () => {
    const budget: Budget = {
      id: 'b',
      month: '2026-06',
      total: 1000,
      savingsTarget: 200,
      caps: { 'coffee-bubble-tea': 100 },
    };
    const sums = { ...emptySums(), 'food-drinks': 850, 'coffee-bubble-tea': 50 };
    const out = status(budget, sums);

    expect(out.overallLimit).toBe(800);
    expect(out.overallSpent).toBe(900);
    expect(out.overall).toBe('over');
    expect(out.perCategory['coffee-bubble-tea']).toBe('ok');
  });

  it('includes custom expense category sums in overall spent', () => {
    const budget: Budget = {
      id: 'b',
      month: '2026-06',
      total: 1000,
      caps: {},
    };
    const sums = { ...emptySums(), 'custom-expense-date-night': 850 };
    const out = status(budget, sums);

    expect(out.overallSpent).toBe(850);
    expect(out.overall).toBe('warn');
  });
});
