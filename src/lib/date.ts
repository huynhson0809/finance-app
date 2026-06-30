/** Returns ISO string for local midnight on the first day of the month containing `iso`. */
export function monthStartISO(iso: string): string {
  const d = new Date(iso);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return start.toISOString();
}

export function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function prevMonth(monthISO: string): string {
  const [y, m] = monthISO.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Returns ISO strings for local midnight at the start and end of the given month (YYYY-MM). */
export function monthRangeISO(monthISO: string): { sinceISO: string; untilISO: string } {
  const [y, m] = monthISO.split('-').map(Number);
  const since = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const until = new Date(y, m, 1, 0, 0, 0, 0);
  return { sinceISO: since.toISOString(), untilISO: until.toISOString() };
}
