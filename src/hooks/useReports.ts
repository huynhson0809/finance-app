import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBudgetForMonth } from '../db/budgets';
import {
  sumByCategory, dailyTotals, monthOverMonth, hints, status,
  type BudgetStatus,
} from '../reports';
import { monthRangeVietnamISO, prevMonth } from '../lib/date';
import { supabase } from '../supabase/client';
import { listCloudTransactionsForRange } from '../supabase/transactions';
import type { Budget, Category, Transaction } from '../types';

const SUPABASE_NOT_CONFIGURED = 'Supabase is not configured';

export interface UseReportsResult {
  loading: boolean;
  error: string | null;
  sums: Record<Category, number>;
  daily: Array<{ date: string; total: number }>;
  deltas: ReturnType<typeof monthOverMonth>;
  anomalyHints: ReturnType<typeof hints>;
  bStatus: { overall: BudgetStatus; perCategory: Record<Category, BudgetStatus>; overallSpent: number };
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
      setError(null);
      setLoading(false);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setCurr([]);
      setPrev([]);
      setBudget(undefined);
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

  const sums   = useMemo(() => sumByCategory(curr), [curr]);
  const daily  = useMemo(() => dailyTotals(curr, monthISO), [curr, monthISO]);
  const deltas = useMemo(() => monthOverMonth(curr, prev), [curr, prev]);
  const anomalyHints = useMemo(() => hints(deltas), [deltas]);
  const bStatus = useMemo(() => status(budget, sums), [budget, sums]);

  return { loading, error, sums, daily, deltas, anomalyHints, bStatus, reload };
}
