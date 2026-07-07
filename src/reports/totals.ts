import type { Transaction } from '../types';

export interface DirectionTotals {
  expense: number;
  income: number;
  net: number;
}

export function totalsByDirection(transactions: Transaction[]): DirectionTotals {
  let expense = 0;
  let income = 0;

  for (const transaction of transactions) {
    if (transaction.direction === 'income') {
      income += transaction.amount;
    } else {
      expense += transaction.amount;
    }
  }

  return {
    expense,
    income,
    net: income - expense,
  };
}
