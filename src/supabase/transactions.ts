import { mapTransactionRow, type CloudTransactionRow } from './mapper';
import type { AppSupabaseClient } from './client';
import type { Transaction } from '../types';

const TRANSACTION_COLUMNS = 'id,bank,type,amount,currency,transaction_time,content,raw_source,created_at';

interface QueryError {
  message: string;
}

interface QueryResult {
  data: CloudTransactionRow[] | null;
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
}

export interface QueryClient {
  from(table: 'transactions'): QuerySelectBuilder;
}

type Assert<T extends true> = T;
export type SupabaseClientQueryCompatibility = Assert<
  AppSupabaseClient extends QueryClient ? true : false
>;

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
