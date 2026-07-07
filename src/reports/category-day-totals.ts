import { todayVietnamDate } from '../lib/date';
import {
  categoryBelongsToDirection,
  type Category,
  type Transaction,
  type TransactionDirection,
} from '../types';
import { transactionDirection } from './direction';

export interface CategoryDayTotal {
  date: string;
  total: number;
  direction?: TransactionDirection;
}

export function categoryDayTotals(
  transactions: Transaction[],
  monthISO: string,
  direction: TransactionDirection,
  category: Category,
): CategoryDayTotal[] {
  const [year, month] = monthISO.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totals = new Array<number>(daysInMonth).fill(0);

  if (!categoryBelongsToDirection(category, direction)) {
    return totals.map((total, index) => ({
      date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
      total,
    }));
  }

  for (const transaction of transactions) {
    if (transactionDirection(transaction) !== direction) continue;
    if (transaction.category !== category) continue;

    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (date.slice(0, 7) !== monthISO) continue;

    const day = Number(date.slice(8, 10));
    totals[day - 1] += transaction.amount;
  }

  return totals.map((total, index) => ({
    date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    total,
  }));
}
