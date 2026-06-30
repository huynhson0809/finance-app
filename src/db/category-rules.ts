import { openFinanceDB } from './index';
import type { CategoryRule } from '../types';

export async function getAllRules(): Promise<CategoryRule[]> {
  const db = await openFinanceDB();
  return db.getAll('categoryRules');
}

export async function upsertLearnedRule(rule: CategoryRule): Promise<void> {
  const db = await openFinanceDB();
  await db.put('categoryRules', rule);
}
