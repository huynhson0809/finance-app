import { describe, expect, it } from 'vitest';
import {
  addCloudTransaction,
  type QueryClient,
  listCloudTransactions,
  listCloudTransactionsForRange,
  updateCloudTransactionCategory,
} from '../../src/supabase/transactions';
import type { CloudTransactionRow } from '../../src/supabase/mapper';

const SELECT_COLUMNS = 'id,bank,type,amount,currency,transaction_time,content,raw_source,merchant,category,note,bank_hint,created_at';

interface QueryCall {
  method: string;
  args: unknown[];
}

interface MockResult {
  data: CloudTransactionRow[] | null;
  error: { message: string } | null;
}

function createClient(result: MockResult) {
  const calls: QueryCall[] = [];
  let insertedRow: unknown;
  let updatedRow: unknown;
  const query = {
    limit(count: number) {
      calls.push({ method: 'limit', args: [count] });
      return query;
    },
    order(column: string, opts: { ascending: boolean }) {
      calls.push({ method: 'order', args: [column, opts] });
      return query;
    },
    gte(column: string, value: string) {
      calls.push({ method: 'gte', args: [column, value] });
      return query;
    },
    lt(column: string, value: string) {
      calls.push({ method: 'lt', args: [column, value] });
      return query;
    },
    then<TResult1 = MockResult, TResult2 = never>(
      onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };
  const fromStage = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] });
      return query;
    },
    insert(row: unknown) {
      insertedRow = row;
      calls.push({ method: 'insert', args: [row] });
      return {
        select(columns: string) {
          calls.push({ method: 'select', args: [columns] });
          return {
            single() {
              calls.push({ method: 'single', args: [] });
              return Promise.resolve({
                data: Array.isArray(result.data) ? result.data[0] ?? null : null,
                error: result.error,
              });
            },
          };
        },
      };
    },
    update(row: unknown) {
      updatedRow = row;
      calls.push({ method: 'update', args: [row] });
      const updateQuery = {
        eq(column: string, value: string) {
          calls.push({ method: 'eq', args: [column, value] });
          return updateQuery;
        },
        select(columns: string) {
          calls.push({ method: 'select', args: [columns] });
          return {
            single() {
              calls.push({ method: 'single', args: [] });
              return Promise.resolve({
                data: Array.isArray(result.data) ? result.data[0] ?? null : null,
                error: result.error,
              });
            },
          };
        },
      };
      return updateQuery;
    },
  };
  const client: QueryClient = {
    from(table: 'transactions') {
      calls.push({ method: 'from', args: [table] });
      return fromStage;
    },
  };

  return {
    client,
    calls,
    fromStage,
    get insertedRow() { return insertedRow; },
    get updatedRow() { return updatedRow; },
  };
}

function row(overrides: Partial<CloudTransactionRow> = {}): CloudTransactionRow {
  return {
    id: 'tx-1',
    bank: 'MB',
    type: 'card',
    amount: 52043,
    currency: 'VND',
    transaction_time: '2026-07-06T04:19:20.000Z',
    content: 'Grab* BWCFLJMBDWRJ-G-1',
    raw_source: 'email',
    merchant: null,
    category: null,
    note: null,
    bank_hint: null,
    created_at: '2026-07-06T04:20:00.000Z',
    ...overrides,
  };
}

