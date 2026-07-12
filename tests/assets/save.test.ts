import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../src/types';

const mocks = vi.hoisted(() => ({
  supabase: {} as unknown,
  saveCloudTransactionWithAssetEffect: vi.fn(),
  updateCloudTransactionWithAssetEffect: vi.fn(),
  deleteCloudTransactionWithAssetEffect: vi.fn(),
  saveCloudAssetTransfer: vi.fn(),
  saveUserTransaction: vi.fn(),
  invalidateAssetQueries: vi.fn(),
  invalidateTransactionQueries: vi.fn(),
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock('../../src/supabase/assetTransactions', () => ({
  saveCloudTransactionWithAssetEffect: mocks.saveCloudTransactionWithAssetEffect,
  updateCloudTransactionWithAssetEffect: mocks.updateCloudTransactionWithAssetEffect,
  deleteCloudTransactionWithAssetEffect: mocks.deleteCloudTransactionWithAssetEffect,
  saveCloudAssetTransfer: mocks.saveCloudAssetTransfer,
}));

vi.mock('../../src/transactions/save', () => ({
  saveUserTransaction: mocks.saveUserTransaction,
}));

vi.mock('../../src/query/client', () => ({
  invalidateAssetQueries: mocks.invalidateAssetQueries,
  invalidateTransactionQueries: mocks.invalidateTransactionQueries,
}));

import {
  deleteTransactionWithAssetEffect,
  saveAssetTransfer,
  saveTransactionWithAssetEffect,
  updateTransactionWithAssetEffect,
} from '../../src/assets/save';

const timestamp = '2026-07-12T03:00:00.000Z';
const saved = {
  id: 'transaction-1',
  amount: 75_000,
  currency: 'VND',
  occurredAt: timestamp,
  merchant: 'Lunch',
  source: 'manual',
  direction: 'expense',
  category: 'food-drinks',
  assetAccountId: 'account-1',
  assetEventId: 'event-1',
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies Transaction;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supabase = {};
  mocks.saveCloudTransactionWithAssetEffect.mockResolvedValue(saved);
  mocks.updateCloudTransactionWithAssetEffect.mockResolvedValue(saved);
  mocks.deleteCloudTransactionWithAssetEffect.mockResolvedValue(undefined);
  mocks.saveCloudAssetTransfer.mockResolvedValue(undefined);
  mocks.saveUserTransaction.mockResolvedValue(saved);
  mocks.invalidateAssetQueries.mockResolvedValue(undefined);
  mocks.invalidateTransactionQueries.mockResolvedValue(undefined);
});

describe('wallet-aware transaction service', () => {
  it('routes linked saves through the atomic RPC and invalidates both caches', async () => {
    const input = {
      amount: 75_000,
      currency: 'VND' as const,
      occurredAt: timestamp,
      merchant: 'Lunch',
      source: 'manual' as const,
      direction: 'expense' as const,
      category: 'food-drinks' as const,
      assetAccountId: 'account-1',
      operationId: '11111111-1111-4111-8111-111111111111',
    };

    await expect(saveTransactionWithAssetEffect(input)).resolves.toBe(saved);
    expect(mocks.saveCloudTransactionWithAssetEffect).toHaveBeenCalledWith(mocks.supabase, input);
    expect(mocks.saveUserTransaction).not.toHaveBeenCalled();
    expect(mocks.invalidateTransactionQueries).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAssetQueries).toHaveBeenCalledTimes(1);
  });

  it('uses the idempotent cloud RPC even when no wallet is selected', async () => {
    const input = {
      amount: 75_000,
      currency: 'VND' as const,
      occurredAt: timestamp,
      source: 'manual' as const,
      direction: 'expense' as const,
      category: 'food-drinks' as const,
      operationId: '55555555-5555-4555-8555-555555555555',
    };

    await expect(saveTransactionWithAssetEffect(input)).resolves.toBe(saved);
    expect(mocks.saveCloudTransactionWithAssetEffect).toHaveBeenCalledWith(mocks.supabase, input);
    expect(mocks.saveUserTransaction).not.toHaveBeenCalled();
    expect(mocks.invalidateTransactionQueries).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAssetQueries).toHaveBeenCalledTimes(1);
  });

  it('keeps the local fallback when Supabase is not configured', async () => {
    mocks.supabase = null;
    const input = {
      amount: 75_000,
      currency: 'VND' as const,
      occurredAt: timestamp,
      source: 'manual' as const,
      direction: 'expense' as const,
      category: 'food-drinks' as const,
      operationId: '66666666-6666-4666-8666-666666666666',
    };

    await saveTransactionWithAssetEffect(input);
    expect(mocks.saveUserTransaction).toHaveBeenCalledWith(expect.not.objectContaining({
      operationId: expect.anything(),
    }));
    expect(mocks.saveCloudTransactionWithAssetEffect).not.toHaveBeenCalled();
  });

  it('preserves a linked wallet on edit when assetAccountId is omitted', async () => {
    const input = {
      amount: 100_000,
      occurredAt: timestamp,
      content: 'Dinner',
      merchant: 'Dinner',
      note: null,
      category: 'food-drinks' as const,
    };

    await updateTransactionWithAssetEffect(saved.id, input);
    expect(mocks.updateCloudTransactionWithAssetEffect).toHaveBeenCalledWith(
      mocks.supabase,
      saved.id,
      input,
    );
    expect(mocks.invalidateTransactionQueries).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAssetQueries).toHaveBeenCalledTimes(1);
  });

  it('deletes through the atomic reversal RPC', async () => {
    await deleteTransactionWithAssetEffect(saved.id);
    expect(mocks.deleteCloudTransactionWithAssetEffect).toHaveBeenCalledWith(mocks.supabase, saved.id);
    expect(mocks.invalidateTransactionQueries).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAssetQueries).toHaveBeenCalledTimes(1);
  });

  it('saves a transfer through one atomic RPC and rejects self-transfers early', async () => {
    const transfer = {
      fromAccountId: 'bank-1',
      toAccountId: 'card-1',
      amount: 200_000,
      currency: 'VND' as const,
      occurredAt: timestamp,
      note: 'Card payment',
      operationId: '22222222-2222-4222-8222-222222222222',
    };

    await saveAssetTransfer(transfer);
    expect(mocks.saveCloudAssetTransfer).toHaveBeenCalledWith(mocks.supabase, transfer);
    expect(mocks.invalidateTransactionQueries).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAssetQueries).toHaveBeenCalledTimes(1);

    await expect(saveAssetTransfer({ ...transfer, toAccountId: transfer.fromAccountId }))
      .rejects.toThrow('Transfer accounts must be different.');
  });
});
