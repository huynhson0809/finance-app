import { useTranslation } from 'react-i18next';

export function HomeScreen() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-2xl">{t('home.todaySpend')}</h1>;
}
