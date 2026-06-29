import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';

export function BudgetBar({
  spent, total, locale,
}: { spent: number; total: number; locale: 'vi' | 'en' }) {
  const { t } = useTranslation();
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  const remaining = Math.max(0, total - spent);
  return (
    <div className="p-4">
      <div className="flex justify-between text-sm">
        <span>{t('home.remaining')}</span>
        <span>{formatVND(remaining, locale)}</span>
      </div>
      <div className="mt-2 h-3 bg-gray-200 rounded">
        <div
          className={`h-3 rounded ${pct >= 100 ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-label={t('home.remaining')}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
