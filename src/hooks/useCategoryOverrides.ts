import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCategoryOverrides,
  upsertCategoryOverride,
} from '../db/category-overrides';
import type { BuiltInCategory, CategoryIconKey, CategoryOverride } from '../types';

interface CategoryOverridesState {
  overrides: CategoryOverride[];
  loading: boolean;
  error: string | null;
}

interface CategoryOverridesResult extends CategoryOverridesState {
  reload: () => Promise<void>;
  saveOverride: (
    category: BuiltInCategory,
    values: { name?: string; iconKey?: CategoryIconKey },
  ) => Promise<CategoryOverride>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useCategoryOverrides(): CategoryOverridesResult {
  const requestIdRef = useRef(0);
  const mutationVersionRef = useRef(0);
  const [state, setState] = useState<CategoryOverridesState>({
    overrides: [],
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const mutationVersion = mutationVersionRef.current;
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const overrides = await getCategoryOverrides();
      if (requestId !== requestIdRef.current || mutationVersion !== mutationVersionRef.current) return;
      setState({ overrides, loading: false, error: null });
    } catch (error) {
      if (requestId !== requestIdRef.current || mutationVersion !== mutationVersionRef.current) return;
      setState(prev => ({ ...prev, loading: false, error: errorMessage(error) }));
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const saveOverride = useCallback(async (
    category: BuiltInCategory,
    values: { name?: string; iconKey?: CategoryIconKey },
  ) => {
    requestIdRef.current += 1;
    mutationVersionRef.current += 1;
    try {
      const override = await upsertCategoryOverride(category, values);
      mutationVersionRef.current += 1;
      setState(prev => ({
        overrides: [
          ...prev.overrides.filter(item => item.category !== category),
          override,
        ],
        loading: false,
        error: null,
      }));
      return override;
    } catch (error) {
      mutationVersionRef.current += 1;
      setState(prev => ({ ...prev, loading: false, error: errorMessage(error) }));
      throw error;
    }
  }, []);

  return {
    ...state,
    reload,
    saveOverride,
  };
}

