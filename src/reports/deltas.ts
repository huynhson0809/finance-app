import type { Category, Transaction } from '../types';
import { CATEGORIES } from '../types';
import { sumByCategory } from './by-category';

export function monthOverMonth(curr: Transaction[], prev: Transaction[]):
  Record<Category, { curr: number; prev: number; deltaPct: number }> {
  const c = sumByCategory(curr);
  const p = sumByCategory(prev);
  const out = {} as Record<Category, { curr: number; prev: number; deltaPct: number }>;
  for (const cat of CATEGORIES) {
    const deltaPct = p[cat] > 0 ? (c[cat] - p[cat]) / p[cat] : 0;
    out[cat] = { curr: c[cat], prev: p[cat], deltaPct };
  }
  return out;
}
