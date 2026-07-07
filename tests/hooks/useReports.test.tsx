import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import { upsertBudget } from '../../src/db/budgets';
import { monthRangeVietnamISO, prevMonth } from '../../src/lib/date';
import type { Transaction } from '../../src/types';

const mocks = vi.hoisted(() => ({
  supabase: {} as unknown,
  listCloudTransactionsForRange: vi.fn(),
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock('../../src/supabase/transactions', () => ({
  listCloudTransactionsForRange: mocks.listCloudTransactionsForRange,
}));

import { useReports } from '../../src/hooks/useReports';

beforeEach(async () => {
  mocks.supabase = {};
  mocks.listCloudTransactionsForRange.mockReset();
  mocks.listCloudTransactionsForRange.mockResolvedValue([]);
  await deleteFinanceDB();
  await __resetDBForTests();
});

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    amount: 1000,
    currency: 'VND',
    occurredAt: '2026-06-15T08:00:00.000Z',
    category: 'others',
    source: 'bank-email',
    createdAt: '2026-06-15T08:00:00.000Z',
    updatedAt: '2026-06-15T08:00:00.000Z',
    direction: 'expense',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function deleteFinanceDB(): Promise<void> {
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

describe('useReports', () => {
  it('loads current and previous month transactions from Supabase ranges', async () => {
    const { result } = renderHook(() => useReports('2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mocks.listCloudTransactionsForRange).toHaveBeenNthCalledWith(
      1,
      mocks.supabase,
      monthRangeVietnamISO('2026-06'),
    );
    expect(mocks.listCloudTransactionsForRange).toHaveBeenNthCalledWith(
      2,
      mocks.supabase,
      monthRangeVietnamISO(prevMonth('2026-06')),
    );
    expect(result.current.sums['food-drinks']).toBe(0);
    expect(result.current.bStatus.overall).toBe('ok');
    expect(result.current.error).toBeNull();
  });

  it('aggregates legacy current month cloud transactions with local budget data', async () => {
    mocks.listCloudTransactionsForRange
      .mockResolvedValueOnce([
        tx({
          id: 'curr-food',
          amount: 1500,
          occurredAt: '2026-06-10T08:00:00.000Z',
          category: 'food-drinks',
        }),
      ])
      .mockResolvedValueOnce([
        tx({
          id: 'prev-food',
          amount: 500,
          occurredAt: '2026-05-10T08:00:00.000Z',
          category: 'food-drinks',
        }),
      ]);
    await upsertBudget('2026-06', 10000);

    const { result } = renderHook(() => useReports('2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sums['food-drinks']).toBe(1500);
    expect(result.current.daily.find(d => d.date === '2026-06-10')?.total).toBe(1500);
    expect(result.current.deltas['food-drinks']).toEqual({
      curr: 1500,
      prev: 500,
      deltaPct: 2,
    });
    expect(result.current.bStatus.overall).toBe('ok');
    expect(result.current.error).toBeNull();
  });

  it('returns current month totals split by direction', async () => {
    mocks.listCloudTransactionsForRange
      .mockResolvedValueOnce([
        tx({
          id: 'expense',
          amount: 15_000,
          occurredAt: '2026-06-10T08:00:00.000Z',
          direction: 'expense',
          category: 'food-drinks',
        }),
        tx({
          id: 'income',
          amount: 100_000,
          occurredAt: '2026-06-11T08:00:00.000Z',
          direction: 'income',
          category: 'salary',
        }),
      ])
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useReports('2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.directionTotals).toEqual({
      expense: 15_000,
      income: 100_000,
      net: 85_000,
    });
  });

  it('returns a setup error and empty cloud data when Supabase is not configured', async () => {
    mocks.supabase = null;

    const { result } = renderHook(() => useReports('2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mocks.listCloudTransactionsForRange).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Supabase is not configured');
    expect(result.current.sums['food-drinks']).toBe(0);
    expect(result.current.bStatus.overall).toBe('ok');
  });

  it('surfaces cloud query failures and settles loading', async () => {
    mocks.listCloudTransactionsForRange
      .mockRejectedValueOnce(new Error('cloud failed'))
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useReports('2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('cloud failed');
    expect(result.current.sums['food-drinks']).toBe(0);
  });

  it('keeps newer month results when an older load resolves later', async () => {
    const staleCurrent = deferred<Transaction[]>();
    const stalePrevious = deferred<Transaction[]>();
    const freshCurrent = deferred<Transaction[]>();
    const freshPrevious = deferred<Transaction[]>();
    mocks.listCloudTransactionsForRange
      .mockReturnValueOnce(staleCurrent.promise)
      .mockReturnValueOnce(stalePrevious.promise)
      .mockReturnValueOnce(freshCurrent.promise)
      .mockReturnValueOnce(freshPrevious.promise);

    const { result, rerender } = renderHook(
      ({ month }) => useReports(month),
      { initialProps: { month: '2026-06' } },
    );

    rerender({ month: '2026-07' });

    await act(async () => {
      freshCurrent.resolve([
        tx({
          id: 'fresh',
          amount: 700,
          occurredAt: '2026-07-05T08:00:00.000Z',
          category: 'shopping',
        }),
      ]);
      freshPrevious.resolve([]);
      await Promise.all([freshCurrent.promise, freshPrevious.promise]);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sums.shopping).toBe(700);
    expect(result.current.sums['food-drinks']).toBe(0);

    await act(async () => {
      staleCurrent.resolve([
        tx({
          id: 'stale',
          amount: 900,
          occurredAt: '2026-06-05T08:00:00.000Z',
          category: 'food-drinks',
        }),
      ]);
      stalePrevious.resolve([]);
      await Promise.all([staleCurrent.promise, stalePrevious.promise]);
    });

    expect(result.current.sums.shopping).toBe(700);
    expect(result.current.sums['food-drinks']).toBe(0);
  });

  it('ignores deferred cloud loads that resolve after unmount', async () => {
    const current = deferred<Transaction[]>();
    const previous = deferred<Transaction[]>();
    mocks.listCloudTransactionsForRange
      .mockReturnValueOnce(current.promise)
      .mockReturnValueOnce(previous.promise);

    const { unmount } = renderHook(() => useReports('2026-06'));

    expect(mocks.listCloudTransactionsForRange).toHaveBeenCalledTimes(2);

    unmount();

    await act(async () => {
      current.resolve([
        tx({
          id: 'after-unmount',
          amount: 1200,
          occurredAt: '2026-06-05T08:00:00.000Z',
          category: 'food-drinks',
        }),
      ]);
      previous.resolve([]);
      await Promise.all([current.promise, previous.promise]);
    });
  });
});
