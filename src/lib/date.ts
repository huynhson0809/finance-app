/** Returns ISO string for local midnight on the first day of the month containing `iso`. */
export function monthStartISO(iso: string): string {
  const d = new Date(iso);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return start.toISOString();
}

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

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

export function todayVietnamDate(now = new Date()): string {
  return vietnamDateString(now);
}

export function dateInputValueForVietnam(now = new Date()): string {
  return vietnamDateString(now);
}

export function datetimeInputValueForVietnam(now = new Date()): string {
  const shifted = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function vietnamDateInputToNoonISO(dateInput: string): string {
  const [year, month, day] = dateInput.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day, 12, 0, 0, 0) - VIETNAM_UTC_OFFSET_MS;
  return new Date(utc).toISOString();
}

export function vietnamDatetimeInputToISO(datetimeInput: string): string {
  return new Date(`${datetimeInput}:00+07:00`).toISOString();
}

export function monthOfVietnamDate(input: string | Date): string {
  return vietnamDateString(input).slice(0, 7);
}

export function isSameVietnamDay(a: string | Date, b: string | Date): boolean {
  return vietnamDateString(a) === vietnamDateString(b);
}

/** Returns UTC instants for Vietnam local midnight boundaries of the given month (YYYY-MM). */
export function monthRangeVietnamISO(monthISO: string): { sinceISO: string; untilISO: string } {
  const [y, m] = monthISO.split('-').map(Number);
  const since = Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - VIETNAM_UTC_OFFSET_MS;
  const until = Date.UTC(y, m, 1, 0, 0, 0, 0) - VIETNAM_UTC_OFFSET_MS;
  return { sinceISO: new Date(since).toISOString(), untilISO: new Date(until).toISOString() };
}

export function yearRangeVietnamISO(year: number): { sinceISO: string; untilISO: string } {
  const since = Date.UTC(year, 0, 1, 0, 0, 0, 0) - VIETNAM_UTC_OFFSET_MS;
  const until = Date.UTC(year + 1, 0, 1, 0, 0, 0, 0) - VIETNAM_UTC_OFFSET_MS;
  return { sinceISO: new Date(since).toISOString(), untilISO: new Date(until).toISOString() };
}

function vietnamDateString(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const shifted = new Date(date.getTime() + VIETNAM_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export function nextMonth(monthISO: string): string {
  const [y, m] = monthISO.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
