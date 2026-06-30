import { useTranslation } from 'react-i18next';
import { useOnline } from '../../hooks/useOnline';

export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="bg-amber-100 text-amber-900 text-sm px-4 py-1 text-center">
      {t('offline.banner')}
    </div>
  );
}
