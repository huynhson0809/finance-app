import { openFinanceDB } from './index';
import type { Budget, Category } from '../types';

export async function upsertBudget(
  month: string,
  total: number,
  caps: Partial<Record<Category, number>> = {},
): Promise<Budget> {
  const db = await openFinanceDB();
  const existing = await db.getFromIndex('budgets', 'byMonth', month);
  const budget: Budget = {
    id: existing?.id ?? crypto.randomUUID(),
    month, total, caps,
  };
  await db.put('budgets', budget);
  return budget;
}

export async function getBudgetForMonth(month: string): Promise<Budget | undefined> {
  const db = await openFinanceDB();
  return db.getFromIndex('budgets', 'byMonth', month);
}
