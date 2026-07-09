import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import {
  createCustomCategory,
  deleteCustomCategory,
  getCustomCategories,
  renameCustomCategory,
} from '../../src/db/custom-categories';

async function deleteFinanceDB(): Promise<void> {
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await __resetDBForTests();
  await deleteFinanceDB();
});

describe('custom categories db', () => {
  it('starts empty', async () => {
    await expect(getCustomCategories()).resolves.toEqual([]);
  });

  it('creates trimmed custom categories with direction-specific ids and persists them', async () => {
    const expense = await createCustomCategory('expense', '  Pet care  ');
    const income = await createCustomCategory('income', '  Freelance  ');

    expect(expense).toMatchObject({
      id: expect.stringMatching(/^custom-expense-pet-care-/),
      direction: 'expense',
      name: 'Pet care',
    });
    expect(income).toMatchObject({
      id: expect.stringMatching(/^custom-income-freelance-/),
      direction: 'income',
      name: 'Freelance',
    });
    expect(expense.createdAt).toBe(expense.updatedAt);

    await __resetDBForTests();
    await expect(getCustomCategories()).resolves.toEqual([expense, income]);
  });

  it('keeps all categories created by overlapping mutations', async () => {
    const [expense, income] = await Promise.all([
      createCustomCategory('expense', 'Pet care'),
      createCustomCategory('income', 'Freelance'),
    ]);

    await expect(getCustomCategories()).resolves.toEqual([expense, income]);
  });

  it('rejects blank category names', async () => {
    await expect(createCustomCategory('expense', '   ')).rejects.toThrow('Category name cannot be blank');
  });

  it('renames and deletes persisted categories', async () => {
    const category = await createCustomCategory('expense', 'Subscriptions');

    const renamed = await renameCustomCategory(category.id, '  Monthly bills  ');
    expect(renamed).toMatchObject({
      ...category,
      name: 'Monthly bills',
      updatedAt: expect.any(String),
    });
    expect(renamed.updatedAt).not.toBe(category.updatedAt);

    await deleteCustomCategory(category.id);
    await expect(getCustomCategories()).resolves.toEqual([]);
  });
});
