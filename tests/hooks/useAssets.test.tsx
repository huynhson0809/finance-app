import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetAccount, AssetEvent, AssetRate, AssetSummary } from '../../src/assets/types';
import type { Transaction } from '../../src/types';

const mocks = vi.hoisted(() => ({
  supabase: {} as unknown,
  listCloudAssetAccounts: vi.fn(),
  listCloudAssetRates: vi.fn(),
  listCloudAssetEvents: vi.fn(),
  getCustomCategories: vi.fn(),
  listCloudTransactions: vi.fn(),
  listCloudTransactionsForRange: vi.fn(),
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock('../../src/supabase/assets', () => ({
  listCloudAssetAccounts: mocks.listCloudAssetAccounts,
  listCloudAssetRates: mocks.listCloudAssetRates,
  listCloudAssetEvents: mocks.listCloudAssetEvents,
}));

vi.mock('../../src/db/custom-categories', () => ({
  getCustomCategories: mocks.getCustomCategories,
}));

vi.mock('../../src/supabase/transactions', () => ({
  listCloudTransactions: mocks.listCloudTransactions,
  listCloudTransactionsForRange: mocks.listCloudTransactionsForRange,
}));

import {
  useAssetAccounts,
  useAssetEvents,
  useAssetRates,
  useAssetSummary,
} from '../../src/hooks/useAssets';
import {
  assetQueryKeys,
  clearSpendlyQueryCacheForTests,
  invalidateAssetQueries,
  spendlyQueryClient,
  spendlyQueryKeys,
} from '../../src/query/client';

function account(overrides: Partial<AssetAccount> = {}): AssetAccount {
  return {
    id: 'account-1',
    userId: 'user-1',
    kind: 'bank',
    name: 'Main bank',
    currency: 'VND',
    balance: 1_000_000,
    includeInTotal: true,
    sortOrder: 0,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

function rate(overrides: Partial<AssetRate> = {}): AssetRate {
  return {
    id: 'rate-1',
    userId: 'user-1',
    pair: 'USD_VND',
    value: 25_000,
    source: 'manual',
    fetchedAt: '2026-07-11T00:00:00.000Z',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

function event(overrides: Partial<AssetEvent> = {}): AssetEvent {
  return {
    id: 'event-1',
    userId: 'user-1',
    accountId: 'account-1',
    type: 'opening_balance',
    amount: 1_000_000,
    currency: 'VND',
    balanceAfter: 1_000_000,
    occurredAt: '2026-07-11T00:00:00.000Z',
    createdAt: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    amount: 50_000,
    currency: 'VND',
    occurredAt: '2026-07-11T00:00:00.000Z',
    category: 'others',
    source: 'manual',
    ...overrides,
  };
}

function zeroSummary(): AssetSummary {
  return {
    totalAssetsVnd: 0,
    liquidVnd: 0,
    savingsVnd: 0,
    liabilityVnd: 0,
    byAccount: [],
  };
}

beforeEach(() => {
  clearSpendlyQueryCacheForTests();
  mocks.supabase = {};
  mocks.listCloudAssetAccounts.mockReset();
  mocks.listCloudAssetRates.mockReset();
  mocks.listCloudAssetEvents.mockReset();
  mocks.getCustomCategories.mockReset();
  mocks.listCloudTransactions.mockReset();
  mocks.listCloudTransactionsForRange.mockReset();
});

describe('useAssets', () => {
  it('reuses cached accounts when switching screens and remounting', async () => {
    const accounts = [account()];
    mocks.listCloudAssetAccounts.mockResolvedValue(accounts);

    const first = renderHook(() => useAssetAccounts());
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useAssetAccounts());
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(second.result.current.data).toBe(accounts);
    expect(mocks.listCloudAssetAccounts).toHaveBeenCalledWith(mocks.supabase);
    expect(mocks.listCloudAssetAccounts).toHaveBeenCalledTimes(1);
  });

  it('summary recomputes from cached accounts and rates without refetching categories or transactions', async () => {
    const accounts = [
      account({ id: 'cash-1', kind: 'cash', balance: 100_000 }),
      account({ id: 'usd-1', kind: 'foreign_currency', currency: 'USD', balance: 10 }),
    ];
    const transactionsKey = spendlyQueryKeys.transactions.recent(5);
    const categoriesKey = spendlyQueryKeys.categories.custom();
    const transactions = [tx()];
    const categories = [{ id: 'custom-expense-cafe', direction: 'expense', name: 'Cafe' }];
    spendlyQueryClient.setQueryData(assetQueryKeys.accounts, accounts);
    spendlyQueryClient.setQueryData(assetQueryKeys.rates, [rate({ value: 25_000 })]);
    spendlyQueryClient.setQueryData(transactionsKey, transactions);
    spendlyQueryClient.setQueryData(categoriesKey, categories);

    const { result } = renderHook(() => useAssetSummary());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.totalAssetsVnd).toBe(350_000);

    spendlyQueryClient.setQueryData(assetQueryKeys.rates, [rate({ value: 26_000 })]);
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.data?.totalAssetsVnd).toBe(360_000));
    expect(mocks.listCloudAssetAccounts).not.toHaveBeenCalled();
    expect(mocks.listCloudAssetRates).not.toHaveBeenCalled();
    expect(mocks.getCustomCategories).not.toHaveBeenCalled();
    expect(mocks.listCloudTransactions).not.toHaveBeenCalled();
    expect(mocks.listCloudTransactionsForRange).not.toHaveBeenCalled();
    expect(spendlyQueryClient.getQueryData(transactionsKey)).toBe(transactions);
    expect(spendlyQueryClient.getQueryData(categoriesKey)).toBe(categories);
  });

  it('invalidates only asset query keys', async () => {
    const accounts = [account()];
    const rates = [rate()];
    const events = [event()];
    const summary = zeroSummary();
    const transactionKey = spendlyQueryKeys.transactions.recent(5);
    const categoryKey = spendlyQueryKeys.categories.custom();
    spendlyQueryClient.setQueryData(assetQueryKeys.accounts, accounts);
    spendlyQueryClient.setQueryData(assetQueryKeys.rates, rates);
    spendlyQueryClient.setQueryData(assetQueryKeys.events('account-1'), events);
    spendlyQueryClient.setQueryData(assetQueryKeys.summary, summary);
    spendlyQueryClient.setQueryData(transactionKey, [tx()]);
    spendlyQueryClient.setQueryData(categoryKey, [{ id: 'custom-expense-cafe' }]);

    await invalidateAssetQueries();

    expect(spendlyQueryClient.getQueryState(assetQueryKeys.accounts)?.isInvalidated).toBe(true);
    expect(spendlyQueryClient.getQueryState(assetQueryKeys.rates)?.isInvalidated).toBe(true);
    expect(spendlyQueryClient.getQueryState(assetQueryKeys.events('account-1'))?.isInvalidated).toBe(true);
    expect(spendlyQueryClient.getQueryState(assetQueryKeys.summary)?.isInvalidated).toBe(true);
    expect(spendlyQueryClient.getQueryState(transactionKey)?.isInvalidated).toBe(false);
    expect(spendlyQueryClient.getQueryState(categoryKey)?.isInvalidated).toBe(false);
    expect(spendlyQueryClient.getQueryData(transactionKey)).toEqual([tx()]);
    expect(spendlyQueryClient.getQueryData(categoryKey)).toEqual([{ id: 'custom-expense-cafe' }]);
  });

  it('returns empty arrays and a zero summary without Supabase', async () => {
    mocks.supabase = null;

    const { result } = renderHook(() => ({
      accounts: useAssetAccounts(),
      rates: useAssetRates(),
      events: useAssetEvents('account-1'),
      summary: useAssetSummary(),
    }));

    await waitFor(() => expect(result.current.accounts.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.rates.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.events.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.summary.isSuccess).toBe(true));

    expect(result.current.accounts.data).toEqual([]);
    expect(result.current.rates.data).toEqual([]);
    expect(result.current.events.data).toEqual([]);
    expect(result.current.summary.data).toEqual(zeroSummary());
    expect(result.current.accounts.error).toBeNull();
    expect(result.current.rates.error).toBeNull();
    expect(result.current.events.error).toBeNull();
    expect(result.current.summary.error).toBeNull();
    expect(mocks.listCloudAssetAccounts).not.toHaveBeenCalled();
    expect(mocks.listCloudAssetRates).not.toHaveBeenCalled();
    expect(mocks.listCloudAssetEvents).not.toHaveBeenCalled();
  });
});
