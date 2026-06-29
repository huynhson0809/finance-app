import { openFinanceDB } from './index';
import { isSameDay } from '../lib/date';
import type { Transaction } from '../types';

function newId() { return crypto.randomUUID(); }
function now()   { return new Date().toISOString(); }

export async function addTransaction(
  input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Transaction> {
  const db = await openFinanceDB();
  const t: Transaction = { ...input, id: newId(), createdAt: now(), updatedAt: now() };
  await db.put('transactions', t);
  return t;
}

export async function listTransactions(
  opts: { sinceISO?: string; limit?: number } = {},
): Promise<Transaction[]> {
  const db = await openFinanceDB();
  const all = await db.getAllFromIndex('transactions', 'byOccurredAt');
  let out = all.reverse(); // newest first
  if (opts.sinceISO) out = out.filter(t => t.occurredAt >= opts.sinceISO!);
  if (opts.limit != null) out = out.slice(0, opts.limit);
  return out;
}

export async function getTodayTotal(): Promise<number> {
  const today = new Date().toISOString();
  const all = await listTransactions();
  return all.filter(t => isSameDay(t.occurredAt, today)).reduce((s, t) => s + t.amount, 0);
}
