import { describe, expect, it } from 'vitest';
import {
  calendarDaySummaries,
  categoryTotalsByDate,
  categoryTotalsForDate,
  initialSelectedDate,
  mondayWeekdayIndex,
} from '../../src/reports/calendar';
import type { Transaction, TransactionDirection } from '../../src/types';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  const direction = (overrides.direction ?? 'expense') as TransactionDirection;
  const occurredAt = overrides.occurredAt ?? '2026-07-07T05:00:00.000Z';
  return {
    id: crypto.randomUUID(),
    amount: 10_000,
    currency: 'VND',
    occurredAt,
    direction,
    category: direction === 'income' ? 'salary' : 'food-drinks',
    source: 'manual',
    createdAt: occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  } as Transaction;
}

describe('calendar report helpers', () => {
  it('builds one day summary per Vietnam-local day and separates income from expense', () => {
    const summaries = calendarDaySummaries([
      tx({ amount: 20_000, direction: 'expense', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 30_000, direction: 'expense', occurredAt: '2026-07-07T15:00:00.000Z' }),
      tx({ amount: 100_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T06:00:00.000Z' }),
      tx({ amount: 999_000, direction: 'expense', occurredAt: '2026-08-01T05:00:00.000Z' }),
    ], '2026-07');

    expect(summaries).toHaveLength(31);
    expect(summaries[6]).toEqual({
      date: '2026-07-07',
      expenseTotal: 50_000,
      incomeTotal: 100_000,
      netTotal: 50_000,
      hasTransactions: true,
    });
    expect(summaries[0]).toEqual({
      date: '2026-07-01',
      expenseTotal: 0,
      incomeTotal: 0,
      netTotal: 0,
      hasTransactions: false,
    });
  });

  it('groups selected-day totals by category and direction', () => {
    const rows = categoryTotalsForDate([
      tx({ amount: 20_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 30_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T06:00:00.000Z' }),
      tx({ amount: 12_000, direction: 'expense', category: 'transportation', occurredAt: '2026-07-07T07:00:00.000Z' }),
      tx({ amount: 1_000_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T08:00:00.000Z' }),
      tx({ amount: 99_000, direction: 'expense', category: 'shopping', occurredAt: '2026-07-08T05:00:00.000Z' }),
    ], '2026-07-07');

    expect(rows).toEqual([
      { category: 'salary', direction: 'income', total: 1_000_000, count: 1 },
      { category: 'food-drinks', direction: 'expense', total: 50_000, count: 2 },
      { category: 'transportation', direction: 'expense', total: 12_000, count: 1 },
    ]);
  });

  it('keeps same-category runtime rows separate by normalized direction', () => {
    const missingDirectionSalaryRow = {
      ...tx({ amount: 25_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T06:00:00.000Z' }),
      direction: undefined,
    } as unknown as Transaction;

    const rows = categoryTotalsForDate([
      tx({ amount: 1_000_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T05:00:00.000Z' }),
      missingDirectionSalaryRow,
    ], '2026-07-07');

    expect(rows).toEqual([
      { category: 'salary', direction: 'income', total: 1_000_000, count: 1 },
      { category: 'salary', direction: 'expense', total: 25_000, count: 1 },
    ]);
  });

  it('sorts equal category totals by category id within each direction', () => {
    const rows = categoryTotalsForDate([
      tx({ amount: 10_000, direction: 'expense', category: 'transportation', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 10_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T06:00:00.000Z' }),
    ], '2026-07-07');

    expect(rows).toEqual([
      { category: 'food-drinks', direction: 'expense', total: 10_000, count: 1 },
      { category: 'transportation', direction: 'expense', total: 10_000, count: 1 },
    ]);
  });

  it('builds Money Note-style date groups sorted newest first', () => {
    const groups = categoryTotalsByDate([
      tx({ amount: 20_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 30_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T06:00:00.000Z' }),
      tx({ amount: 90_000, direction: 'income', category: 'allowance', occurredAt: '2026-07-08T05:00:00.000Z' }),
      tx({ amount: 12_000, direction: 'expense', category: 'healthcare', occurredAt: '2026-07-08T06:00:00.000Z' }),
      tx({ amount: 999_000, direction: 'expense', category: 'shopping', occurredAt: '2026-08-01T05:00:00.000Z' }),
    ], '2026-07');

    expect(groups).toEqual([
      {
        date: '2026-07-08',
        expenseTotal: 12_000,
        incomeTotal: 90_000,
        netTotal: 78_000,
        rows: [
          { category: 'allowance', direction: 'income', total: 90_000, count: 1 },
          { category: 'healthcare', direction: 'expense', total: 12_000, count: 1 },
        ],
      },
      {
        date: '2026-07-07',
        expenseTotal: 50_000,
        incomeTotal: 0,
        netTotal: -50_000,
        rows: [
          { category: 'food-drinks', direction: 'expense', total: 50_000, count: 2 },
        ],
      },
    ]);
  });

  it('uses Vietnam-local dates across UTC day boundaries', () => {
    const rows = calendarDaySummaries([
      tx({ amount: 10_000, occurredAt: '2026-06-30T17:30:00.000Z' }),
    ], '2026-07');

    expect(rows[0].date).toBe('2026-07-01');
    expect(rows[0].expenseTotal).toBe(10_000);
  });

  it('selects today for the current month', () => {
    expect(initialSelectedDate('2026-07', [
      tx({ occurredAt: '2026-07-03T05:00:00.000Z' }),
    ], '2026-07-07')).toBe('2026-07-07');
  });

  it('selects the first transaction day for a non-current month', () => {
    expect(initialSelectedDate('2026-06', [
      tx({ occurredAt: '2026-06-12T05:00:00.000Z' }),
      tx({ occurredAt: '2026-06-03T05:00:00.000Z' }),
    ], '2026-07-07')).toBe('2026-06-03');
  });

  it('selects the first day when a non-current month has no transactions', () => {
    expect(initialSelectedDate('2026-06', [], '2026-07-07')).toBe('2026-06-01');
  });

  it('returns Monday-based weekday indexes', () => {
    expect(mondayWeekdayIndex('2026-07-06')).toBe(0);
    expect(mondayWeekdayIndex('2026-07-12')).toBe(6);
  });
});
