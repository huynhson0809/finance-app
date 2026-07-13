import { QueryClient } from "@tanstack/react-query";
import type { Transaction } from "../types";

const ONE_MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * ONE_MINUTE;

export const ASSET_STALE_TIME_MS = 5 * 60 * 1000;

export const assetQueryKeys = {
  root: ["assets"] as const,
  accounts: ["assets", "accounts"] as const,
  rates: ["assets", "rates"] as const,
  eventsRoot: ["assets", "events"] as const,
  events: (accountId?: string) =>
    ["assets", "events", accountId ?? "all"] as const,
  summary: ["assets", "summary"] as const,
};

export const spendlyQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 30 * ONE_MINUTE,
      retry: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
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
    root: ["transactions"] as const,
    recent: (limit: number) => ["transactions", "recent", limit] as const,
    range: (sinceISO: string, untilISO: string) =>
      ["transactions", "range", sinceISO, untilISO] as const,
    all: () => ["transactions", "all"] as const,
  },
  budgets: {
    root: ["budgets"] as const,
    month: (monthISO: string) => ["budgets", "month", monthISO] as const,
  },
  categories: {
    root: ["categories"] as const,
    custom: () => ["categories", "custom"] as const,
    overrides: () => ["categories", "overrides"] as const,
    order: (direction: string) => ["categories", "order", direction] as const,
  },
  assets: assetQueryKeys,
  debts: {
    root: ["debts"] as const,
    list: () => ["debts", "list"] as const,
    payments: (debtId: string) => ["debts", "payments", debtId] as const,
  },
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
  spendlyQueryClient.removeQueries({
    queryKey: spendlyQueryKeys.transactions.root,
    type: "inactive",
  });
  await spendlyQueryClient.invalidateQueries({
    queryKey: spendlyQueryKeys.transactions.root,
    refetchType: "active",
  });
}

export async function invalidateAssetQueries(): Promise<void> {
  const changedKeys = [
    assetQueryKeys.accounts,
    assetQueryKeys.eventsRoot,
    assetQueryKeys.summary,
  ];

  changedKeys.forEach((queryKey) => {
    spendlyQueryClient.removeQueries({ queryKey, type: "inactive" });
  });

  await Promise.all([
    spendlyQueryClient.invalidateQueries({
      queryKey: assetQueryKeys.accounts,
      refetchType: "active",
    }),
    spendlyQueryClient.invalidateQueries({
      queryKey: assetQueryKeys.eventsRoot,
      refetchType: "active",
    }),
  ]);
  await spendlyQueryClient.invalidateQueries({
    queryKey: assetQueryKeys.summary,
    refetchType: "active",
  });
}

export function clearSpendlyQueryCache(): void {
  spendlyQueryClient.clear();
}

export async function invalidateDebtQueries(): Promise<void> {
  spendlyQueryClient.removeQueries({
    queryKey: spendlyQueryKeys.debts.root,
    type: "inactive",
  });
  await spendlyQueryClient.invalidateQueries({
    queryKey: spendlyQueryKeys.debts.root,
    refetchType: "active",
  });
}

export function clearSpendlyQueryCacheForTests(): void {
  clearSpendlyQueryCache();
}
