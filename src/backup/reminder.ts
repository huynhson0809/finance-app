const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function shouldRemindBackup(
  lastBackupAt: string | undefined,
  txCount: number,
  now: Date,
): boolean {
  if (txCount === 0) return false;
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= THIRTY_DAYS_MS;
}
