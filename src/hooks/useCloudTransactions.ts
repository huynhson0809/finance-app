import { useCallback, useEffect, useRef, useState } from 'react';
import { monthRangeVietnamISO } from '../lib/date';
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
  load: () => Promise<Transaction[]>,
): CloudTransactionsResult {
  const requestIdRef = useRef(0);
  const [state, setState] = useState<CloudTransactionsState>({
    data: [],
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!supabase) {
      setState({ data: [], loading: false, error: SUPABASE_NOT_CONFIGURED });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await load();
      if (requestId !== requestIdRef.current) return;
      setState({ data, loading: false, error: null });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState({ data: [], loading: false, error: errorMessage(error) });
    }
  }, [load]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  return { ...state, reload };
}

export function useRecentCloudTransactions(limit = 5): CloudTransactionsResult {
  const load = useCallback(async () => {
    if (!supabase) return [];
    return listCloudTransactions(supabase, { limit });
  }, [limit]);

  return useCloudTransactionQuery(load);
}

export function useMonthCloudTransactions(monthISO: string): CloudTransactionsResult {
  const load = useCallback(async () => {
    if (!supabase) return [];
    return listCloudTransactionsForRange(supabase, monthRangeVietnamISO(monthISO));
  }, [monthISO]);

  return useCloudTransactionQuery(load);
}
