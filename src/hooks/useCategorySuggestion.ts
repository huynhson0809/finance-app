import { useCallback, useEffect, useMemo, useState } from 'react';
import { classify, SEED_RULES } from '../categorizer';
import { getAllRules } from '../db/category-rules';
import {
  categoryBelongsToDirection,
  type Category,
  type CategoryRule,
  type TransactionDirection,
} from '../types';
import {
  suggestCloudCategory,
  type CloudCategorySuggestionOption,
} from '../supabase/category-suggestions';

interface UseCategorySuggestionOptions {
  direction?: TransactionDirection;
  categories?: readonly CloudCategorySuggestionOption[];
  enableAi?: boolean;
}

const EMPTY_CATEGORY_OPTIONS: readonly CloudCategorySuggestionOption[] = [];

export function useCategorySuggestion(merchant: string, options: UseCategorySuggestionOptions = {}): {
  suggestion: Category | null;
  refresh: () => void;
} {
  const [learned, setLearned] = useState<CategoryRule[]>([]);
  const [debouncedMerchant, setDebouncedMerchant] = useState(merchant);
  const [aiSuggestion, setAiSuggestion] = useState<Category | null>(null);

  const refresh = useCallback(() => {
    getAllRules()
      .then(setLearned)
      .catch(err => console.error('useCategorySuggestion: failed to load rules', err));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedMerchant(merchant), 150);
    return () => clearTimeout(id);
  }, [merchant]);

  const rules = useMemo(() => [...SEED_RULES, ...learned], [learned]);
  const ruleSuggestion = useMemo(() => {
    try {
      return classify(debouncedMerchant, rules)?.category ?? null;
    } catch (err) {
      console.error('useCategorySuggestion: classify threw', err);
      return null;
    }
  }, [debouncedMerchant, rules]);

  const categories = options.categories ?? EMPTY_CATEGORY_OPTIONS;
  const direction = options.direction;
  const enableAi = options.enableAi ?? true;

  useEffect(() => {
    let cancelled = false;
    setAiSuggestion(null);

    const text = debouncedMerchant.trim();
    if (!enableAi || !direction || text.length < 2 || categories.length === 0) {
      return () => { cancelled = true; };
    }

    const id = setTimeout(() => {
      void suggestCloudCategory({ text, direction, categories })
        .then(category => {
          if (cancelled) return;
          setAiSuggestion(
            category && categoryBelongsToDirection(category, direction)
              ? category
              : null,
          );
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [categories, debouncedMerchant, direction, enableAi]);

  const suggestion = aiSuggestion ?? ruleSuggestion;

  return { suggestion, refresh };
}
