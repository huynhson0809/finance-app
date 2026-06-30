import { useCallback, useEffect, useState } from 'react';
import { getSetting } from '../db/settings';
import { listTransactions } from '../db/transactions';
import { shouldRemindBackup } from '../backup/reminder';

export function useBackupReminder(): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSetting<string>('lastBackupAt'),
      listTransactions({ limit: 1 }),
    ]).then(([lastBackupAt, recent]) => {
      if (cancelled) return;
      const txCount = recent.length;
      setShow(shouldRemindBackup(lastBackupAt, txCount, new Date()));
    }).catch(err => console.error('useBackupReminder load failed', err));
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { show: show && !dismissed, dismiss };
}
