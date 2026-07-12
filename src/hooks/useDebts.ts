import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase/client';
import {
  listCloudDebts,
  listCloudDebtPayments,
  insertCloudDebt,
  updateCloudDebt,
  deleteCloudDebt,
  insertCloudDebtPayment,
  deleteCloudDebtPayment,
} from '../supabase/debts';
import {
  spendlyQueryClient,
  spendlyQueryKeys,
  invalidateDebtQueries,
} from '../query/client';
import type { Debt, DebtPayment, DebtWithPayments, DebtInput, DebtPaymentInput } from '../debts/types';

const STALE_TIME = 5 * 60 * 1000;

export function useDebts() {
  const query = useQuery<Debt[], Error>({
    queryKey: spendlyQueryKeys.debts.list(),
    queryFn: async () => {
      if (!supabase) return [];
      return listCloudDebts(supabase);
    },
    staleTime: STALE_TIME,
  }, spendlyQueryClient);

  const addDebt = useCallback(async (input: DebtInput) => {
    if (!supabase) throw new Error('Supabase is not configured');
    await insertCloudDebt(supabase, input);
    await invalidateDebtQueries();
  }, []);

  const editDebt = useCallback(async (
    id: string,
    updates: Partial<Pick<Debt, 'personName' | 'totalAmount' | 'note' | 'settled'>>,
  ) => {
    if (!supabase) throw new Error('Supabase is not configured');
    await updateCloudDebt(supabase, id, updates);
    await invalidateDebtQueries();
  }, []);

  const removeDebt = useCallback(async (id: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    await deleteCloudDebt(supabase, id);
    await invalidateDebtQueries();
  }, []);

  return {
    debts: query.data ?? [],
    loading: query.isPending,
    error: query.error?.message ?? null,
    addDebt,
    editDebt,
    removeDebt,
  };
}

export function useDebtPayments(debtId: string | null) {
  const query = useQuery<DebtPayment[], Error>({
    queryKey: spendlyQueryKeys.debts.payments(debtId ?? ''),
    queryFn: async () => {
      if (!supabase || !debtId) return [];
      return listCloudDebtPayments(supabase, debtId);
    },
    enabled: !!debtId,
    staleTime: STALE_TIME,
  }, spendlyQueryClient);

  const addPayment = useCallback(async (input: DebtPaymentInput) => {
    if (!supabase) throw new Error('Supabase is not configured');
    await insertCloudDebtPayment(supabase, input);
    await invalidateDebtQueries();
  }, []);

  const removePayment = useCallback(async (id: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    await deleteCloudDebtPayment(supabase, id);
    await invalidateDebtQueries();
  }, []);

  return {
    payments: query.data ?? [],
    loading: query.isPending,
    error: query.error?.message ?? null,
    addPayment,
    removePayment,
  };
}

export function enrichDebtsWithPayments(
  debts: Debt[],
  paymentsMap: Map<string, DebtPayment[]>,
): DebtWithPayments[] {
  return debts.map(debt => {
    const payments = paymentsMap.get(debt.id) ?? [];
    const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    return {
      ...debt,
      payments,
      paidAmount,
      remainingAmount: Math.max(0, debt.totalAmount - paidAmount),
    };
  });
}
