import type { Category, Transaction } from '../types';
import { CATEGORIES, EXPENSE_CATEGORIES } from '../types';
import { sumByCategory } from './by-category';

export function monthOverMonth(curr: Transaction[], prev: Transaction[]):
  Record<Category, { curr: number; prev: number; deltaPct: number }> {
  const c = sumByCategory(curr);
  const p = sumByCategory(prev);
  const out = {} as Record<Category, { curr: number; prev: number; deltaPct: number }>;
  for (const cat of CATEGORIES) {
    out[cat] = { curr: 0, prev: 0, deltaPct: 0 };
  }
  for (const cat of EXPENSE_CATEGORIES) {
    const deltaPct = p[cat] > 0 ? (c[cat] - p[cat]) / p[cat] : 0;
    out[cat] = { curr: c[cat], prev: p[cat], deltaPct };
  }
  return out;
}
