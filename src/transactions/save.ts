import { addTransaction } from '../db/transactions';
import { invalidateTransactionQueries } from '../query/client';
import { supabase } from '../supabase/client';
import { addCloudTransaction, type UserTransactionInput } from '../supabase/transactions';
import type { Transaction } from '../types';

export type SaveTransactionInput = UserTransactionInput;

export async function saveUserTransaction(input: SaveTransactionInput): Promise<Transaction> {
  if (supabase) {
    const transaction = await addCloudTransaction(supabase, input);
    await invalidateTransactionQueries();
    return transaction;
  }

  return addTransaction(input);
}
