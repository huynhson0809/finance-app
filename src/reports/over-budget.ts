import type { Budget, Category } from '../types';
import { CATEGORIES, EXPENSE_CATEGORIES } from '../types';

export type BudgetStatus = 'ok' | 'warn' | 'over';

function statusFor(spent: number, cap: number): BudgetStatus {
  if (cap <= 0) return 'ok';
  const ratio = spent / cap;
  if (ratio > 1) return 'over';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

export function status(
  budget: Budget | undefined,
  sums: Record<Category, number>,
): { overall: BudgetStatus; perCategory: Record<Category, BudgetStatus>; overallSpent: number } {
  const overallSpent = EXPENSE_CATEGORIES.reduce((sum, category) => sum + sums[category], 0);
  const perCategory = {} as Record<Category, BudgetStatus>;
  for (const c of CATEGORIES) perCategory[c] = 'ok';
  for (const c of EXPENSE_CATEGORIES) {
    const cap = budget?.caps?.[c] ?? 0;
    perCategory[c] = cap > 0 ? statusFor(sums[c], cap) : 'ok';
  }
  const overall: BudgetStatus = budget && budget.total > 0
    ? statusFor(overallSpent, budget.total)
    : 'ok';
  return { overall, perCategory, overallSpent };
}
