import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createCustomCategory,
  deleteCustomCategory,
  getCustomCategories,
  renameCustomCategory,
  updateCustomCategoryIcon,
} from '../db/custom-categories';
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
      const categories = await getCustomCategories();
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
      const category = await createCustomCategory(direction, name, iconKey);
      mutationVersionRef.current += 1;
      setState(prev => ({
        categories: [...prev.categories, category],
        loading: false,
        error: null,
      }));
      return category;
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
      const category = await renameCustomCategory(id, name);
      mutationVersionRef.current += 1;
      setState(prev => ({
        categories: prev.categories.map(existing => existing.id === id ? category : existing),
        loading: false,
        error: null,
      }));
      return category;
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
      const category = await updateCustomCategoryIcon(id, iconKey);
      mutationVersionRef.current += 1;
      setState(prev => ({
        categories: prev.categories.map(existing => existing.id === id ? category : existing),
        loading: false,
        error: null,
      }));
      return category;
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
