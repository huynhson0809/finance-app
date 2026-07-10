import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createCustomCategory,
  deleteCustomCategory,
  getCustomCategories,
  replaceCustomCategories,
  renameCustomCategory,
  updateCustomCategoryIcon,
} from '../db/custom-categories';
import {
  spendlyQueryClient,
  spendlyQueryKeys,
  spendlyStaleTimes,
} from '../query/client';
import { supabase } from '../supabase/client';
import {
  deleteCloudCustomCategory,
  listCloudCustomCategories,
  upsertCloudCustomCategory,
} from '../supabase/categories';
import type {
  CategoryIconKey,
  CustomExpenseCategory,
  CustomIncomeCategory,
  TransactionDirection,
  UserCategory,
} from '../types';

type CustomCategoryId = CustomExpenseCategory | CustomIncomeCategory;

interface CustomCategoriesState {
  categories: UserCategory[];
  loading: boolean;
  error: string | null;
}

interface CustomCategoriesResult extends CustomCategoriesState {
  reload: () => Promise<void>;
  addCategory: (
    direction: TransactionDirection,
    name: string,
    iconKey?: CategoryIconKey,
  ) => Promise<UserCategory>;
  renameCategory: (id: CustomCategoryId, name: string) => Promise<UserCategory>;
  updateCategoryIcon: (id: CustomCategoryId, iconKey: CategoryIconKey) => Promise<UserCategory>;
  deleteCategory: (id: CustomCategoryId) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function syncCustomCategory(category: UserCategory): void {
  if (!supabase) return;
  void upsertCloudCustomCategory(supabase, category).catch(error => {
    console.warn('Failed to sync category to Supabase', error);
  });
}

function removeCloudCustomCategory(id: CustomCategoryId): void {
  if (!supabase) return;
  void deleteCloudCustomCategory(supabase, id).catch(error => {
    console.warn('Failed to delete category from Supabase', error);
  });
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeCategories(localCategories: UserCategory[], cloudCategories: UserCategory[]): UserCategory[] {
  const byId = new Map<CustomCategoryId, UserCategory>();

  [...cloudCategories, ...localCategories].forEach(category => {
    const existing = byId.get(category.id);
    if (!existing || timestamp(category.updatedAt) >= timestamp(existing.updatedAt)) {
      byId.set(category.id, category);
    }
  });

  return [...byId.values()].sort((a, b) => (
    timestamp(a.createdAt) - timestamp(b.createdAt) || a.name.localeCompare(b.name)
  ));
}

async function canUseCloudCategories(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const result = await supabase.auth.getUser();
    if (result.error || !result.data.user) return false;
    return true;
  } catch (error) {
    console.warn('Failed to read Supabase user for category sync', error);
    return false;
  }
}

async function loadCustomCategories(): Promise<UserCategory[]> {
  const localCategories = await getCustomCategories();
  if (!supabase || !(await canUseCloudCategories())) return localCategories;

  try {
    const cloudCategories = await listCloudCustomCategories(supabase);
    const categories = mergeCategories(localCategories, cloudCategories);
    if (categories.length > 0) {
      await replaceCustomCategories(categories);
      categories.forEach(syncCustomCategory);
    }
    return categories;
  } catch (error) {
    console.warn('Failed to load categories from Supabase', error);
    return localCategories;
  }
}

export function useCustomCategories(): CustomCategoriesResult {
  const mutationInFlightRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryKey = spendlyQueryKeys.categories.custom();
  const query = useQuery<UserCategory[], Error>({
    queryKey,
    queryFn: loadCustomCategories,
    staleTime: spendlyStaleTimes.categoryMetadata,
  }, spendlyQueryClient);

  const reload = useCallback(async () => {
    if (mutationInFlightRef.current) return;
    setActionError(null);
    await query.refetch({ throwOnError: false });
  }, [query]);

  const addCategory = useCallback(async (
    direction: TransactionDirection,
    name: string,
    iconKey?: CategoryIconKey,
  ) => {
    mutationInFlightRef.current = true;
    await spendlyQueryClient.cancelQueries({ queryKey });
    try {
      const localCategory = await createCustomCategory(direction, name, iconKey);
      syncCustomCategory(localCategory);
      spendlyQueryClient.setQueryData<UserCategory[]>(
        queryKey,
        existing => [...(existing ?? []), localCategory],
      );
      setActionError(null);
      return localCategory;
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    } finally {
      mutationInFlightRef.current = false;
    }
  }, [queryKey]);

  const renameCategory = useCallback(async (id: CustomCategoryId, name: string) => {
    mutationInFlightRef.current = true;
    await spendlyQueryClient.cancelQueries({ queryKey });
    try {
      const localCategory = await renameCustomCategory(id, name);
      syncCustomCategory(localCategory);
      spendlyQueryClient.setQueryData<UserCategory[]>(
        queryKey,
        existing => (existing ?? []).map(category => (
          category.id === id ? localCategory : category
        )),
      );
      setActionError(null);
      return localCategory;
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    } finally {
      mutationInFlightRef.current = false;
    }
  }, [queryKey]);

  const updateCategoryIcon = useCallback(async (id: CustomCategoryId, iconKey: CategoryIconKey) => {
    mutationInFlightRef.current = true;
    await spendlyQueryClient.cancelQueries({ queryKey });
    try {
      const localCategory = await updateCustomCategoryIcon(id, iconKey);
      syncCustomCategory(localCategory);
      spendlyQueryClient.setQueryData<UserCategory[]>(
        queryKey,
        existing => (existing ?? []).map(category => (
          category.id === id ? localCategory : category
        )),
      );
      setActionError(null);
      return localCategory;
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    } finally {
      mutationInFlightRef.current = false;
    }
  }, [queryKey]);

  const deleteCategory = useCallback(async (id: CustomCategoryId) => {
    mutationInFlightRef.current = true;
    await spendlyQueryClient.cancelQueries({ queryKey });
    try {
      await deleteCustomCategory(id);
      removeCloudCustomCategory(id);
      spendlyQueryClient.setQueryData<UserCategory[]>(
        queryKey,
        existing => (existing ?? []).filter(category => category.id !== id),
      );
      setActionError(null);
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    } finally {
      mutationInFlightRef.current = false;
    }
  }, [queryKey]);

  return {
    categories: query.data ?? [],
    loading: query.isPending,
    error: actionError ?? (query.error ? errorMessage(query.error) : null),
    reload,
    addCategory,
    renameCategory,
    updateCategoryIcon,
    deleteCategory,
  };
}
