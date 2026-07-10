import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCategoryOverrides,
  replaceCategoryOverrides,
  upsertCategoryOverride,
} from '../db/category-overrides';
import { supabase } from '../supabase/client';
import {
  listCloudCategoryOverrides,
  upsertCloudCategoryOverride,
} from '../supabase/categories';
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

function syncCategoryOverride(override: CategoryOverride): void {
  if (!supabase) return;
  void upsertCloudCategoryOverride(supabase, override).catch(error => {
    console.warn('Failed to sync category override to Supabase', error);
  });
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeOverrides(localOverrides: CategoryOverride[], cloudOverrides: CategoryOverride[]): CategoryOverride[] {
  const byCategory = new Map<BuiltInCategory, CategoryOverride>();

  [...cloudOverrides, ...localOverrides].forEach(override => {
    const existing = byCategory.get(override.category);
    if (!existing || timestamp(override.updatedAt) >= timestamp(existing.updatedAt)) {
      byCategory.set(override.category, override);
    }
  });

  return [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category));
}

async function canUseCloudOverrides(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const result = await supabase.auth.getUser();
    if (result.error || !result.data.user) return false;
    return true;
  } catch (error) {
    console.warn('Failed to read Supabase user for category override sync', error);
    return false;
  }
}

async function loadCategoryOverrides(): Promise<CategoryOverride[]> {
  const localOverrides = await getCategoryOverrides();
  if (!supabase || !(await canUseCloudOverrides())) return localOverrides;

  try {
    const cloudOverrides = await listCloudCategoryOverrides(supabase);
    const overrides = mergeOverrides(localOverrides, cloudOverrides);
    if (overrides.length > 0) {
      await replaceCategoryOverrides(overrides);
      overrides.forEach(syncCategoryOverride);
    }
    return overrides;
  } catch (error) {
    console.warn('Failed to load category overrides from Supabase', error);
    return localOverrides;
  }
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
      const overrides = await loadCategoryOverrides();
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
      const localOverride = await upsertCategoryOverride(category, values);
      syncCategoryOverride(localOverride);
      mutationVersionRef.current += 1;
      setState(prev => ({
        overrides: [
          ...prev.overrides.filter(item => item.category !== category),
          localOverride,
        ],
        loading: false,
        error: null,
      }));
      return localOverride;
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
