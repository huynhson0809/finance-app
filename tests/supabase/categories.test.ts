import { describe, expect, it, vi } from 'vitest';
import {
  deleteCloudCustomCategory,
  listCloudCategoryOrders,
  listCloudCategoryOverrides,
  listCloudCustomCategories,
  upsertCloudCategoryOrder,
  upsertCloudCategoryOverride,
  upsertCloudCustomCategory,
} from '../../src/supabase/categories';
import type { CategoryOverride, UserCategory } from '../../src/types';

interface Call {
  method: string;
  args: unknown[];
}

interface MockResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function createClient<T>(result: MockResult<T>) {
  const calls: Call[] = [];
  let upsertedRow: unknown;

  const query = {
    order(column: string, opts: { ascending: boolean }) {
      calls.push({ method: 'order', args: [column, opts] });
      return Promise.resolve(result);
    },
    eq(column: string, value: string) {
      calls.push({ method: 'eq', args: [column, value] });
      return query;
    },
    single() {
      calls.push({ method: 'single', args: [] });
      return Promise.resolve(result);
    },
    then<TResult1 = MockResult<T>, TResult2 = never>(
      onfulfilled?: ((value: MockResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };

  const fromStage = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] });
      return query;
    },
    upsert(row: unknown, options: unknown) {
      upsertedRow = row;
      calls.push({ method: 'upsert', args: [row, options] });
      return {
        select(columns: string) {
          calls.push({ method: 'select', args: [columns] });
          return query;
        },
      };
    },
    delete() {
      calls.push({ method: 'delete', args: [] });
      return query;
    },
  };

  return {
    calls,
    get upsertedRow() { return upsertedRow; },
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from(table: string) {
        calls.push({ method: 'from', args: [table] });
        return fromStage;
      },
    },
  };
}

describe('cloud categories', () => {
  it('lists custom categories for the signed-in user', async () => {
    const { client, calls } = createClient({
      data: [{
        id: 'custom-expense-snacks-1234',
        direction: 'expense',
        name: 'Snacks',
        icon_key: 'shopping',
        created_at: '2026-07-09T00:00:00.000Z',
        updated_at: '2026-07-09T00:00:00.000Z',
      }],
      error: null,
    });

    await expect(listCloudCustomCategories(client)).resolves.toEqual([
      {
        id: 'custom-expense-snacks-1234',
        direction: 'expense',
        name: 'Snacks',
        iconKey: 'shopping',
        createdAt: '2026-07-09T00:00:00.000Z',
        updatedAt: '2026-07-09T00:00:00.000Z',
      },
    ]);
    expect(calls).toEqual([
      { method: 'from', args: ['user_categories'] },
      { method: 'select', args: ['id,direction,name,icon_key,created_at,updated_at'] },
      { method: 'order', args: ['created_at', { ascending: true }] },
    ]);
  });

  it('upserts custom categories with the current user id', async () => {
    const category: UserCategory = {
      id: 'custom-expense-snacks-1234',
      direction: 'expense',
      name: 'Snacks',
      iconKey: 'shopping',
      createdAt: '2026-07-09T00:00:00.000Z',
      updatedAt: '2026-07-09T00:00:00.000Z',
    };
    const context = createClient({
      data: {
        id: category.id,
        direction: 'expense',
        name: 'Snacks',
        icon_key: 'shopping',
        created_at: category.createdAt,
        updated_at: category.updatedAt,
      },
      error: null,
    });

    await upsertCloudCustomCategory(context.client, category);

    expect(context.upsertedRow).toMatchObject({
      id: category.id,
      user_id: 'user-1',
      direction: 'expense',
      name: 'Snacks',
      icon_key: 'shopping',
    });
    expect(context.calls).toContainEqual({
      method: 'upsert',
      args: [expect.any(Object), { onConflict: 'user_id,id' }],
    });
  });

  it('deletes custom categories by id', async () => {
    const { client, calls } = createClient({ data: null, error: null });

    await deleteCloudCustomCategory(client, 'custom-expense-snacks-1234');

    expect(calls).toEqual([
      { method: 'from', args: ['user_categories'] },
      { method: 'delete', args: [] },
      { method: 'eq', args: ['id', 'custom-expense-snacks-1234'] },
    ]);
  });

  it('lists and upserts category overrides', async () => {
    const override: CategoryOverride = {
      category: 'food-drinks',
      name: 'Eating out',
      iconKey: 'coffee',
      updatedAt: '2026-07-09T00:00:00.000Z',
    };
    const context = createClient({
      data: [{
        category: 'food-drinks',
        name: 'Eating out',
        icon_key: 'coffee',
        updated_at: '2026-07-09T00:00:00.000Z',
      }],
      error: null,
    });

    await expect(listCloudCategoryOverrides(context.client)).resolves.toEqual([override]);
    await upsertCloudCategoryOverride(context.client, override);

    expect(context.upsertedRow).toMatchObject({
      user_id: 'user-1',
      category: 'food-drinks',
      name: 'Eating out',
      icon_key: 'coffee',
    });
  });

  it('lists and upserts category orders for the signed-in user', async () => {
    const context = createClient({
      data: [{
        direction: 'expense',
        categories: ['coffee-bubble-tea', 'food-drinks'],
        updated_at: '2026-07-10T00:00:00.000Z',
      }],
      error: null,
    });

    await expect(listCloudCategoryOrders(context.client)).resolves.toEqual([{
      direction: 'expense',
      categories: ['coffee-bubble-tea', 'food-drinks'],
      updatedAt: '2026-07-10T00:00:00.000Z',
    }]);

    await upsertCloudCategoryOrder(context.client, {
      direction: 'expense',
      categories: ['coffee-bubble-tea', 'food-drinks'],
      updatedAt: '2026-07-10T00:00:00.000Z',
    });

    expect(context.calls).toContainEqual({
      method: 'from',
      args: ['category_orders'],
    });
    expect(context.upsertedRow).toMatchObject({
      user_id: 'user-1',
      direction: 'expense',
      categories: ['coffee-bubble-tea', 'food-drinks'],
    });
    expect(context.calls).toContainEqual({
      method: 'upsert',
      args: [expect.any(Object), { onConflict: 'user_id,direction' }],
    });
  });
});
