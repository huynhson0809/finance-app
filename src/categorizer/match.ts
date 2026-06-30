import type { Category, CategoryRule } from '../types';
import { normalizeMerchant } from './normalize';

const LEARNED_BONUS = 100;

export function classify(
  merchant: string,
  rules: CategoryRule[],
): { category: Category; ruleId: string } | null {
  if (!merchant.trim()) return null;
  const norm = normalizeMerchant(merchant);
  const candidates = rules.filter(r => norm.includes(r.pattern));
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const r of candidates.slice(1)) {
    if (compare(r, best) > 0) best = r;
  }
  return { category: best.category, ruleId: best.id };
}

function compare(a: CategoryRule, b: CategoryRule): number {
  const sa = a.weight + (a.learned ? LEARNED_BONUS : 0);
  const sb = b.weight + (b.learned ? LEARNED_BONUS : 0);
  if (sa !== sb) return sa - sb;
  if (a.learned && b.learned) return a.createdAt.localeCompare(b.createdAt);
  return 0;
}
