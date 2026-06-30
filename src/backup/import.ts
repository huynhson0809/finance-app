import { openFinanceDB } from '../db';
import { setSetting } from '../db/settings';
import type { BackupFile } from './types';

export async function importBackup(input: File | Blob | string): Promise<void> {
  const text = typeof input === 'string' ? input : await input.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('invalid backup: not JSON');
  }
  if (!isBackupFile(parsed)) throw new Error('invalid backup: wrong shape or schemaVersion');

  const data = parsed;
  const db = await openFinanceDB();
  const tx = db.transaction(
    ['transactions', 'budgets', 'categoryRules', 'settings'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('transactions').clear(),
    tx.objectStore('budgets').clear(),
    tx.objectStore('categoryRules').clear(),
    tx.objectStore('settings').clear(),
  ]);
  for (const t of data.transactions) await tx.objectStore('transactions').put(t);
  for (const b of data.budgets) await tx.objectStore('budgets').put(b);
  for (const r of data.categoryRules) await tx.objectStore('categoryRules').put(r);
  for (const s of data.settings) await tx.objectStore('settings').put(s);
  await tx.done;

  await setSetting('lastBackupAt', data.exportedAt);
}

function isBackupFile(x: unknown): x is BackupFile {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.app === 'finance-app' &&
    o.schemaVersion === 1 &&
    typeof o.exportedAt === 'string' &&
    Array.isArray(o.transactions) &&
    Array.isArray(o.budgets) &&
    Array.isArray(o.categoryRules) &&
    Array.isArray(o.settings)
  );
}