describe('cloud transaction queries', () => {
  it('keeps the from stage free of query methods before building a query', () => {
    const { fromStage } = createClient({ data: [], error: null });

    expect(Object.keys(fromStage)).toEqual(['select', 'insert', 'update']);
    expect('limit' in fromStage).toBe(false);
    expect('order' in fromStage).toBe(false);
    expect('gte' in fromStage).toBe(false);
    expect('lt' in fromStage).toBe(false);
    expect('then' in fromStage).toBe(false);
  });

  it('lists recent cloud transactions with a limit and maps rows to app transactions', async () => {
    const { client, calls } = createClient({ data: [row()], error: null });

    const transactions = await listCloudTransactions(client, { limit: 5 });

    expect(calls).toEqual([
      { method: 'from', args: ['transactions'] },
      { method: 'select', args: [SELECT_COLUMNS] },
      { method: 'limit', args: [5] },
      { method: 'order', args: ['transaction_time', { ascending: false }] },
    ]);
    expect(transactions).toEqual([
      {
        id: 'tx-1',
        amount: 52043,
        currency: 'VND',
        occurredAt: '2026-07-06T04:19:20.000Z',
        merchant: 'Grab* BWCFLJMBDWRJ-G-1',
        category: 'transportation',
        note: 'MB card',
        source: 'bank-email',
        bankHint: 'mb',
        createdAt: '2026-07-06T04:20:00.000Z',
        updatedAt: '2026-07-06T04:20:00.000Z',
      },
    ]);
  });

  it('lists cloud transactions for a time range newest first', async () => {
    const sinceISO = '2026-07-01T00:00:00.000Z';
    const untilISO = '2026-08-01T00:00:00.000Z';
    const { client, calls } = createClient({ data: [], error: null });

    await listCloudTransactionsForRange(client, { sinceISO, untilISO });

    expect(calls).toEqual([
      { method: 'from', args: ['transactions'] },
      { method: 'select', args: [SELECT_COLUMNS] },
      { method: 'gte', args: ['transaction_time', sinceISO] },
      { method: 'lt', args: ['transaction_time', untilISO] },
      { method: 'order', args: ['transaction_time', { ascending: false }] },
    ]);
  });

  it('throws Supabase error messages', async () => {
    const { client } = createClient({
      data: null,
      error: { message: 'permission denied for table transactions' },
    });

    await expect(listCloudTransactions(client)).rejects.toThrow(
      new Error('permission denied for table transactions'),
    );
  });

  it('inserts manual cloud transactions and maps the returned row', async () => {
    const returned = row({
      id: 'manual-1',
      bank: null,
      type: 'manual',
      amount: 45000,
      transaction_time: '2026-07-06T05:00:00.000Z',
      content: 'Highlands Coffee',
      raw_source: 'manual',
      merchant: 'Highlands Coffee',
      category: 'coffee-bubble-tea',
      note: null,
      created_at: '2026-07-06T05:00:10.000Z',
    });
    const context = createClient({ data: [returned], error: null });

    const tx = await addCloudTransaction(context.client, {
      amount: 45000,
      currency: 'VND',
      occurredAt: '2026-07-06T05:00:00.000Z',
      merchant: 'Highlands Coffee',
      category: 'coffee-bubble-tea',
      source: 'manual',
    });

    expect(context.calls.map(call => call.method)).toEqual(['from', 'insert', 'select', 'single']);
    expect(context.insertedRow).toMatchObject({
      bank: null,
      type: 'manual',
      amount: 45000,
      currency: 'VND',
      transaction_time: '2026-07-06T05:00:00.000Z',
      content: 'Highlands Coffee',
      raw_source: 'manual',
      merchant: 'Highlands Coffee',
      category: 'coffee-bubble-tea',
      bank_hint: null,
    });
    expect((context.insertedRow as { external_hash: string }).external_hash).toMatch(/^manual:/);
    expect(tx.source).toBe('manual');
    expect(tx.category).toBe('coffee-bubble-tea');
  });

  it('updates only the category for a cloud transaction and maps the returned row', async () => {
    const returned = row({
      id: 'email-1',
      bank: null,
      type: 'manual',
      amount: 99000,
      transaction_time: '2026-07-06T06:00:00.000Z',
      content: 'Lazada',
      raw_source: 'manual',
      merchant: 'Lazada',
      category: 'shopping',
      created_at: '2026-07-06T06:00:10.000Z',
    });
    const context = createClient({ data: [returned], error: null });

    const tx = await updateCloudTransactionCategory(context.client, 'email-1', 'shopping');

    expect(context.calls).toEqual([
      { method: 'from', args: ['transactions'] },
      { method: 'update', args: [{ category: 'shopping' }] },
      { method: 'eq', args: ['id', 'email-1'] },
      { method: 'select', args: [SELECT_COLUMNS] },
      { method: 'single', args: [] },
    ]);
    expect(context.updatedRow).toEqual({ category: 'shopping' });
    expect(tx).toMatchObject({
      id: 'email-1',
      merchant: 'Lazada',
      category: 'shopping',
      source: 'manual',
    });
  });

  it('throws Supabase update error messages', async () => {
    const { client } = createClient({
      data: null,
      error: { message: 'permission denied for update' },
    });

    await expect(updateCloudTransactionCategory(client, 'email-1', 'shopping')).rejects.toThrow(
      new Error('permission denied for update'),
    );
  });

  it('throws when an update returns no transaction', async () => {
    const { client } = createClient({ data: null, error: null });

    await expect(updateCloudTransactionCategory(client, 'email-1', 'shopping')).rejects.toThrow(
      new Error('No updated transaction returned'),
    );
  });
});
