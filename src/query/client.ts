import { QueryClient } from '@tanstack/react-query';
import type { Transaction } from '../types';

const ONE_MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * ONE_MINUTE;

export const ASSET_STALE_TIME_MS = 5 * 60 * 1000;

export const assetQueryKeys = {
  accounts: ['assets', 'accounts'] as const,
  rates: ['assets', 'rates'] as const,
  events: (accountId?: string) => ['assets', 'events', accountId ?? 'all'] as const,
  summary: ['assets', 'summary'] as const,
};

export const spendlyQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 30 * ONE_MINUTE,
      retry: false,
      refetchOnMount: false,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

export const spendlyStaleTimes = {
  recentTransactions: ONE_MINUTE,
  monthTransactions: ONE_MINUTE,
  historicalTransactions: 24 * 60 * ONE_MINUTE,
  reportTransactions: FIVE_MINUTES,
  categoryMetadata: 30 * ONE_MINUTE,
};

export const spendlyQueryKeys = {
  transactions: {
    root: ['transactions'] as const,
    recent: (limit: number) => ['transactions', 'recent', limit] as const,
    range: (sinceISO: string, untilISO: string) => ['transactions', 'range', sinceISO, untilISO] as const,
    all: () => ['transactions', 'all'] as const,
  },
  budgets: {
    root: ['budgets'] as const,
    month: (monthISO: string) => ['budgets', 'month', monthISO] as const,
  },
  categories: {
    root: ['categories'] as const,
    custom: () => ['categories', 'custom'] as const,
    overrides: () => ['categories', 'overrides'] as const,
    order: (direction: string) => ['categories', 'order', direction] as const,
  },
  assets: assetQueryKeys,
};

export function setCachedTransactionsForRange(
  sinceISO: string,
  untilISO: string,
  transactions: Transaction[],
): void {
  spendlyQueryClient.setQueryData(
    spendlyQueryKeys.transactions.range(sinceISO, untilISO),
    transactions,
  );
}

export async function invalidateTransactionQueries(): Promise<void> {
  await spendlyQueryClient.invalidateQueries({
    queryKey: spendlyQueryKeys.transactions.root,
  });
}

export async function invalidateAssetQueries(): Promise<void> {
  await spendlyQueryClient.invalidateQueries({ queryKey: ['assets'] });
}

export function clearSpendlyQueryCacheForTests(): void {
  spendlyQueryClient.clear();
}
