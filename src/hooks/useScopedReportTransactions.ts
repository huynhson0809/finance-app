import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { yearRangeVietnamISO } from '../lib/date';
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

export type ScopedReportKind = 'year' | 'all' | null;

interface ScopedReportTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useScopedReportTransactions(
  kind: ScopedReportKind,
  monthISO: string,
): ScopedReportTransactionsResult {
  const year = Number(monthISO.slice(0, 4));
  const range = useMemo(() => yearRangeVietnamISO(year), [year]);
  const client = supabase;
  const queryKey = kind === 'all'
    ? spendlyQueryKeys.transactions.all()
    : kind === 'year'
      ? spendlyQueryKeys.transactions.range(range.sinceISO, range.untilISO)
      : spendlyQueryKeys.transactions.root;

  const query = useQuery<Transaction[], Error>({
    queryKey,
    queryFn: async () => {
      if (!client) throw new Error(SUPABASE_NOT_CONFIGURED);
      return kind === 'all'
        ? listCloudTransactions(client)
        : listCloudTransactionsForRange(client, range);
    },
    enabled: Boolean(kind && client),
    staleTime: spendlyStaleTimes.historicalTransactions,
  }, spendlyQueryClient);

  const reload = useCallback(async () => {
    if (!kind || !client) return;
    await query.refetch({ throwOnError: false });
  }, [client, kind, query]);

  return {
    transactions: kind && client ? query.data ?? [] : [],
    loading: Boolean(kind && client && query.isPending),
    error: kind && !client
      ? SUPABASE_NOT_CONFIGURED
      : query.error
        ? errorMessage(query.error)
        : null,
    reload,
  };
}
