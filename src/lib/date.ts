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

export function monthRangeISO(monthISO: string): { sinceISO: string; untilISO: string } {
  const [y, m] = monthISO.split('-').map(Number);
  // Format as ISO 8601 string representing local midnight
  // Note: This represents the local date/time, not accounting for timezone offset
  const sinceISO = `${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`;
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const untilISO = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`;
  return { sinceISO, untilISO };
}
