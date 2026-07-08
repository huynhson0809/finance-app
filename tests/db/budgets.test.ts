import { describe, it, expect } from 'vitest';
import { upsertBudget, getBudgetForMonth } from '../../src/db/budgets';

describe('budgets store', () => {
  it('upserts and reads back by month', async () => {
    await upsertBudget('2026-06', 5_000_000);
    const got = await getBudgetForMonth('2026-06');
    expect(got?.total).toBe(5_000_000);
    expect(got?.caps).toEqual({});
  });

  it('defaults savingsTarget to 0 for old callers', async () => {
    await upsertBudget('2026-07', 5_000_000);
    const got = await getBudgetForMonth('2026-07');
    expect(got?.savingsTarget).toBe(0);
  });

  it('persists savingsTarget', async () => {
    await upsertBudget('2026-08', 5_000_000, {}, 1_250_000);
    const got = await getBudgetForMonth('2026-08');
    expect(got?.savingsTarget).toBe(1_250_000);
  });

  it('clamps negative savingsTarget to 0', async () => {
    await upsertBudget('2026-09', 5_000_000, {}, -100_000);
    const got = await getBudgetForMonth('2026-09');
    expect(got?.savingsTarget).toBe(0);
  });

  it('rounds fractional savingsTarget', async () => {
    await upsertBudget('2026-10', 5_000_000, {}, 123_456.78);
    const got = await getBudgetForMonth('2026-10');
    expect(got?.savingsTarget).toBe(123_457);
  });

  it('overwrites existing budget for the same month', async () => {
    await upsertBudget('2026-06', 5_000_000);
    await upsertBudget('2026-06', 6_000_000, { 'coffee-bubble-tea': 200_000 });
    const got = await getBudgetForMonth('2026-06');
    expect(got?.total).toBe(6_000_000);
    expect(got?.caps).toEqual({ 'coffee-bubble-tea': 200_000 });
  });

  it('returns undefined when no budget exists', async () => {
    expect(await getBudgetForMonth('2030-01')).toBeUndefined();
  });
});
