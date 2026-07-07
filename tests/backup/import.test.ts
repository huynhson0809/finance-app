import { beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests, openFinanceDB } from '../../src/db';
import { addTransaction } from '../../src/db/transactions';
import { importBackup } from '../../src/backup/import';

beforeEach(async () => {
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
});

function asFile(obj: unknown): File {
  return new File([JSON.stringify(obj)], 'backup.json', { type: 'application/json' });
}

describe('importBackup', () => {
  it('rejects non-JSON input', async () => {
    const f = new File(['not json'], 'x.json', { type: 'application/json' });
    await expect(importBackup(f)).rejects.toThrow();
  });

  it('rejects wrong app marker', async () => {
    await expect(importBackup(asFile({ app: 'other', schemaVersion: 1, transactions: [], budgets: [], categoryRules: [], settings: [] }))).rejects.toThrow(/invalid backup/i);
  });

  it('rejects wrong schemaVersion', async () => {
    await expect(importBackup(asFile({
      app: 'finance-app', schemaVersion: 2,
      transactions: [], budgets: [], categoryRules: [], settings: [],
    }))).rejects.toThrow(/invalid backup/i);
  });

  it('replaces existing data with the imported file', async () => {
    // pre-populate
    await addTransaction({
      amount: 999, currency: 'VND',
      occurredAt: '2026-01-01T00:00:00.000Z',
      direction: 'expense',
      category: 'others', source: 'manual',
    });

    await importBackup(asFile({
      app: 'finance-app',
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      transactions: [{
        id: 't1', amount: 5000, currency: 'VND',
        occurredAt: '2026-06-15T08:00:00.000Z',
        category: 'food-drinks', source: 'manual',
        createdAt: '2026-06-15T08:00:00.000Z',
        updatedAt: '2026-06-15T08:00:00.000Z',
      }],
      budgets: [{ id: 'b1', month: '2026-06', total: 1000000, caps: {} }],
      categoryRules: [],
      settings: [{ key: 'locale', value: 'vi' }],
    }));

    const db = await openFinanceDB();
    const txs = await db.getAll('transactions');
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe('t1');
    expect(txs[0].amount).toBe(5000);
    const budgets = await db.getAll('budgets');
    expect(budgets[0].id).toBe('b1');
    const settings = await db.getAll('settings');
    expect(settings.find(s => s.key === 'locale')?.value).toBe('vi');
    expect(settings.find(s => s.key === 'lastBackupAt')?.value).toBe('2026-06-30T00:00:00.000Z');
  });
});
