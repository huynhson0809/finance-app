import { useCallback, useEffect, useMemo, useState } from 'react';
import { listTransactions } from '../db/transactions';
import { getBudgetForMonth } from '../db/budgets';
import {
  sumByCategory, dailyTotals, monthOverMonth, hints, status,
  type BudgetStatus,
} from '../reports';
import { monthRangeISO, prevMonth } from '../lib/date';
import type { Budget, Category, Transaction } from '../types';

export interface UseReportsResult {
  loading: boolean;
  sums: Record<Category, number>;
  daily: Array<{ date: string; total: number }>;
  deltas: ReturnType<typeof monthOverMonth>;
  anomalyHints: ReturnType<typeof hints>;
  bStatus: { overall: BudgetStatus; perCategory: Record<Category, BudgetStatus>; overallSpent: number };
  reload: () => void;
}

export function useReports(monthISO: string): UseReportsResult {
  const [curr, setCurr] = useState<Transaction[]>([]);
  const [prev, setPrev] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<Budget | undefined>();
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    const { sinceISO: cSince, untilISO: cUntil } = monthRangeISO(monthISO);
    const { sinceISO: pSince, untilISO: pUntil } = monthRangeISO(prevMonth(monthISO));
    Promise.all([
      listTransactions({ sinceISO: cSince }).then(all => all.filter(t => t.occurredAt < cUntil)),
      listTransactions({ sinceISO: pSince }).then(all => all.filter(t => t.occurredAt < pUntil)),
      getBudgetForMonth(monthISO),
    ])
      .then(([c, p, b]) => { setCurr(c); setPrev(p); setBudget(b); })
      .catch(err => console.error('useReports load failed', err))
      .finally(() => setLoading(false));
  }, [monthISO]);

  useEffect(() => { reload(); }, [reload]);

  const sums   = useMemo(() => sumByCategory(curr), [curr]);
  const daily  = useMemo(() => dailyTotals(curr, monthISO), [curr, monthISO]);
  const deltas = useMemo(() => monthOverMonth(curr, prev), [curr, prev]);
  const anomalyHints = useMemo(() => hints(deltas), [deltas]);
  const bStatus = useMemo(() => status(budget, sums), [budget, sums]);

  return { loading, sums, daily, deltas, anomalyHints, bStatus, reload };
}
