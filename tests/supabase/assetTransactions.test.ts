import { describe, expect, it, vi } from 'vitest';
import {
  deleteCloudTransactionWithAssetEffect,
  saveCloudAssetTransfer,
  saveCloudTransactionWithAssetEffect,
  updateCloudTransactionWithAssetEffect,
} from '../../src/supabase/assetTransactions';
import type { CloudTransactionRow } from '../../src/supabase/mapper';

const timestamp = '2026-07-12T03:00:00.000Z';

function row(overrides: Partial<CloudTransactionRow> = {}): CloudTransactionRow {
  return {
    id: 'transaction-1',
    bank: null,
    type: 'manual',
    amount: 75_000,
    currency: 'VND',
    transaction_time: timestamp,
    content: 'Lunch',
    direction: 'expense',
    raw_source: 'manual',
    merchant: 'Lunch',
    category: 'food-drinks',
    note: null,
    bank_hint: null,
    asset_account_id: 'account-1',
    counterparty_asset_account_id: null,
    asset_event_id: 'event-1',
    created_at: timestamp,
    ...overrides,
  };
}

function client(data: unknown = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe('asset transaction RPCs', () => {
  it('saves and maps a linked transaction', async () => {
    const rpcClient = client(row());

    await expect(saveCloudTransactionWithAssetEffect(rpcClient, {
      amount: 75_000,
      currency: 'VND',
      occurredAt: timestamp,
      direction: 'expense',
      category: 'food-drinks',
      source: 'manual',
      merchant: 'Lunch',
      assetAccountId: 'account-1',
      operationId: '11111111-1111-4111-8111-111111111111',
    })).resolves.toMatchObject({
      id: 'transaction-1',
      assetAccountId: 'account-1',
      assetEventId: 'event-1',
    });

    expect(rpcClient.rpc).toHaveBeenCalledWith('save_transaction_with_asset_effect', {
      p_amount: 75_000,
      p_currency: 'VND',
      p_occurred_at: timestamp,
      p_direction: 'expense',
      p_category: 'food-drinks',
      p_source: 'manual',
      p_operation_id: '11111111-1111-4111-8111-111111111111',
      p_asset_account_id: 'account-1',
      p_merchant: 'Lunch',
      p_note: null,
      p_bank_hint: null,
    });
  });

  it('updates a transaction without reconstructing its asset event id', async () => {
    const rpcClient = client(row({ amount: 100_000, content: 'Dinner' }));

    await updateCloudTransactionWithAssetEffect(rpcClient, 'transaction-1', {
      amount: 100_000,
      occurredAt: timestamp,
      content: 'Dinner',
      merchant: 'Dinner',
      note: null,
      category: 'food-drinks',
      assetAccountId: 'account-1',
    });

    expect(rpcClient.rpc).toHaveBeenCalledWith('update_transaction_with_asset_effect', {
      p_id: 'transaction-1',
      p_amount: 100_000,
      p_occurred_at: timestamp,
      p_content: 'Dinner',
      p_category: 'food-drinks',
      p_asset_account_id: 'account-1',
      p_keep_asset_account: false,
      p_merchant: 'Dinner',
      p_note: null,
    });
  });

  it('asks the database to preserve the current account when edit input omits it', async () => {
    const rpcClient = client(row());

    await updateCloudTransactionWithAssetEffect(rpcClient, 'transaction-1', {
      amount: 100_000,
      occurredAt: timestamp,
      content: 'Dinner',
      merchant: 'Dinner',
      note: null,
      category: 'food-drinks',
    });

    expect(rpcClient.rpc).toHaveBeenCalledWith(
      'update_transaction_with_asset_effect',
      expect.objectContaining({
        p_asset_account_id: null,
        p_keep_asset_account: true,
      }),
    );
  });

  it('deletes through the atomic reversal RPC', async () => {
    const rpcClient = client();
    await deleteCloudTransactionWithAssetEffect(rpcClient, 'transaction-1');
    expect(rpcClient.rpc).toHaveBeenCalledWith('delete_transaction_with_asset_effect', {
      p_id: 'transaction-1',
    });
  });

  it('saves transfers through one RPC call', async () => {
    const rpcClient = client();
    await saveCloudAssetTransfer(rpcClient, {
      fromAccountId: 'bank-1',
      toAccountId: 'savings-1',
      amount: 200_000,
      currency: 'VND',
      occurredAt: timestamp,
      note: 'Emergency fund',
      operationId: '22222222-2222-4222-8222-222222222222',
    });
    expect(rpcClient.rpc).toHaveBeenCalledWith('save_asset_transfer', {
      p_from_account_id: 'bank-1',
      p_to_account_id: 'savings-1',
      p_amount: 200_000,
      p_currency: 'VND',
      p_occurred_at: timestamp,
      p_note: 'Emergency fund',
      p_operation_id: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('surfaces RPC errors', async () => {
    const rpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'atomic mutation failed' } }),
    };
    await expect(deleteCloudTransactionWithAssetEffect(rpcClient, 'transaction-1'))
      .rejects.toThrow('atomic mutation failed');
  });

  it('retries one transient database failure with the same operation payload', async () => {
    const rpcClient = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock' } })
        .mockResolvedValueOnce({ data: row(), error: null }),
    };

    await saveCloudTransactionWithAssetEffect(rpcClient, {
      amount: 75_000,
      currency: 'VND',
      occurredAt: timestamp,
      direction: 'expense',
      category: 'food-drinks',
      source: 'manual',
      assetAccountId: 'account-1',
      operationId: '33333333-3333-4333-8333-333333333333',
    });

    expect(rpcClient.rpc).toHaveBeenCalledTimes(2);
    expect(rpcClient.rpc.mock.calls[0]).toEqual(rpcClient.rpc.mock.calls[1]);
  });

  it('retries a Supabase status-zero network result with the same operation payload', async () => {
    const rpcClient = {
      rpc: vi.fn()
        .mockResolvedValueOnce({
          data: null,
          error: { code: '', message: 'TypeError: Load failed' },
          status: 0,
        })
        .mockResolvedValueOnce({ data: row(), error: null, status: 200 }),
    };

    await saveCloudTransactionWithAssetEffect(rpcClient, {
      amount: 75_000,
      currency: 'VND',
      occurredAt: timestamp,
      direction: 'expense',
      category: 'food-drinks',
      source: 'manual',
      assetAccountId: 'account-1',
      operationId: '44444444-4444-4444-8444-444444444444',
    });

    expect(rpcClient.rpc).toHaveBeenCalledTimes(2);
    expect(rpcClient.rpc.mock.calls[0]).toEqual(rpcClient.rpc.mock.calls[1]);
  });
});
