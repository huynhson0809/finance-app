import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getCategoryOrder,
  replaceCategoryOrder,
} from '../db/category-order';
import {
  spendlyQueryClient,
  spendlyQueryKeys,
  spendlyStaleTimes,
} from '../query/client';
import { supabase } from '../supabase/client';
import {
  listCloudCategoryOrders,
  upsertCloudCategoryOrder,
} from '../supabase/categories';
import type { Category, CategoryOrder, TransactionDirection } from '../types';

interface CategoryOrderState {
  order: Category[];
  loading: boolean;
  error: string | null;
}

interface CategoryOrderResult extends CategoryOrderState {
  saveOrder: (categories: readonly Category[]) => Promise<CategoryOrder>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function currentOwnerKey(): Promise<string> {
  if (!supabase) return 'local';
  try {
    const result = await supabase.auth.getUser();
    if (result.error || !result.data.user) return 'local';
    return result.data.user.id;
  } catch (error) {
    console.warn('Failed to read Supabase user for category order owner', error);
    return 'local';
  }
}

function syncCategoryOrder(order: CategoryOrder): void {
  if (!supabase) return;
  void upsertCloudCategoryOrder(supabase, order).catch(error => {
    console.warn('Failed to sync category order to Supabase', error);
  });
}

async function loadCategoryOrder(direction: TransactionDirection): Promise<Category[]> {
  const ownerKey = await currentOwnerKey();
  const localOrder = await getCategoryOrder(ownerKey, direction);
  if (!supabase || ownerKey === 'local') return localOrder?.categories ?? [];

  try {
    const cloudOrder = (await listCloudCategoryOrders(supabase))
      .find(order => order.direction === direction) ?? null;
    const winner = timestamp(cloudOrder?.updatedAt) > timestamp(localOrder?.updatedAt)
      ? cloudOrder
      : localOrder;

    if (winner) {
      await replaceCategoryOrder(ownerKey, direction, winner.categories, winner.updatedAt);
      if (winner === localOrder && !cloudOrder) syncCategoryOrder(winner);
      return winner.categories;
    }

    return [];
  } catch (error) {
    console.warn('Failed to load category order from Supabase', error);
    return localOrder?.categories ?? [];
  }
}

export function useCategoryOrder(direction: TransactionDirection): CategoryOrderResult {
  const [actionError, setActionError] = useState<string | null>(null);
  const queryKey = spendlyQueryKeys.categories.order(direction);
  const query = useQuery<Category[], Error>({
    queryKey,
    queryFn: () => loadCategoryOrder(direction),
    staleTime: spendlyStaleTimes.categoryMetadata,
  }, spendlyQueryClient);

  const saveOrder = useCallback(async (categories: readonly Category[]) => {
    await spendlyQueryClient.cancelQueries({ queryKey });
    try {
      const ownerKey = await currentOwnerKey();
      const order = await replaceCategoryOrder(ownerKey, direction, categories);
      spendlyQueryClient.setQueryData<Category[]>(queryKey, order.categories);
      syncCategoryOrder(order);
      setActionError(null);
      return order;
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    }
  }, [direction, queryKey]);

  return {
    order: query.data ?? [],
    loading: query.isPending,
    error: actionError ?? (query.error ? errorMessage(query.error) : null),
    saveOrder,
  };
}
