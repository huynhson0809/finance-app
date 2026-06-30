import { openFinanceDB } from '../db';
import type { BackupFile } from './types';

export async function exportBackup(): Promise<BackupFile> {
  const db = await openFinanceDB();
  const [transactions, budgets, categoryRules, settings] = await Promise.all([
    db.getAll('transactions'),
    db.getAll('budgets'),
    db.getAll('categoryRules'),
    db.getAll('settings'),
  ]);
  return {
    app: 'finance-app',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    transactions,
    budgets,
    categoryRules,
    settings,
  };
}
