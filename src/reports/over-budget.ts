import type { Budget, Category } from '../types';
import { CATEGORIES, EXPENSE_CATEGORIES } from '../types';

export type BudgetStatus = 'ok' | 'warn' | 'over';
export type BudgetStatusReport = {
  overall: BudgetStatus;
  perCategory: Record<Category, BudgetStatus>;
  overallSpent: number;
  overallLimit: number;
};

function statusFor(spent: number, cap: number): BudgetStatus {
  if (cap <= 0) return 'ok';
  const ratio = spent / cap;
  if (ratio > 1) return 'over';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

export function spendableBudget(budget: Budget | undefined): number {
  if (!budget || budget.total <= 0) return 0;
  return Math.max(0, budget.total - (budget.savingsTarget ?? 0));
}

export function status(
  budget: Budget | undefined,
  sums: Record<Category, number>,
): BudgetStatusReport {
  const overallSpent = EXPENSE_CATEGORIES.reduce((sum, category) => sum + sums[category], 0);
  const overallLimit = spendableBudget(budget);
  const perCategory = {} as Record<Category, BudgetStatus>;
  for (const c of CATEGORIES) perCategory[c] = 'ok';
  for (const c of EXPENSE_CATEGORIES) {
    const cap = budget?.caps?.[c] ?? 0;
    perCategory[c] = cap > 0 ? statusFor(sums[c], cap) : 'ok';
  }
  const overall: BudgetStatus = overallLimit > 0
    ? statusFor(overallSpent, overallLimit)
    : 'ok';
  return { overall, perCategory, overallSpent, overallLimit };
}
