import { useTranslation } from 'react-i18next';

export function AddScreen() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-2xl">{t('add.title')}</h1>;
}
