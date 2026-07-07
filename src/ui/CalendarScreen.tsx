import { useTranslation } from 'react-i18next';

export function CalendarScreen() {
  const { t } = useTranslation();
  return (
    <div className="p-4 pb-20">
      <h1 className="text-lg font-semibold">{t('calendar.title')}</h1>
    </div>
  );
}
