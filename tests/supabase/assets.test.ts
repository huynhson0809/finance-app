import { describe, expect, it, vi } from 'vitest';
import {
  deleteCloudAssetAccount,
  findCloudAssetAccountByBankIdentifier,
  insertCloudAssetEvent,
  listCloudAssetAccounts,
  listCloudAssetEvents,
  reorderCloudAssetAccounts,
  upsertCloudAssetAccount,
} from '../../src/supabase/assets';
import type { AssetAccountInput, AssetEventInput } from '../../src/supabase/assets';

interface Call {
  method: string;
  args: unknown[];
}

interface MockResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function createClient<T>(result: MockResult<T>) {
  const calls: Call[] = [];
  const upsertedRows: unknown[] = [];
  const insertedRows: unknown[] = [];
  const updatedRows: unknown[] = [];

  const query = {
    order(column: string, opts: { ascending: boolean }) {
      calls.push({ method: 'order', args: [column, opts] });
      return query;
    },
    eq(column: string, value: string) {
      calls.push({ method: 'eq', args: [column, value] });
      return query;
    },
    single() {
      calls.push({ method: 'single', args: [] });
      return Promise.resolve(result);
    },
    maybeSingle() {
      calls.push({ method: 'maybeSingle', args: [] });
      return Promise.resolve(result);
    },
    then<TResult1 = MockResult<T>, TResult2 = never>(
      onfulfilled?: ((value: MockResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
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
    upsert(row: unknown, options: unknown) {
      upsertedRows.push(row);
      calls.push({ method: 'upsert', args: [row, options] });
      return {
        select(columns: string) {
          calls.push({ method: 'select', args: [columns] });
          return query;
        },
      };
    },
    insert(row: unknown) {
      insertedRows.push(row);
      calls.push({ method: 'insert', args: [row] });
      return {
        select(columns: string) {
          calls.push({ method: 'select', args: [columns] });
          return query;
        },
      };
    },
    update(row: unknown) {
      updatedRows.push(row);
      calls.push({ method: 'update', args: [row] });
      return query;
    },
    delete() {
      calls.push({ method: 'delete', args: [] });
      return query;
    },
  };

  return {
    calls,
    get upsertedRow() { return upsertedRows.at(-1); },
    upsertedRows,
    get insertedRow() { return insertedRows.at(-1); },
    insertedRows,
    updatedRows,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from(table: string) {
        calls.push({ method: 'from', args: [table] });
        return fromStage;
      },
    },
  };
}

describe('cloud assets', () => {
  it('maps asset account rows with null optionals and numeric strings', async () => {
    const { client, calls } = createClient({
      data: [{
        id: 'account-1',
        user_id: 'user-1',
        kind: 'gold',
        name: 'Gold stash',
        currency: 'VND',
        balance: '1250000.5',
        quantity: '2.25',
        gold_unit: null,
        bank: null,
        account_identifier: null,
        card_identifier: null,
        include_in_total: true,
        sort_order: 3,
        created_at: '2026-07-11T00:00:00.000Z',
        updated_at: '2026-07-11T01:00:00.000Z',
      }],
      error: null,
    });

    await expect(listCloudAssetAccounts(client)).resolves.toEqual([{
      id: 'account-1',
      userId: 'user-1',
      kind: 'gold',
      name: 'Gold stash',
      currency: 'VND',
      balance: 1250000.5,
      quantity: 2.25,
      goldUnit: undefined,
      bank: null,
      accountIdentifier: null,
      cardIdentifier: null,
      includeInTotal: true,
      sortOrder: 3,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T01:00:00.000Z',
    }]);
    expect(calls).toEqual([
      { method: 'from', args: ['asset_accounts'] },
      {
        method: 'select',
        args: [
          'id,user_id,kind,name,currency,balance,quantity,gold_unit,bank,account_identifier,card_identifier,include_in_total,sort_order,created_at,updated_at',
        ],
      },
      { method: 'order', args: ['sort_order', { ascending: true }] },
      { method: 'order', args: ['created_at', { ascending: true }] },
    ]);
  });

  it('upserts asset accounts with the current user id and snake_case fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-11T02:00:00.000Z'));
    const account: AssetAccountInput = {
      id: 'account-1',
      kind: 'bank',
      name: 'MB checking',
      currency: 'VND',
      balance: 500000,
      bank: 'MB',
      accountIdentifier: '1234',
      cardIdentifier: null,
      includeInTotal: true,
      sortOrder: 1,
    };
    const context = createClient({
      data: {
        id: 'account-1',
        user_id: 'user-1',
        kind: 'bank',
        name: 'MB checking',
        currency: 'VND',
        balance: 500000,
        quantity: null,
        gold_unit: null,
        bank: 'MB',
        account_identifier: '1234',
        card_identifier: null,
        include_in_total: true,
        sort_order: 1,
        created_at: '2026-07-11T02:00:00.000Z',
        updated_at: '2026-07-11T02:00:00.000Z',
      },
      error: null,
    });

    try {
      await upsertCloudAssetAccount(context.client, account);
    } finally {
      vi.useRealTimers();
    }

    expect(context.upsertedRow).toMatchObject({
      id: 'account-1',
      user_id: 'user-1',
      kind: 'bank',
      name: 'MB checking',
      currency: 'VND',
      balance: 500000,
      quantity: null,
      gold_unit: null,
      bank: 'MB',
      account_identifier: '1234',
      card_identifier: null,
      include_in_total: true,
      sort_order: 1,
      created_at: '2026-07-11T02:00:00.000Z',
      updated_at: '2026-07-11T02:00:00.000Z',
    });
    expect(context.calls).toContainEqual({
      method: 'upsert',
      args: [expect.any(Object), { onConflict: 'id' }],
    });
  });

