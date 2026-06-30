import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import type { BudgetStatus } from '../../reports';

export function BudgetBar({ spent, total, locale, status = 'ok' }: {
  spent: number; total: number; locale: 'vi' | 'en'; status?: BudgetStatus;
}) {
  const { t } = useTranslation();
  const ratio = total > 0 ? Math.min(spent / total, 1.2) : 0;
  const color = status === 'over' ? 'bg-red-500'
              : status === 'warn' ? 'bg-amber-500'
              : 'bg-blue-500';
  return (
    <div className="px-4 py-2">
      <div className="flex justify-between text-sm">
        <span>{formatVND(spent, locale)} / {formatVND(total, locale)}</span>
        <span>{t('home.remaining')}: {formatVND(Math.max(0, total - spent), locale)}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded mt-1 overflow-hidden">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
          role="progressbar"
          aria-label={t('home.budgetUsed')}
          aria-valuenow={Math.min(Math.round(ratio * 100), 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
