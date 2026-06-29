import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { Transaction, Budget, CategoryRule, Setting } from '../types';

export interface FinanceSchema extends DBSchema {
  transactions: { key: string; value: Transaction; indexes: { byOccurredAt: string } };
  budgets:      { key: string; value: Budget;      indexes: { byMonth: string } };
  categoryRules:{ key: string; value: CategoryRule };
  settings:     { key: string; value: Setting };
}

let dbPromise: Promise<IDBPDatabase<FinanceSchema>> | null = null;

export function openFinanceDB(): Promise<IDBPDatabase<FinanceSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<FinanceSchema>('finance-app', 1, {
      upgrade(db) {
        const tx = db.createObjectStore('transactions', { keyPath: 'id' });
        tx.createIndex('byOccurredAt', 'occurredAt');
        const bg = db.createObjectStore('budgets', { keyPath: 'id' });
        bg.createIndex('byMonth', 'month', { unique: true });
        db.createObjectStore('categoryRules', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function __resetDBForTests() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}
