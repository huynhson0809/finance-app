import { useTranslation } from 'react-i18next';

export function SettingsScreen() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-2xl">{t('settings.title')}</h1>;
}
