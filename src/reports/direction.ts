import type { Transaction, TransactionDirection } from '../types';

type LegacyTransaction = Transaction & { direction?: TransactionDirection };

export function transactionDirection(transaction: Transaction): TransactionDirection {
  return (transaction as LegacyTransaction).direction ?? 'expense';
}
