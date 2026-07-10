import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monthRangeVietnamISO } from '../../src/lib/date';
import type { Transaction } from '../../src/types';

const mocks = vi.hoisted(() => ({
  supabase: {} as unknown,
  listCloudTransactions: vi.fn(),
  listCloudTransactionsForRange: vi.fn(),
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock('../../src/supabase/transactions', () => ({
  listCloudTransactions: mocks.listCloudTransactions,
  listCloudTransactionsForRange: mocks.listCloudTransactionsForRange,
}));

import {
  useMonthCloudTransactions,
  useRecentCloudTransactions,
} from '../../src/hooks/useCloudTransactions';
import { clearSpendlyQueryCacheForTests } from '../../src/query/client';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    amount: 1000,
    currency: 'VND',
    occurredAt: '2026-06-15T08:00:00.000Z',
    category: 'others',
    source: 'bank-email',
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

beforeEach(() => {
  clearSpendlyQueryCacheForTests();
  mocks.supabase = {};
  mocks.listCloudTransactions.mockReset();
  mocks.listCloudTransactionsForRange.mockReset();
});

describe('useCloudTransactions', () => {
  it('loads recent cloud transactions with the requested limit', async () => {
    const rows = [tx({ id: 'recent-1' })];
    mocks.listCloudTransactions.mockResolvedValue(rows);

    const { result } = renderHook(() => useRecentCloudTransactions(3));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mocks.listCloudTransactions).toHaveBeenCalledWith(mocks.supabase, { limit: 3 });
    expect(result.current.data).toBe(rows);
    expect(result.current.error).toBeNull();
  });

  it('returns a setup error when Supabase is not configured', async () => {
    mocks.supabase = null;

    const { result } = renderHook(() => useRecentCloudTransactions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe('Supabase is not configured');
    expect(mocks.listCloudTransactions).not.toHaveBeenCalled();
  });

  it('surfaces failed recent loads as string errors', async () => {
    mocks.listCloudTransactions.mockRejectedValue(new Error('cloud failed'));

    const { result } = renderHook(() => useRecentCloudTransactions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe('cloud failed');
  });

  it('reload triggers a new recent load', async () => {
    mocks.listCloudTransactions
      .mockResolvedValueOnce([tx({ id: 'initial' })])
      .mockResolvedValueOnce([tx({ id: 'reloaded' })]);

    const { result } = renderHook(() => useRecentCloudTransactions(5));

    await waitFor(() => expect(result.current.data[0]?.id).toBe('initial'));

    await act(async () => {
      await result.current.reload();
    });

    expect(mocks.listCloudTransactions).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.data[0]?.id).toBe('reloaded'));
  });

  it('deduplicates pending reloads for the same recent query', async () => {
    const pending = deferred<Transaction[]>();
    mocks.listCloudTransactions.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useRecentCloudTransactions());
    expect(result.current.loading).toBe(true);

    act(() => {
      void result.current.reload();
    });
    expect(mocks.listCloudTransactions).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve([tx({ id: 'deduped' })]);
      await pending.promise;
    });

    await waitFor(() => expect(result.current.data[0]?.id).toBe('deduped'));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('ignores deferred recent loads that resolve after unmount', async () => {
    const pending = deferred<Transaction[]>();
    mocks.listCloudTransactions.mockReturnValue(pending.promise);

    const { unmount } = renderHook(() => useRecentCloudTransactions());

    unmount();

    await act(async () => {
      pending.resolve([tx({ id: 'after-unmount' })]);
      await pending.promise;
    });
  });

  it('loads monthly cloud transactions for the month range', async () => {
    const rows = [tx({ id: 'month-1' })];
    mocks.listCloudTransactionsForRange.mockResolvedValue(rows);

    const { result } = renderHook(() => useMonthCloudTransactions('2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mocks.listCloudTransactionsForRange).toHaveBeenCalledWith(
      mocks.supabase,
      monthRangeVietnamISO('2026-06'),
    );
    expect(result.current.data).toBe(rows);
    expect(result.current.error).toBeNull();
  });

  it('deduplicates simultaneous monthly loads for the same month', async () => {
    const rows = [tx({ id: 'shared-month' })];
    mocks.listCloudTransactionsForRange.mockResolvedValue(rows);

    const { result } = renderHook(() => ({
      first: useMonthCloudTransactions('2026-06'),
      second: useMonthCloudTransactions('2026-06'),
    }));

    await waitFor(() => expect(result.current.first.loading).toBe(false));
    await waitFor(() => expect(result.current.second.loading).toBe(false));

    expect(mocks.listCloudTransactionsForRange).toHaveBeenCalledTimes(1);
    expect(result.current.first.data).toBe(rows);
    expect(result.current.second.data).toBe(rows);
  });
});
