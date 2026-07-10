import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import { getCategoryOrder, replaceCategoryOrder } from '../../src/db/category-order';

beforeEach(async () => {
  await __resetDBForTests();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('category order store', () => {
  it('persists a per-owner category order and normalizes invalid ids', async () => {
    const saved = await replaceCategoryOrder('user-1', 'expense', [
      'coffee-bubble-tea',
      'coffee-bubble-tea',
      'salary',
      'custom-expense-snacks-1234',
    ]);

    expect(saved.categories).toEqual([
      'coffee-bubble-tea',
      'custom-expense-snacks-1234',
    ]);
    await expect(getCategoryOrder('user-1', 'expense')).resolves.toEqual(saved);
    await expect(getCategoryOrder('user-2', 'expense')).resolves.toBeNull();
  });
});
