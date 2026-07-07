import type { Category, Transaction } from '../types';
import { CATEGORIES } from '../types';
import { isExpenseLike } from './compat';

export function sumByCategory(tx: Transaction[]): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) out[c] = 0;
  for (const t of tx) {
    if (!isExpenseLike(t)) continue;
    out[t.category] += t.amount;
  }
  return out;
}
