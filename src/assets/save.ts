import { invalidateAssetQueries, invalidateTransactionQueries } from '../query/client';
import {
  deleteCloudTransactionWithAssetEffect,
  saveCloudAssetTransfer,
  saveCloudTransactionWithAssetEffect,
  updateCloudTransactionWithAssetEffect,
  type AssetTransactionRpcClient,
  type CloudAssetTransactionUpdateInput,
} from '../supabase/assetTransactions';
import { supabase } from '../supabase/client';
import { saveUserTransaction, type SaveTransactionInput } from '../transactions/save';
import type {
  Transaction,
  TransactionAssetLinkInput,
  TransferInput,
} from '../types';

export type UpdateTransactionInput = Omit<
  CloudAssetTransactionUpdateInput,
  'assetAccountId'
>;

function cloudClient(): AssetTransactionRpcClient {
  if (!supabase) {
    throw new Error('Supabase is required for wallet-linked transactions.');
  }
  return supabase as unknown as AssetTransactionRpcClient;
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than zero.');
  }
}

async function invalidateWalletMutation(): Promise<void> {
  await Promise.all([
    invalidateTransactionQueries(),
    invalidateAssetQueries(),
  ]);
}

export async function saveTransactionWithAssetEffect(
  input: SaveTransactionInput & TransactionAssetLinkInput & { operationId: string },
): Promise<Transaction> {
  assertPositiveAmount(input.amount);
  if (!supabase) {
    if (input.assetAccountId) cloudClient();
    const { operationId: _operationId, ...localInput } = input;
    return saveUserTransaction(localInput);
  }

  const transaction = await saveCloudTransactionWithAssetEffect(cloudClient(), {
    ...input,
  });
  await invalidateWalletMutation();
  return transaction;
}

export async function updateTransactionWithAssetEffect(
  id: string,
  input: UpdateTransactionInput & TransactionAssetLinkInput,
): Promise<Transaction> {
  assertPositiveAmount(input.amount);
  const transaction = await updateCloudTransactionWithAssetEffect(cloudClient(), id, input);
  await invalidateWalletMutation();
  return transaction;
}

export async function deleteTransactionWithAssetEffect(id: string): Promise<void> {
  await deleteCloudTransactionWithAssetEffect(cloudClient(), id);
  await invalidateWalletMutation();
}

export async function saveAssetTransfer(input: TransferInput): Promise<void> {
  assertPositiveAmount(input.amount);
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Transfer accounts must be different.');
  }

  await saveCloudAssetTransfer(cloudClient(), {
    ...input,
  });
  await invalidateWalletMutation();
}
