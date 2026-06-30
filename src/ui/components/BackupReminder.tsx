import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useBackupReminder } from '../../hooks/useBackupReminder';

export function BackupReminder() {
  const { t } = useTranslation();
  const { show, dismiss } = useBackupReminder();
  if (!show) return null;
  return (
    <div role="status" className="mx-4 my-3 p-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between">
      <span>{t('backup.reminderMessage')}</span>
      <div className="flex items-center gap-3">
        <Link to="/settings" className="font-semibold underline">{t('backup.reminderCta')}</Link>
        <button type="button" onClick={dismiss} aria-label={t('backup.dismiss')}>×</button>
      </div>
    </div>
  );
}
