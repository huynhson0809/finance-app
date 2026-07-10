import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createCustomCategory,
  deleteCustomCategory,
  getCustomCategories,
  replaceCustomCategories,
  renameCustomCategory,
  updateCustomCategoryIcon,
} from '../db/custom-categories';
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
  const requestIdRef = useRef(0);
  const mutationVersionRef = useRef(0);
  const [state, setState] = useState<CustomCategoriesState>({
    categories: [],
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const mutationVersion = mutationVersionRef.current;
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const categories = await loadCustomCategories();
      if (
        requestId !== requestIdRef.current ||
        mutationVersion !== mutationVersionRef.current
      ) return;
      setState({ categories, loading: false, error: null });
    } catch (error) {
      if (
        requestId !== requestIdRef.current ||
        mutationVersion !== mutationVersionRef.current
      ) return;
      setState(prev => ({ ...prev, loading: false, error: errorMessage(error) }));
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const addCategory = useCallback(async (
    direction: TransactionDirection,
    name: string,
    iconKey?: CategoryIconKey,
  ) => {
    requestIdRef.current += 1;
    mutationVersionRef.current += 1;
    try {
      const localCategory = await createCustomCategory(direction, name, iconKey);
      syncCustomCategory(localCategory);
      mutationVersionRef.current += 1;
      setState(prev => ({
        categories: [...prev.categories, localCategory],
        loading: false,
        error: null,
      }));
      return localCategory;
    } catch (error) {
      mutationVersionRef.current += 1;
      setState(prev => ({ ...prev, loading: false, error: errorMessage(error) }));
      throw error;
    }
  }, []);

  const renameCategory = useCallback(async (id: CustomCategoryId, name: string) => {
    requestIdRef.current += 1;
    mutationVersionRef.current += 1;
    try {
      const localCategory = await renameCustomCategory(id, name);
      syncCustomCategory(localCategory);
      mutationVersionRef.current += 1;
      setState(prev => ({
        categories: prev.categories.map(existing => existing.id === id ? localCategory : existing),
        loading: false,
        error: null,
      }));
      return localCategory;
    } catch (error) {
      mutationVersionRef.current += 1;
      setState(prev => ({ ...prev, loading: false, error: errorMessage(error) }));
      throw error;
    }
  }, []);

  const updateCategoryIcon = useCallback(async (id: CustomCategoryId, iconKey: CategoryIconKey) => {
    requestIdRef.current += 1;
    mutationVersionRef.current += 1;
    try {
      const localCategory = await updateCustomCategoryIcon(id, iconKey);
      syncCustomCategory(localCategory);
      mutationVersionRef.current += 1;
      setState(prev => ({
        categories: prev.categories.map(existing => existing.id === id ? localCategory : existing),
        loading: false,
        error: null,
      }));
      return localCategory;
    } catch (error) {
      mutationVersionRef.current += 1;
      setState(prev => ({ ...prev, loading: false, error: errorMessage(error) }));
      throw error;
    }
  }, []);

  const deleteCategory = useCallback(async (id: CustomCategoryId) => {
    requestIdRef.current += 1;
    mutationVersionRef.current += 1;
    try {
      await deleteCustomCategory(id);
      removeCloudCustomCategory(id);
      mutationVersionRef.current += 1;
      setState(prev => ({
        categories: prev.categories.filter(category => category.id !== id),
        loading: false,
        error: null,
      }));
    } catch (error) {
      mutationVersionRef.current += 1;
      setState(prev => ({ ...prev, loading: false, error: errorMessage(error) }));
      throw error;
    }
  }, []);

  return {
    ...state,
    reload,
    addCategory,
    renameCategory,
    updateCategoryIcon,
    deleteCategory,
  };
}
