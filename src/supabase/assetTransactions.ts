import type { TransferInput, Transaction, TransactionAssetLinkInput } from '../types';
import type { SaveTransactionInput } from '../transactions/save';
import { mapTransactionRow, type CloudTransactionRow } from './mapper';
import type { CloudTransactionFullUpdate } from './transactions';

interface RpcError {
  code?: string;
  message: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
  status?: number;
}

export interface AssetTransactionRpcClient {
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type CloudAssetTransactionUpdateInput = Omit<
  CloudTransactionFullUpdate,
  'counterpartyAssetAccountId' | 'assetEventId'
> & TransactionAssetLinkInput;
export type CloudAssetTransactionSaveInput = SaveTransactionInput & TransactionAssetLinkInput & {
  operationId: string;
};
export type CloudAssetTransferInput = TransferInput & { operationId: string };

function throwIfError(error: RpcError | null): void {
  if (error) throw new Error(error.message);
}

function isTransientRpcFailure(result: RpcResult): boolean {
  if (result.status === 0 || (result.status !== undefined && result.status >= 500)) return true;
  return result.error?.code === '40P01' || result.error?.code === '40001';
}

async function callAtomicRpc(
  client: AssetTransactionRpcClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await client.rpc(functionName, args);
      if (attempt === 0 && isTransientRpcFailure(result)) continue;
      return result;
    } catch (error) {
      if (attempt === 0) continue;
      throw error;
    }
  }
  throw new Error('Atomic RPC retry exhausted');
}

function returnedTransaction(data: unknown): Transaction {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('No transaction returned from asset RPC');
  }
  return mapTransactionRow(candidate as CloudTransactionRow);
}

export async function saveCloudTransactionWithAssetEffect(
  client: AssetTransactionRpcClient,
  input: CloudAssetTransactionSaveInput,
): Promise<Transaction> {
  const result = await callAtomicRpc(client, 'save_transaction_with_asset_effect', {
    p_amount: input.amount,
    p_currency: input.currency,
    p_occurred_at: input.occurredAt,
    p_direction: input.direction,
    p_category: input.category,
    p_source: input.source,
    p_operation_id: input.operationId,
    p_asset_account_id: input.assetAccountId ?? null,
    p_merchant: input.merchant?.trim() || null,
    p_note: input.note?.trim() || null,
    p_bank_hint: input.bankHint ?? null,
  });

  throwIfError(result.error);
  return returnedTransaction(result.data);
}

export async function updateCloudTransactionWithAssetEffect(
  client: AssetTransactionRpcClient,
  id: string,
  input: CloudAssetTransactionUpdateInput,
): Promise<Transaction> {
  const result = await callAtomicRpc(client, 'update_transaction_with_asset_effect', {
    p_id: id,
    p_amount: input.amount,
    p_occurred_at: input.occurredAt,
    p_content: input.content,
    p_category: input.category,
    p_asset_account_id: input.assetAccountId ?? null,
    p_keep_asset_account: input.assetAccountId === undefined,
    p_merchant: input.merchant,
    p_note: input.note,
  });

  throwIfError(result.error);
  return returnedTransaction(result.data);
}

export async function deleteCloudTransactionWithAssetEffect(
  client: AssetTransactionRpcClient,
  id: string,
): Promise<void> {
  const result = await callAtomicRpc(client, 'delete_transaction_with_asset_effect', { p_id: id });
  throwIfError(result.error);
}

export async function saveCloudAssetTransfer(
  client: AssetTransactionRpcClient,
  input: CloudAssetTransferInput,
): Promise<void> {
  const result = await callAtomicRpc(client, 'save_asset_transfer', {
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
    p_amount: input.amount,
    p_currency: input.currency,
    p_occurred_at: input.occurredAt,
    p_note: input.note?.trim() || null,
    p_operation_id: input.operationId,
  });
  throwIfError(result.error);
}
