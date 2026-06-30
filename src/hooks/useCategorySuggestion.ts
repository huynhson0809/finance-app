import { useCallback, useEffect, useMemo, useState } from 'react';
import { classify, SEED_RULES } from '../categorizer';
import { getAllRules } from '../db/category-rules';
import type { Category, CategoryRule } from '../types';

export function useCategorySuggestion(merchant: string): {
  suggestion: Category | null;
  refresh: () => void;
} {
  const [learned, setLearned] = useState<CategoryRule[]>([]);
  const [debouncedMerchant, setDebouncedMerchant] = useState(merchant);

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
  const suggestion = useMemo(() => {
    try {
      return classify(debouncedMerchant, rules)?.category ?? null;
    } catch (err) {
      console.error('useCategorySuggestion: classify threw', err);
      return null;
    }
  }, [debouncedMerchant, rules]);

  return { suggestion, refresh };
}
