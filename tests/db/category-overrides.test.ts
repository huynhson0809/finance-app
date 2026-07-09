import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import { getCategoryOverrides, upsertCategoryOverride } from '../../src/db/category-overrides';

beforeEach(async () => {
  await __resetDBForTests();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('category overrides', () => {
  it('stores a display name and icon override for a built-in category', async () => {
    await upsertCategoryOverride('food-drinks', {
      name: 'Eating out',
      iconKey: 'coffee',
    });

    expect(await getCategoryOverrides()).toEqual([
      expect.objectContaining({
        category: 'food-drinks',
        name: 'Eating out',
        iconKey: 'coffee',
      }),
    ]);
  });

  it('replaces an existing override for the same category', async () => {
    await upsertCategoryOverride('food-drinks', { name: 'Food', iconKey: 'utensils' });
    await upsertCategoryOverride('food-drinks', { name: 'Meals', iconKey: 'shopping' });

    expect(await getCategoryOverrides()).toEqual([
      expect.objectContaining({
        category: 'food-drinks',
        name: 'Meals',
        iconKey: 'shopping',
      }),
    ]);
  });
});
