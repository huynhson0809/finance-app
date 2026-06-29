import { useTranslation } from 'react-i18next';

export default function App() {
  const { t } = useTranslation();
  return <div className="p-4 text-xl">{t('app.title')}</div>;
}