  it('deletes asset accounts by id', async () => {
    const { client, calls } = createClient({ data: null, error: null });

    await deleteCloudAssetAccount(client, 'account-1');

    expect(calls).toEqual([
      { method: 'from', args: ['asset_accounts'] },
      { method: 'delete', args: [] },
      { method: 'eq', args: ['id', 'account-1'] },
    ]);
  });

  it('updates sort_order for each asset account during reorder', async () => {
    const context = createClient({ data: null, error: null });

    await reorderCloudAssetAccounts(context.client, ['account-b', 'account-a']);

    expect(context.updatedRows).toEqual([
      { sort_order: 0 },
      { sort_order: 1 },
    ]);
    expect(context.calls).toEqual([
      { method: 'from', args: ['asset_accounts'] },
      { method: 'update', args: [{ sort_order: 0 }] },
      { method: 'eq', args: ['id', 'account-b'] },
      { method: 'from', args: ['asset_accounts'] },
      { method: 'update', args: [{ sort_order: 1 }] },
      { method: 'eq', args: ['id', 'account-a'] },
    ]);
  });

  it('inserts asset events with the current user id', async () => {
    const event: AssetEventInput = {
      id: 'event-1',
      accountId: 'account-1',
      counterpartyAccountId: null,
      transactionId: 'transaction-1',
      type: 'expense',
      amount: 75000,
      currency: 'VND',
      balanceAfter: 425000,
      note: 'Lunch',
      occurredAt: '2026-07-11T05:00:00.000Z',
      createdAt: '2026-07-11T05:01:00.000Z',
    };
    const context = createClient({
      data: {
        id: 'event-1',
        user_id: 'user-1',
        account_id: 'account-1',
        counterparty_account_id: null,
        transaction_id: 'transaction-1',
        type: 'expense',
        amount: 75000,
        currency: 'VND',
        balance_after: 425000,
        note: 'Lunch',
        occurred_at: '2026-07-11T05:00:00.000Z',
        created_at: '2026-07-11T05:01:00.000Z',
      },
      error: null,
    });

    await insertCloudAssetEvent(context.client, event);

    expect(context.insertedRow).toMatchObject({
      id: 'event-1',
      user_id: 'user-1',
      account_id: 'account-1',
      counterparty_account_id: null,
      transaction_id: 'transaction-1',
      type: 'expense',
      amount: 75000,
      currency: 'VND',
      balance_after: 425000,
      note: 'Lunch',
      occurred_at: '2026-07-11T05:00:00.000Z',
      created_at: '2026-07-11T05:01:00.000Z',
    });
  });

