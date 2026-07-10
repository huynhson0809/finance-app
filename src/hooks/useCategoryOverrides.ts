import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getCategoryOverrides,
  replaceCategoryOverrides,
  upsertCategoryOverride,
} from '../db/category-overrides';
import {
  spendlyQueryClient,
  spendlyQueryKeys,
  spendlyStaleTimes,
} from '../query/client';
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
  const mutationInFlightRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryKey = spendlyQueryKeys.categories.overrides();
  const query = useQuery<CategoryOverride[], Error>({
    queryKey,
    queryFn: loadCategoryOverrides,
    staleTime: spendlyStaleTimes.categoryMetadata,
  }, spendlyQueryClient);

  const reload = useCallback(async () => {
    if (mutationInFlightRef.current) return;
    setActionError(null);
    await query.refetch({ throwOnError: false });
  }, [query]);

  const saveOverride = useCallback(async (
    category: BuiltInCategory,
    values: { name?: string; iconKey?: CategoryIconKey },
  ) => {
    mutationInFlightRef.current = true;
    await spendlyQueryClient.cancelQueries({ queryKey });
    try {
      const localOverride = await upsertCategoryOverride(category, values);
      syncCategoryOverride(localOverride);
      spendlyQueryClient.setQueryData<CategoryOverride[]>(
        queryKey,
        existing => [
          ...(existing ?? []).filter(item => item.category !== category),
          localOverride,
        ],
      );
      setActionError(null);
      return localOverride;
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    } finally {
      mutationInFlightRef.current = false;
    }
  }, [queryKey]);

  return {
    overrides: query.data ?? [],
    loading: query.isPending,
    error: actionError ?? (query.error ? errorMessage(query.error) : null),
    reload,
    saveOverride,
  };
}
