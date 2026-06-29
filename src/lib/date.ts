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
