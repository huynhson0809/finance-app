import { mapTransactionRow, type CloudTransactionRow } from './mapper';
import type { AppSupabaseClient } from './client';
import type {
  BankHint,
  Category,
  ExpenseCategory,
  IncomeCategory,
  Transaction,
  TransactionDirection,
  TransactionSource,
} from '../types';

const TRANSACTION_COLUMNS = 'id,bank,type,amount,currency,transaction_time,content,direction,raw_source,merchant,category,note,bank_hint,asset_account_id,counterparty_asset_account_id,asset_event_id,created_at';

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
  eq(column: string, value: string): QueryBuilder;
  single(): PromiseLike<MutationResult>;
}

export interface QuerySelectBuilder {
  select(columns: string): QueryBuilder;
  insert(row: CloudTransactionInsert): InsertSelectBuilder;
  update(row: CloudTransactionUpdateRow): UpdateFilterBuilder;
  delete(): DeleteFilterBuilder;
}

export interface DeleteFilterBuilder {
  eq(column: string, value: string): PromiseLike<{ error: QueryError | null }>;
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

interface QueryClientInput {
  from(table: 'transactions'): unknown;
}

type Assert<T extends true> = T;
export type SupabaseClientQueryCompatibility = Assert<
  AppSupabaseClient['from'] extends QueryClientInput['from'] ? true : false
>;

interface UserTransactionInputBase {
  amount: number;
  currency: 'VND' | 'USD';
  occurredAt: string;
  merchant?: string;
  note?: string;
  source: Exclude<TransactionSource, 'bank-email'>;
  bankHint?: BankHint;
}

export type UserTransactionInput = UserTransactionInputBase & (
  | { direction: 'expense'; category: ExpenseCategory }
  | { direction: 'income'; category: IncomeCategory }
);

interface CloudTransactionInsert {
  bank: 'MB' | 'ACB' | null;
  type: 'manual' | 'receipt' | 'bank_screenshot';
  amount: number;
  currency: 'VND';
  transaction_time: string;
  content: string;
  direction: TransactionDirection;
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

interface CloudTransactionFullUpdateRow {
  amount: number;
  transaction_time: string;
  content: string;
  merchant: string | null;
  note: string | null;
  category: Category;
}

type CloudTransactionUpdateRow = CloudTransactionUpdate | CloudTransactionFullUpdateRow;

export interface CloudTransactionFullUpdate {
  amount: number;
  occurredAt: string;
  content: string;
  merchant: string | null;
  note: string | null;
  category: Category;
}

function mapResult({ data, error }: QueryResult): Transaction[] {
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapTransactionRow);
}

function transactionsTable(client: QueryClientInput): QuerySelectBuilder {
  return client.from('transactions') as QuerySelectBuilder;
}

export async function listCloudTransactions(
  client: QueryClientInput,
  opts: { limit?: number } = {},
): Promise<Transaction[]> {
  let query = transactionsTable(client)
    .select(TRANSACTION_COLUMNS);

  if (opts.limit !== undefined) {
    query = query.limit(opts.limit);
  }

  const result = await query.order('transaction_time', { ascending: false });
  return mapResult(result);
}

export async function listCloudTransactionsForRange(
  client: QueryClientInput,
  opts: { sinceISO: string; untilISO: string },
): Promise<Transaction[]> {
  const result = await transactionsTable(client)
    .select(TRANSACTION_COLUMNS)
    .gte('transaction_time', opts.sinceISO)
    .lt('transaction_time', opts.untilISO)
    .order('transaction_time', { ascending: false });

  return mapResult(result);
}

export async function addCloudTransaction(
  client: QueryClientInput,
  input: UserTransactionInput,
): Promise<Transaction> {
  const result = await transactionsTable(client)
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

export async function getCloudTransaction(
  client: QueryClientInput,
  id: string,
): Promise<Transaction> {
  const result = await transactionsTable(client)
    .select(TRANSACTION_COLUMNS)
    .eq('id', id)
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data) {
    throw new Error('No transaction returned');
  }

  return mapTransactionRow(result.data);
}

export async function updateCloudTransaction(
  client: QueryClientInput,
  id: string,
  input: CloudTransactionFullUpdate,
): Promise<Transaction> {
  const result = await transactionsTable(client)
    .update({
      amount: input.amount,
      transaction_time: input.occurredAt,
      content: input.content,
      merchant: input.merchant,
      note: input.note,
      category: input.category,
    })
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

export async function deleteCloudTransaction(
  client: QueryClientInput,
  id: string,
): Promise<void> {
  const result = await transactionsTable(client)
    .delete()
    .eq('id', id);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function updateCloudTransactionCategory(
  client: QueryClientInput,
  id: string,
  category: Category,
): Promise<Transaction> {
  const result = await transactionsTable(client)
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
    direction: input.direction,
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
