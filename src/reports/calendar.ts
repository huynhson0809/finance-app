import { todayVietnamDate } from '../lib/date';
import type { Category, Transaction, TransactionDirection } from '../types';
import { totalsByDirection } from './totals';

export interface CalendarDaySummary {
  date: string;
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  hasTransactions: boolean;
}

export interface CategoryDayTotal {
  category: Category;
  direction: TransactionDirection;
  total: number;
  count: number;
}

export interface CalendarDateGroup {
  date: string;
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  rows: CategoryDayTotal[];
}

function transactionDirection(transaction: Transaction): TransactionDirection {
  return transaction.direction === 'income' ? 'income' : 'expense';
}

function daysInMonth(monthISO: string): number {
  const [year, month] = monthISO.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayDate(monthISO: string, day: number): string {
  return `${monthISO}-${String(day).padStart(2, '0')}`;
}

export function mondayWeekdayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)).getUTCDay();
  return (weekday + 6) % 7;
}

export function calendarDaySummaries(
  transactions: Transaction[],
  monthISO: string,
): CalendarDaySummary[] {
  const totalsByDate = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (date.slice(0, 7) !== monthISO) continue;
    const rows = totalsByDate.get(date) ?? [];
    rows.push(transaction);
    totalsByDate.set(date, rows);
  }

  return Array.from({ length: daysInMonth(monthISO) }, (_, index) => {
    const date = dayDate(monthISO, index + 1);
    const rows = totalsByDate.get(date) ?? [];
    const totals = totalsByDirection(rows);
    return {
      date,
      expenseTotal: totals.expense,
      incomeTotal: totals.income,
      netTotal: totals.net,
      hasTransactions: rows.length > 0,
    };
  });
}

export function categoryTotalsForDate(
  transactions: Transaction[],
  date: string,
): CategoryDayTotal[] {
  const byCategory = new Map<string, CategoryDayTotal>();

  for (const transaction of transactions) {
    if (todayVietnamDate(new Date(transaction.occurredAt)) !== date) continue;

    const direction = transactionDirection(transaction);
    const key = `${direction}:${transaction.category}`;
    const existing = byCategory.get(key) ?? {
      category: transaction.category,
      direction,
      total: 0,
      count: 0,
    };

    existing.total += transaction.amount;
    existing.count += 1;
    byCategory.set(key, existing);
  }

  return Array.from(byCategory.values()).sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'income' ? -1 : 1;
    if (a.total !== b.total) return b.total - a.total;
    return a.category.localeCompare(b.category);
  });
}

export function categoryTotalsByDate(
  transactions: Transaction[],
  monthISO: string,
): CalendarDateGroup[] {
  const byDate = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (date.slice(0, 7) !== monthISO) continue;
    const rows = byDate.get(date) ?? [];
    rows.push(transaction);
    byDate.set(date, rows);
  }

  return Array.from(byDate.entries())
    .map(([date, rows]) => {
      const totals = totalsByDirection(rows);
      return {
        date,
        expenseTotal: totals.expense,
        incomeTotal: totals.income,
        netTotal: totals.net,
        rows: categoryTotalsForDate(rows, date),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function initialSelectedDate(
  monthISO: string,
  transactions: Transaction[],
  today = todayVietnamDate(),
): string {
  if (today.slice(0, 7) === monthISO) return today;

  const firstTransactionDay = calendarDaySummaries(transactions, monthISO)
    .find(summary => summary.hasTransactions);

  return firstTransactionDay?.date ?? `${monthISO}-01`;
}
