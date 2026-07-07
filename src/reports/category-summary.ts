import {
  categoriesForDirection,
  categoryBelongsToDirection,
  type Category,
  type Transaction,
  type TransactionDirection,
} from '../types';
import { transactionDirection } from './direction';

export interface CategorySummary {
  category: Category;
  direction: TransactionDirection;
  total: number;
  percentage: number;
}

export function categorySummaries(
  transactions: Transaction[],
  direction: TransactionDirection,
): CategorySummary[] {
  const categories = categoriesForDirection(direction);
  const totals = new Map<Category, number>();

  for (const category of categories) {
    totals.set(category, 0);
  }

  for (const transaction of transactions) {
    if (transactionDirection(transaction) !== direction) continue;
    if (!categoryBelongsToDirection(transaction.category, direction)) continue;

    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
  }

  const directionTotal = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  if (directionTotal <= 0) return [];

  return categories
    .map(category => ({
      category,
      direction,
      total: totals.get(category) ?? 0,
      percentage: (totals.get(category) ?? 0) / directionTotal,
    }))
    .filter(summary => summary.total > 0);
}
