import type { Transaction } from '../types';
import { todayVietnamDate } from '../lib/date';

export function dailyTotals(
  tx: Transaction[],
  monthISO: string,
): Array<{ date: string; total: number }> {
  const [y, m] = monthISO.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const totals = new Array(daysInMonth).fill(0);

  for (const t of tx) {
    const date = todayVietnamDate(new Date(t.occurredAt));
    if (date.slice(0, 7) !== monthISO) continue;
    const day = Number(date.slice(8, 10));
    totals[day - 1] += t.amount;
  }

  return totals.map((total, i) => ({
    date: `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    total,
  }));
}
