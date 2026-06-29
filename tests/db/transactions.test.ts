import { describe, it, expect, beforeEach } from 'vitest';
import { addTransaction, listTransactions, getTodayTotal } from '../../src/db/transactions';
import { openFinanceDB } from '../../src/db';

beforeEach(async () => {
  indexedDB.deleteDatabase('finance-app');
  await openFinanceDB();
});

describe('transactions store', () => {
  it('adds a transaction and returns it with id + timestamps', async () => {
    const t = await addTransaction({
      amount: 45000, currency: 'VND',
      occurredAt: new Date().toISOString(),
      category: 'food-drinks', source: 'manual',
    });
    expect(t.id).toMatch(/.+/);
    expect(t.createdAt).toMatch(/.+/);
    expect(t.amount).toBe(45000);
  });

  it('lists transactions newest first', async () => {
    const earlier = new Date(2026, 0, 1).toISOString();
    const later = new Date(2026, 5, 1).toISOString();
    await addTransaction({ amount: 1, currency: 'VND', occurredAt: earlier, category: 'others', source: 'manual' });
    await addTransaction({ amount: 2, currency: 'VND', occurredAt: later, category: 'others', source: 'manual' });
    const got = await listTransactions();
    expect(got.map(t => t.amount)).toEqual([2, 1]);
  });

  it('limit returns at most N', async () => {
    for (let i = 0; i < 7; i++) {
      await addTransaction({
        amount: i + 1, currency: 'VND',
        occurredAt: new Date(2026, 0, i + 1).toISOString(),
        category: 'others', source: 'manual',
      });
    }
    const got = await listTransactions({ limit: 5 });
    expect(got).toHaveLength(5);
  });

  it('getTodayTotal sums today only', async () => {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    await addTransaction({ amount: 10000, currency: 'VND', occurredAt: today.toISOString(), category: 'others', source: 'manual' });
    await addTransaction({ amount: 99999, currency: 'VND', occurredAt: yesterday.toISOString(), category: 'others', source: 'manual' });
    expect(await getTodayTotal()).toBe(10000);
  });
});
