import { describe, expect, it } from 'vitest';
import {
  listCloudTransactions,
  listCloudTransactionsForRange,
} from '../../src/supabase/transactions';
import type { CloudTransactionRow } from '../../src/supabase/mapper';

const SELECT_COLUMNS = 'id,bank,type,amount,currency,transaction_time,content,raw_source,created_at';

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
  const query = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] });
      return query;
    },
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
    then(resolve: (value: MockResult) => void) {
      resolve(result);
    },
  };
  const client = {
    from(table: string) {
      calls.push({ method: 'from', args: [table] });
      return query;
    },
  };

  return { client, calls };
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
    created_at: '2026-07-06T04:20:00.000Z',
    ...overrides,
  };
}

describe('cloud transaction queries', () => {
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
});
