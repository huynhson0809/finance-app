import type { Transaction, Budget, CategoryRule, Setting } from '../types';

export interface BackupFile {
  app: 'finance-app';
  schemaVersion: 1;
  exportedAt: string;
  transactions: Transaction[];
  budgets: Budget[];
  categoryRules: CategoryRule[];
  settings: Setting[];
}