  it('filters asset events by account_id when provided', async () => {
    const { client, calls } = createClient({
      data: [{
        id: 'event-1',
        user_id: 'user-1',
        account_id: 'account-1',
        counterparty_account_id: null,
        transaction_id: null,
        type: 'opening_balance',
        amount: '100000',
        currency: 'VND',
        balance_after: '100000',
        note: null,
        occurred_at: '2026-07-11T06:00:00.000Z',
        created_at: '2026-07-11T06:01:00.000Z',
      }],
      error: null,
    });

    await expect(listCloudAssetEvents(client, 'account-1')).resolves.toEqual([{
      id: 'event-1',
      userId: 'user-1',
      accountId: 'account-1',
      counterpartyAccountId: null,
      transactionId: null,
      type: 'opening_balance',
      amount: 100000,
      currency: 'VND',
      balanceAfter: 100000,
      note: null,
      occurredAt: '2026-07-11T06:00:00.000Z',
      createdAt: '2026-07-11T06:01:00.000Z',
    }]);
    expect(calls).toContainEqual({ method: 'eq', args: ['account_id', 'account-1'] });
    expect(calls).toContainEqual({
      method: 'order',
      args: ['occurred_at', { ascending: false }],
    });
  });

  it('finds asset accounts by bank account or card identifier', async () => {
    const bankContext = createClient({
      data: {
        id: 'account-1',
        user_id: 'user-1',
        kind: 'bank',
        name: 'MB checking',
        currency: 'VND',
        balance: 500000,
        quantity: null,
        gold_unit: null,
        bank: 'MB',
        account_identifier: '1234',
        card_identifier: null,
        include_in_total: true,
        sort_order: 0,
        created_at: '2026-07-11T00:00:00.000Z',
        updated_at: '2026-07-11T00:00:00.000Z',
      },
      error: null,
    });

    await expect(findCloudAssetAccountByBankIdentifier(bankContext.client, {
      bank: 'MB',
      accountIdentifier: '1234',
    })).resolves.toMatchObject({
      id: 'account-1',
      bank: 'MB',
      accountIdentifier: '1234',
    });
    expect(bankContext.calls).toContainEqual({ method: 'eq', args: ['bank', 'MB'] });
    expect(bankContext.calls).toContainEqual({ method: 'eq', args: ['account_identifier', '1234'] });
    expect(bankContext.calls).toContainEqual({ method: 'maybeSingle', args: [] });

    const cardContext = createClient({
      data: {
        id: 'account-2',
        user_id: 'user-1',
        kind: 'credit_card',
        name: 'MB card',
        currency: 'VND',
        balance: -100000,
        quantity: null,
        gold_unit: null,
        bank: 'MB',
        account_identifier: null,
        card_identifier: '9876',
        include_in_total: true,
        sort_order: 1,
        created_at: '2026-07-11T00:00:00.000Z',
        updated_at: '2026-07-11T00:00:00.000Z',
      },
      error: null,
    });

    await findCloudAssetAccountByBankIdentifier(cardContext.client, {
      bank: 'MB',
      cardIdentifier: '9876',
    });
    expect(cardContext.calls).toContainEqual({ method: 'eq', args: ['card_identifier', '9876'] });

    const emptyContext = createClient({ data: null, error: null });
    await expect(findCloudAssetAccountByBankIdentifier(emptyContext.client, {
      bank: 'MB',
      accountIdentifier: null,
      cardIdentifier: null,
    })).resolves.toBeNull();
    expect(emptyContext.calls).toEqual([]);

    const missingIdentifierContext = createClient({ data: null, error: null });
    await expect(findCloudAssetAccountByBankIdentifier(missingIdentifierContext.client, {
      bank: 'MB',
    })).resolves.toBeNull();
    expect(missingIdentifierContext.calls).toEqual([]);

    const notFoundContext = createClient({ data: null, error: null });
    await expect(findCloudAssetAccountByBankIdentifier(notFoundContext.client, {
      bank: 'MB',
      accountIdentifier: 'missing',
    })).resolves.toBeNull();
    expect(notFoundContext.calls).toContainEqual({ method: 'eq', args: ['bank', 'MB'] });
    expect(notFoundContext.calls).toContainEqual({ method: 'eq', args: ['account_identifier', 'missing'] });
    expect(notFoundContext.calls).toContainEqual({ method: 'maybeSingle', args: [] });
  });
});
