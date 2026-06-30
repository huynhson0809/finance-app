import { describe, it, expect } from 'vitest';
import { shouldRemindBackup } from '../../src/backup/reminder';

const NOW = new Date('2026-06-30T00:00:00.000Z');
const DAYS_30_AGO = new Date('2026-05-31T00:00:00.000Z').toISOString();
const DAYS_29_AGO = new Date('2026-06-01T00:00:00.000Z').toISOString();
const TODAY = new Date('2026-06-30T00:00:00.000Z').toISOString();

describe('shouldRemindBackup', () => {
  it('returns false when there are no transactions', () => {
    expect(shouldRemindBackup(undefined, 0, NOW)).toBe(false);
    expect(shouldRemindBackup(TODAY, 0, NOW)).toBe(false);
  });
  it('returns true when txCount > 0 and lastBackupAt is missing', () => {
    expect(shouldRemindBackup(undefined, 1, NOW)).toBe(true);
  });
  it('returns true when lastBackupAt is >= 30 days ago', () => {
    expect(shouldRemindBackup(DAYS_30_AGO, 1, NOW)).toBe(true);
  });
  it('returns false when lastBackupAt is < 30 days ago', () => {
    expect(shouldRemindBackup(DAYS_29_AGO, 1, NOW)).toBe(false);
  });
});
