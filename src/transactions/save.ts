import { addTransaction } from '../db/transactions';
import { supabase } from '../supabase/client';
import { addCloudTransaction, type UserTransactionInput } from '../supabase/transactions';
import type { Transaction } from '../types';

export type SaveTransactionInput = UserTransactionInput;

export async function saveUserTransaction(input: SaveTransactionInput): Promise<Transaction> {
  if (supabase) {
    return addCloudTransaction(supabase, input);
  }

  return addTransaction(input);
}
