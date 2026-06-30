import type { Category } from '../types';

type Deltas = Record<Category, { curr: number; prev: number; deltaPct: number }>;

export function hints(deltas: Deltas): Array<{ category: Category; deltaPct: number }> {
  const out: Array<{ category: Category; deltaPct: number }> = [];
  for (const cat of Object.keys(deltas) as Category[]) {
    const d = deltas[cat];
    if (d.prev > 0 && d.deltaPct > 0.25) out.push({ category: cat, deltaPct: d.deltaPct });
  }
  out.sort((a, b) => b.deltaPct - a.deltaPct);
  return out;
}
