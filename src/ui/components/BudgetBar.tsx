import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import type { BudgetStatus } from '../../reports';

export function BudgetBar({ spent, total, locale, status = 'ok' }: {
  spent: number; total: number; locale: 'vi' | 'en'; status?: BudgetStatus;
}) {
  const { t } = useTranslation();
  const ratio = total > 0 ? Math.min(spent / total, 1.2) : 0;
  const color = status === 'over' ? 'bg-rose-400'
              : status === 'warn' ? 'bg-amber-300'
              : 'bg-sky-400';
  return (
    <div className="px-4 py-3">
      <div className="flex justify-between gap-3 text-xs text-slate-300">
        <span className="truncate">{formatVND(spent, locale)} / {formatVND(total, locale)}</span>
        <span className="shrink-0">{t('home.remaining')}: {formatVND(Math.max(0, total - spent), locale)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
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
