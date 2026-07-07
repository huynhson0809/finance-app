import { openFinanceDB } from './index';
import { isSameDay } from '../lib/date';
import type { Transaction } from '../types';

function newId() { return crypto.randomUUID(); }
function now()   { return new Date().toISOString(); }

type GeneratedTransactionFields = 'id' | 'createdAt' | 'updatedAt';
type AddExpenseTransactionInput = Omit<
  Extract<Transaction, { direction: 'expense' }>,
  GeneratedTransactionFields
>;
type AddIncomeTransactionInput = Omit<
  Extract<Transaction, { direction: 'income' }>,
  GeneratedTransactionFields
>;

export type AddTransactionInput = AddExpenseTransactionInput | AddIncomeTransactionInput;
type LegacyExpenseTransactionInput = Omit<AddExpenseTransactionInput, 'direction'> & {
  direction?: 'expense';
};

function normalizeTransactionInput(
  input: AddTransactionInput | LegacyExpenseTransactionInput,
): AddTransactionInput {
  if (input.direction === 'income') return input;
  return { ...input, direction: 'expense' };
}

export async function addTransaction(
  input: AddTransactionInput | LegacyExpenseTransactionInput,
): Promise<Transaction> {
  const db = await openFinanceDB();
  const timestamp = now();
  const normalized = normalizeTransactionInput(input);
  const t: Transaction = { ...normalized, id: newId(), createdAt: timestamp, updatedAt: timestamp };
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
  return all
    .filter(t => t.direction !== 'income' && isSameDay(t.occurredAt, today))
    .reduce((s, t) => s + t.amount, 0);
}
