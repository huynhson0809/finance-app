import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { monthRangeVietnamISO } from '../lib/date';
import {
  spendlyQueryClient,
  spendlyQueryKeys,
  spendlyStaleTimes,
} from '../query/client';
import { supabase } from '../supabase/client';
import {
  listCloudTransactions,
  listCloudTransactionsForRange,
} from '../supabase/transactions';
import type { Transaction } from '../types';

const SUPABASE_NOT_CONFIGURED = 'Supabase is not configured';

interface CloudTransactionsState {
  data: Transaction[];
  loading: boolean;
  error: string | null;
}

interface CloudTransactionsResult extends CloudTransactionsState {
  reload: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useCloudTransactionQuery(
  opts: {
    queryKey: readonly unknown[];
    staleTime: number;
    load: () => Promise<Transaction[]>;
  },
): CloudTransactionsResult {
  const query = useQuery<Transaction[], Error>({
    queryKey: opts.queryKey,
    queryFn: async () => {
      if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED);
      return opts.load();
    },
    staleTime: opts.staleTime,
  }, spendlyQueryClient);

  const reload = useCallback(async () => {
    await query.refetch({ throwOnError: false });
  }, [query]);

  return {
    data: query.data ?? [],
    loading: query.isPending,
    error: query.error ? errorMessage(query.error) : null,
    reload,
  };
}

export function useRecentCloudTransactions(limit = 5): CloudTransactionsResult {
  const load = useCallback(async () => {
    if (!supabase) return [];
    return listCloudTransactions(supabase, { limit });
  }, [limit]);

  return useCloudTransactionQuery({
    queryKey: spendlyQueryKeys.transactions.recent(limit),
    staleTime: spendlyStaleTimes.recentTransactions,
    load,
  });
}

export function useMonthCloudTransactions(monthISO: string): CloudTransactionsResult {
  const range = monthRangeVietnamISO(monthISO);
  const load = useCallback(async () => {
    if (!supabase) return [];
    return listCloudTransactionsForRange(supabase, range);
  }, [range]);

  return useCloudTransactionQuery({
    queryKey: spendlyQueryKeys.transactions.range(range.sinceISO, range.untilISO),
    staleTime: spendlyStaleTimes.monthTransactions,
    load,
  });
}
