import { beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import { addTransaction } from '../../src/db/transactions';
import { upsertBudget } from '../../src/db/budgets';
import { upsertLearnedRule } from '../../src/db/category-rules';
import { setSetting } from '../../src/db/settings';
import { exportBackup } from '../../src/backup/export';

beforeEach(async () => {
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
});

describe('exportBackup', () => {
  it('returns the canonical empty backup when DB has nothing', async () => {
    const out = await exportBackup();
    expect(out.app).toBe('finance-app');
    expect(out.schemaVersion).toBe(1);
    expect(typeof out.exportedAt).toBe('string');
    expect(out.transactions).toEqual([]);
    expect(out.budgets).toEqual([]);
    expect(out.categoryRules).toEqual([]);
    expect(out.settings).toEqual([]);
  });

  it('exports populated stores', async () => {
    await addTransaction({
      amount: 5000, currency: 'VND',
      occurredAt: '2026-06-15T08:00:00.000Z',
      category: 'food-drinks', source: 'manual',
    });
    await upsertBudget('2026-06', 1000000);
    await upsertLearnedRule({
      id: 'r1', pattern: 'highlands', category: 'coffee-bubble-tea',
      weight: 10, learned: true, createdAt: '2026-06-30T00:00:00.000Z',
    });
    await setSetting('locale', 'en');

    const out = await exportBackup();
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0].amount).toBe(5000);
    expect(out.budgets).toHaveLength(1);
    expect(out.budgets[0].total).toBe(1000000);
    expect(out.categoryRules).toHaveLength(1);
    expect(out.settings).toHaveLength(1);
    expect(out.settings[0]).toEqual({ key: 'locale', value: 'en' });
  });
});
