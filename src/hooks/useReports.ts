import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBudgetForMonth } from '../db/budgets';
import {
  sumByCategory, dailyTotals, monthOverMonth, hints, status,
  totalsByDirection,
  type DirectionTotals,
} from '../reports';
import type { BudgetStatusReport } from '../reports/over-budget';
import { monthRangeVietnamISO, prevMonth } from '../lib/date';
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
  const requestIdRef = useRef(0);
  const [curr, setCurr] = useState<Transaction[]>([]);
  const [prev, setPrev] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<Budget | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    const currentRange = monthRangeVietnamISO(monthISO);
    const previousRange = monthRangeVietnamISO(prevMonth(monthISO));
    const budgetPromise = getBudgetForMonth(monthISO);
    const client = supabase;

    try {
      if (!client) {
        const b = await budgetPromise;
        if (requestId !== requestIdRef.current) return;
        setCurr([]);
        setPrev([]);
        setBudget(b);
        setLoadedMonth(monthISO);
        setError(SUPABASE_NOT_CONFIGURED);
        setLoading(false);
        return;
      }

      const [c, p, b] = await Promise.all([
        listCloudTransactionsForRange(client, currentRange),
        listCloudTransactionsForRange(client, previousRange),
        budgetPromise,
      ]);

      if (requestId !== requestIdRef.current) return;
      setCurr(c);
      setPrev(p);
      setBudget(b);
      setLoadedMonth(monthISO);
      setError(null);
      setLoading(false);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setCurr([]);
      setPrev([]);
      setBudget(undefined);
      setLoadedMonth(monthISO);
      setError(errorMessage(err));
      setLoading(false);
    }
  }, [monthISO]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const staleMonth = loadedMonth !== monthISO;
  const reportTransactions = staleMonth ? EMPTY_TRANSACTIONS : curr;
  const previousTransactions = staleMonth ? EMPTY_TRANSACTIONS : prev;
  const reportBudget = staleMonth ? undefined : budget;

  const sums   = useMemo(() => sumByCategory(reportTransactions), [reportTransactions]);
  const daily  = useMemo(() => dailyTotals(reportTransactions, monthISO), [reportTransactions, monthISO]);
  const deltas = useMemo(() => monthOverMonth(reportTransactions, previousTransactions), [reportTransactions, previousTransactions]);
  const directionTotals = useMemo(() => totalsByDirection(reportTransactions), [reportTransactions]);
  const anomalyHints = useMemo(() => hints(deltas), [deltas]);
  const bStatus = useMemo(() => status(reportBudget, sums), [reportBudget, sums]);

  return {
    loading: loading || staleMonth,
    error: staleMonth ? null : error,
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
