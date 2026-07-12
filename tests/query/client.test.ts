import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assetQueryKeys,
  clearSpendlyQueryCacheForTests,
  invalidateAssetQueries,
  invalidateTransactionQueries,
  spendlyQueryClient,
  spendlyQueryKeys,
} from '../../src/query/client';

beforeEach(() => {
  clearSpendlyQueryCacheForTests();
});

describe('query invalidation', () => {
  it('refetches inactive Home and Calendar transaction queries after a mutation', async () => {
    const recentKey = spendlyQueryKeys.transactions.recent(5);
    const monthKey = spendlyQueryKeys.transactions.range(
      '2026-07-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    );
    const recentQuery = vi.fn()
      .mockResolvedValueOnce(['recent-before'])
      .mockResolvedValueOnce(['recent-after']);
    const monthQuery = vi.fn()
      .mockResolvedValueOnce(['month-before'])
      .mockResolvedValueOnce(['month-after']);
    const historicalQuery = vi.fn().mockResolvedValue(['historical']);
    const categoryQuery = vi.fn().mockResolvedValue(['categories']);

    await spendlyQueryClient.fetchQuery({ queryKey: recentKey, queryFn: recentQuery });
    await spendlyQueryClient.fetchQuery({ queryKey: monthKey, queryFn: monthQuery });
    await spendlyQueryClient.fetchQuery({
      queryKey: spendlyQueryKeys.transactions.all(),
      queryFn: historicalQuery,
    });
    await spendlyQueryClient.fetchQuery({
      queryKey: spendlyQueryKeys.categories.custom(),
      queryFn: categoryQuery,
    });

    await invalidateTransactionQueries();

    expect(recentQuery).toHaveBeenCalledTimes(1);
    expect(monthQuery).toHaveBeenCalledTimes(1);
    expect(historicalQuery).toHaveBeenCalledTimes(1);
    expect(categoryQuery).toHaveBeenCalledTimes(1);
    expect(spendlyQueryClient.getQueryData(recentKey)).toBeUndefined();
    expect(spendlyQueryClient.getQueryData(monthKey)).toBeUndefined();
    expect(
      spendlyQueryClient.getQueryData(spendlyQueryKeys.transactions.all()),
    ).toBeUndefined();

    await spendlyQueryClient.fetchQuery({ queryKey: recentKey, queryFn: recentQuery });
    await spendlyQueryClient.fetchQuery({ queryKey: monthKey, queryFn: monthQuery });

    expect(recentQuery).toHaveBeenCalledTimes(2);
    expect(monthQuery).toHaveBeenCalledTimes(2);
    expect(spendlyQueryClient.getQueryData(recentKey)).toEqual(['recent-after']);
    expect(spendlyQueryClient.getQueryData(monthKey)).toEqual(['month-after']);
  });

  it('reloads inactive asset summary dependencies without refetching rates twice', async () => {
    const accountsQuery = vi.fn()
      .mockResolvedValueOnce(['account-before'])
      .mockResolvedValueOnce(['account-after']);
    const ratesQuery = vi.fn().mockResolvedValue(['rate']);
    const summaryQuery = vi.fn(async () => {
      const [accounts, rates] = await Promise.all([
        spendlyQueryClient.fetchQuery({
          queryKey: assetQueryKeys.accounts,
          queryFn: accountsQuery,
          staleTime: 5 * 60 * 1000,
        }),
        spendlyQueryClient.fetchQuery({
          queryKey: assetQueryKeys.rates,
          queryFn: ratesQuery,
          staleTime: 5 * 60 * 1000,
        }),
      ]);
      return { accounts, rates };
    });
    const eventsQuery = vi.fn().mockResolvedValue(['event']);
    const transactionQuery = vi.fn().mockResolvedValue(['transaction']);

    await spendlyQueryClient.fetchQuery({
      queryKey: assetQueryKeys.summary,
      queryFn: summaryQuery,
    });
    await spendlyQueryClient.fetchQuery({
      queryKey: assetQueryKeys.events('account-1'),
      queryFn: eventsQuery,
    });
    await spendlyQueryClient.fetchQuery({
      queryKey: spendlyQueryKeys.transactions.recent(5),
      queryFn: transactionQuery,
    });

    await invalidateAssetQueries();

    expect(accountsQuery).toHaveBeenCalledTimes(1);
    expect(ratesQuery).toHaveBeenCalledTimes(1);
    expect(summaryQuery).toHaveBeenCalledTimes(1);
    expect(eventsQuery).toHaveBeenCalledTimes(1);
    expect(transactionQuery).toHaveBeenCalledTimes(1);
    expect(spendlyQueryClient.getQueryData(assetQueryKeys.accounts)).toBeUndefined();
    expect(spendlyQueryClient.getQueryData(assetQueryKeys.summary)).toBeUndefined();
    expect(
      spendlyQueryClient.getQueryData(assetQueryKeys.events('account-1')),
    ).toBeUndefined();
    expect(spendlyQueryClient.getQueryData(assetQueryKeys.rates)).toEqual(['rate']);

    await spendlyQueryClient.fetchQuery({
      queryKey: assetQueryKeys.summary,
      queryFn: summaryQuery,
    });

    expect(accountsQuery).toHaveBeenCalledTimes(2);
    expect(ratesQuery).toHaveBeenCalledTimes(1);
    expect(summaryQuery).toHaveBeenCalledTimes(2);
    expect(spendlyQueryClient.getQueryData(assetQueryKeys.summary)).toEqual({
      accounts: ['account-after'],
      rates: ['rate'],
    });
  });
});
