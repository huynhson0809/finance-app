import { useCallback, useEffect, useRef, useState } from 'react';
import { yearRangeVietnamISO } from '../lib/date';
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
  const requestIdRef = useRef(0);
  const [state, setState] = useState({
    transactions: [] as Transaction[],
    loading: kind !== null,
    error: null as string | null,
  });

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (kind === null) {
      setState({ transactions: [], loading: false, error: null });
      return;
    }

    if (!supabase) {
      setState({ transactions: [], loading: false, error: SUPABASE_NOT_CONFIGURED });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const transactions = kind === 'all'
        ? await listCloudTransactions(supabase)
        : await listCloudTransactionsForRange(
          supabase,
          yearRangeVietnamISO(Number(monthISO.slice(0, 4))),
        );
      if (requestId !== requestIdRef.current) return;
      setState({ transactions, loading: false, error: null });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState({ transactions: [], loading: false, error: errorMessage(error) });
    }
  }, [kind, monthISO]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  return { ...state, reload };
}
