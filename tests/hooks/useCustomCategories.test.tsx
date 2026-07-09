import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UserCategory } from '../../src/types';

const mocks = vi.hoisted(() => ({
  createCustomCategory: vi.fn(),
  deleteCustomCategory: vi.fn(),
  getCustomCategories: vi.fn(),
  renameCustomCategory: vi.fn(),
  updateCustomCategoryIcon: vi.fn(),
}));

vi.mock('../../src/db/custom-categories', () => mocks);

import { useCustomCategories } from '../../src/hooks/useCustomCategories';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function customCategory(overrides: Partial<UserCategory> = {}): UserCategory {
  return {
    id: 'custom-expense-pet-care',
    direction: 'expense',
    name: 'Pet care',
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mocks.createCustomCategory.mockReset();
  mocks.deleteCustomCategory.mockReset();
  mocks.getCustomCategories.mockReset();
  mocks.renameCustomCategory.mockReset();
  mocks.updateCustomCategoryIcon.mockReset();
});

describe('useCustomCategories', () => {
  it('does not let a stale reload overwrite a successful add', async () => {
    const staleReload = deferred<UserCategory[]>();
    const created = customCategory();
    mocks.getCustomCategories.mockReturnValueOnce(staleReload.promise);
    mocks.createCustomCategory.mockResolvedValueOnce(created);

    const { result } = renderHook(() => useCustomCategories());

    await act(async () => {
      await result.current.addCategory('expense', 'Pet care');
    });
    expect(result.current.categories).toEqual([created]);

    await act(async () => {
      staleReload.resolve([]);
      await staleReload.promise;
    });

    await waitFor(() => expect(result.current.categories).toEqual([created]));
  });

  it('does not let a reload started during a pending add overwrite the added category', async () => {
    const pendingAdd = deferred<UserCategory>();
    const staleReload = deferred<UserCategory[]>();
    const created = customCategory();
    mocks.getCustomCategories
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(staleReload.promise);
    mocks.createCustomCategory.mockReturnValueOnce(pendingAdd.promise);

    const { result } = renderHook(() => useCustomCategories());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let addPromise!: Promise<UserCategory>;
    act(() => {
      addPromise = result.current.addCategory('expense', 'Pet care');
    });

    act(() => {
      void result.current.reload();
    });

    await act(async () => {
      pendingAdd.resolve(created);
      await addPromise;
    });
    expect(result.current.categories).toEqual([created]);

    await act(async () => {
      staleReload.resolve([]);
      await staleReload.promise;
    });

    await waitFor(() => expect(result.current.categories).toEqual([created]));
  });
});
