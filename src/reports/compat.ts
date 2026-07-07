import type { Transaction } from '../types';

type LegacyTransaction = Transaction & { direction?: Transaction['direction'] };

export function isExpenseLike(transaction: Transaction): boolean {
  return (transaction as LegacyTransaction).direction !== 'income';
}
