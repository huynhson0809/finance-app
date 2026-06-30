import type { Transaction } from '../types';

export function dailyTotals(
  tx: Transaction[],
  monthISO: string,
): Array<{ date: string; total: number }> {
  const [y, m] = monthISO.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const totals = new Array(daysInMonth).fill(0);

  for (const t of tx) {
    const d = new Date(t.occurredAt);
    if (d.getFullYear() !== y || d.getMonth() !== m - 1) continue;
    totals[d.getDate() - 1] += t.amount;
  }

  return totals.map((total, i) => ({
    date: `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    total,
  }));
}
