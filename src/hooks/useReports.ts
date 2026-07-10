import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBudgetForMonth } from '../db/budgets';
import {
  sumByCategory, dailyTotals, monthOverMonth, hints, status,
  totalsByDirection,
  type DirectionTotals,
} from '../reports';
import type { BudgetStatusReport } from '../reports/over-budget';
import { monthRangeVietnamISO, prevMonth } from '../lib/date';
import {
  spendlyQueryClient,
  spendlyQueryKeys,
  spendlyStaleTimes,
} from '../query/client';
import { supabase } from '../supabase/client';
import { listCloudTransactionsForRange } from '../supabase/transactions';
import type { Budget, Category, Transaction } from '../types';

const SUPABASE_NOT_CONFIGURED = 'Supabase is not configured';
const EMPTY_TRANSACTIONS: Transaction[] = [];

export interface UseReportsResult {
  loading: boolean;
  error: string | null;
  transactions: Transaction[];
  sums: Record<Category, number>;
  daily: Array<{ date: string; total: number }>;
  deltas: ReturnType<typeof monthOverMonth>;
  directionTotals: DirectionTotals;
  anomalyHints: ReturnType<typeof hints>;
  bStatus: BudgetStatusReport;
  reload: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useReports(monthISO: string): UseReportsResult {
  const client = supabase;
  const currentRange = useMemo(() => monthRangeVietnamISO(monthISO), [monthISO]);
  const previousMonthISO = prevMonth(monthISO);
  const previousRange = useMemo(() => monthRangeVietnamISO(previousMonthISO), [previousMonthISO]);

  const currentQuery = useQuery<Transaction[], Error>({
    queryKey: spendlyQueryKeys.transactions.range(currentRange.sinceISO, currentRange.untilISO),
    queryFn: async () => {
      if (!client) throw new Error(SUPABASE_NOT_CONFIGURED);
      return listCloudTransactionsForRange(client, currentRange);
    },
    enabled: Boolean(client),
    staleTime: spendlyStaleTimes.reportTransactions,
  }, spendlyQueryClient);

  const previousQuery = useQuery<Transaction[], Error>({
    queryKey: spendlyQueryKeys.transactions.range(previousRange.sinceISO, previousRange.untilISO),
    queryFn: async () => {
      if (!client) throw new Error(SUPABASE_NOT_CONFIGURED);
      return listCloudTransactionsForRange(client, previousRange);
    },
    enabled: Boolean(client),
    staleTime: spendlyStaleTimes.reportTransactions,
  }, spendlyQueryClient);

  const budgetQuery = useQuery<Budget | null, Error>({
    queryKey: spendlyQueryKeys.budgets.month(monthISO),
    queryFn: async () => (await getBudgetForMonth(monthISO)) ?? null,
    staleTime: spendlyStaleTimes.reportTransactions,
  }, spendlyQueryClient);

  const reload = useCallback(async () => {
    await Promise.all([
      client
        ? currentQuery.refetch({ throwOnError: false })
        : Promise.resolve(),
      client
        ? previousQuery.refetch({ throwOnError: false })
        : Promise.resolve(),
      budgetQuery.refetch({ throwOnError: false }),
    ]);
  }, [budgetQuery, client, currentQuery, previousQuery]);

  const reportTransactions = currentQuery.data ?? EMPTY_TRANSACTIONS;
  const previousTransactions = previousQuery.data ?? EMPTY_TRANSACTIONS;
  const reportBudget = budgetQuery.data ?? undefined;
  const cloudError = currentQuery.error ?? previousQuery.error;
  const loading = (
    budgetQuery.isPending ||
    (Boolean(client) && (currentQuery.isPending || previousQuery.isPending))
  );
  const error = !client
    ? SUPABASE_NOT_CONFIGURED
    : cloudError
      ? errorMessage(cloudError)
      : budgetQuery.error
        ? errorMessage(budgetQuery.error)
        : null;

  const sums   = useMemo(() => sumByCategory(reportTransactions), [reportTransactions]);
  const daily  = useMemo(() => dailyTotals(reportTransactions, monthISO), [reportTransactions, monthISO]);
  const deltas = useMemo(() => monthOverMonth(reportTransactions, previousTransactions), [reportTransactions, previousTransactions]);
  const directionTotals = useMemo(() => totalsByDirection(reportTransactions), [reportTransactions]);
  const anomalyHints = useMemo(() => hints(deltas), [deltas]);
  const bStatus = useMemo(() => status(reportBudget, sums), [reportBudget, sums]);

  return {
    loading,
    error,
    transactions: reportTransactions,
    sums,
    daily,
    deltas,
    directionTotals,
    anomalyHints,
    bStatus,
    reload,
  };
}
