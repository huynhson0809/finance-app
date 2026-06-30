import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category } from '../../types';
import type { BudgetStatus } from '../../reports';

export function BudgetAlert({
  overall, perCategoryOver, categoryLabel,
}: {
  overall: BudgetStatus;
  perCategoryOver: Category[];
  categoryLabel: (c: Category) => string;
}) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (overall !== 'over' && perCategoryOver.length === 0) return null;

  return (
    <div role="alert" className="m-4 p-3 rounded bg-red-50 border border-red-200 text-red-800">
      <div className="flex justify-between items-start">
        <div>
          <strong>{t('alerts.title')}</strong>
          {overall === 'over' && <div>{t('alerts.overall')}</div>}
          {perCategoryOver.length > 0 && (
            <div>
              {t('alerts.categories')}: {perCategoryOver.map(categoryLabel).join(', ')}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('alerts.dismiss')}
          className="ml-3 text-red-600 font-bold"
        >×</button>
      </div>
    </div>
  );
}
