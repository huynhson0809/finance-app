import { mapTransactionRow, type CloudTransactionRow } from './mapper';
import type { AppSupabaseClient } from './client';
import type { BankHint, Category, Transaction, TransactionSource } from '../types';

const TRANSACTION_COLUMNS = 'id,bank,type,amount,currency,transaction_time,content,raw_source,merchant,category,note,bank_hint,created_at';

interface QueryError {
  message: string;
}

interface QueryResult {
  data: CloudTransactionRow[] | null;
  error: QueryError | null;
}

interface MutationResult {
  data: CloudTransactionRow | null;
  error: QueryError | null;
}

export interface QueryBuilder extends PromiseLike<QueryResult> {
  limit(count: number): QueryBuilder;
  order(column: string, opts: { ascending: boolean }): QueryBuilder;
  gte(column: string, value: string): QueryBuilder;
  lt(column: string, value: string): QueryBuilder;
}

export interface QuerySelectBuilder {
  select(columns: string): QueryBuilder;
  insert(row: CloudTransactionInsert): InsertSelectBuilder;
  update(row: CloudTransactionUpdate): UpdateFilterBuilder;
}

export interface InsertSelectBuilder {
  select(columns: string): InsertSingleBuilder;
}

export interface InsertSingleBuilder {
  single(): PromiseLike<MutationResult>;
}

export interface UpdateFilterBuilder {
  eq(column: string, value: string): UpdateSelectBuilder;
}

export interface UpdateSelectBuilder {
  select(columns: string): InsertSingleBuilder;
}

export interface QueryClient {
  from(table: 'transactions'): QuerySelectBuilder;
}

type Assert<T extends true> = T;
export type SupabaseClientQueryCompatibility = Assert<
  AppSupabaseClient extends QueryClient ? true : false
>;

export interface UserTransactionInput {
  amount: number;
  currency: 'VND';
  occurredAt: string;
  merchant?: string;
  category: Category;
  note?: string;
  source: Exclude<TransactionSource, 'bank-email'>;
  bankHint?: BankHint;
}

interface CloudTransactionInsert {
  bank: 'MB' | 'ACB' | null;
  type: 'manual' | 'receipt' | 'bank_screenshot';
  amount: number;
  currency: 'VND';
  transaction_time: string;
  content: string;
  raw_source: 'manual' | 'receipt' | 'bank-screenshot';
  merchant: string | null;
  category: Category;
  note: string | null;
  bank_hint: BankHint | null;
  external_hash: string;
}

export interface CloudTransactionUpdate {
  category: Category;
}

function mapResult({ data, error }: QueryResult): Transaction[] {
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapTransactionRow);
}

export async function listCloudTransactions(
  client: QueryClient,
  opts: { limit?: number } = {},
): Promise<Transaction[]> {
  let query = client
    .from('transactions')
    .select(TRANSACTION_COLUMNS);

  if (opts.limit !== undefined) {
    query = query.limit(opts.limit);
  }

  const result = await query.order('transaction_time', { ascending: false });
  return mapResult(result);
}

export async function listCloudTransactionsForRange(
  client: QueryClient,
  opts: { sinceISO: string; untilISO: string },
): Promise<Transaction[]> {
  const result = await client
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .gte('transaction_time', opts.sinceISO)
    .lt('transaction_time', opts.untilISO)
    .order('transaction_time', { ascending: false });

  return mapResult(result);
}

export async function addCloudTransaction(
  client: QueryClient,
  input: UserTransactionInput,
): Promise<Transaction> {
  const result = await client
    .from('transactions')
    .insert(toInsertRow(input))
    .select(TRANSACTION_COLUMNS)
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data) {
    throw new Error('No inserted transaction returned');
  }

  return mapTransactionRow(result.data);
}

export async function updateCloudTransactionCategory(
  client: QueryClient,
  id: string,
  category: Category,
): Promise<Transaction> {
  const result = await client
    .from('transactions')
    .update({ category })
    .eq('id', id)
    .select(TRANSACTION_COLUMNS)
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data) {
    throw new Error('No updated transaction returned');
  }

  return mapTransactionRow(result.data);
}

function toInsertRow(input: UserTransactionInput): CloudTransactionInsert {
  const merchant = input.merchant?.trim() || null;
  const note = input.note?.trim() || null;
  return {
    bank: bankFromHint(input.bankHint),
    type: input.source === 'bank-screenshot' ? 'bank_screenshot' : input.source,
    amount: input.amount,
    currency: 'VND',
    transaction_time: input.occurredAt,
    content: merchant ?? note ?? input.category,
    raw_source: input.source,
    merchant,
    category: input.category,
    note,
    bank_hint: input.bankHint ?? null,
    external_hash: `${input.source}:${crypto.randomUUID()}`,
  };
}

function bankFromHint(bankHint: BankHint | undefined): 'MB' | 'ACB' | null {
  if (bankHint === 'mb') return 'MB';
  if (bankHint === 'acb') return 'ACB';
  return null;
}
