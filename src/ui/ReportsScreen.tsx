import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useReports } from '../hooks/useReports';
import { CategoryPie } from './components/Charts/CategoryPie';
import { MonthBar } from './components/Charts/MonthBar';
import { BudgetAlert } from './components/BudgetAlert';
import { monthOfVietnamDate, todayVietnamDate, prevMonth, nextMonth } from '../lib/date';
import { CATEGORIES, type Category } from '../types';
import { formatVND } from '../lib/money';

const CHART_COLORS: Record<Category, string> = {
  'food-drinks': '#ef4444',
  'coffee-bubble-tea': '#f59e0b',
  'transportation': '#3b82f6',
  'shopping': '#a855f7',
  'bills-utilities': '#10b981',
  'healthcare': '#ec4899',
  'entertainment': '#06b6d4',
  'transfers-debt': '#6b7280',
  'others': '#9ca3af',
};

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function safeMonth(value: string | null): string {
  return value && VALID_MONTH.test(value) ? value : monthOfVietnamDate(todayVietnamDate());
}

export function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const [searchParams, setSearchParams] = useSearchParams();
  const month = safeMonth(searchParams.get('month'));
  const { loading, error, reload, sums, daily, anomalyHints, bStatus } = useReports(month);
  const reportAvailable = !loading && !error;

  const pieData = useMemo(
    () => CATEGORIES.map(c => ({
      category: c, total: sums[c], label: t(`category.${c}`), color: CHART_COLORS[c],
    })),
    [sums, t],
  );

  const perCategoryOver = useMemo(
    () => CATEGORIES.filter(c => bStatus.perCategory[c] === 'over'),
    [bStatus],
  );

  function step(direction: -1 | 1) {
    const next = direction === -1 ? prevMonth(month) : nextMonth(month);
    setSearchParams({ month: next });
  }

  function retryReports() {
    void reload();
  }

  return (
    <div className="pb-20">
      <header className="flex items-center justify-between p-4">
        <button type="button" onClick={() => step(-1)} aria-label="prev-month">‹</button>
        <h1 className="text-lg">{month}</h1>
        <button type="button" onClick={() => step(1)} aria-label="next-month">›</button>
      </header>

      {error && (
        <div role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div>{error}</div>
          <button
            type="button"
            className="mt-2 rounded bg-red-600 px-3 py-1 text-white"
            onClick={retryReports}
          >
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {loading && (
        <div className="px-4 pb-3 text-sm text-gray-500" role="status">
          {t('cloud.loading')}
        </div>
      )}

      {reportAvailable && (
        <>
          <BudgetAlert
            overall={bStatus.overall}
            perCategoryOver={perCategoryOver}
            categoryLabel={c => t(`category.${c}`)}
          />

          <section className="px-2">
            <CategoryPie data={pieData} />
          </section>

          <section className="px-2 mt-4">
            <MonthBar data={daily} />
          </section>

          {anomalyHints.length > 0 && (
            <section className="px-4 mt-4">
              <h2 className="text-sm uppercase text-gray-500">{t('reports.anomalies')}</h2>
              <ul className="mt-2 space-y-1">
                {anomalyHints.map(h => (
                  <li key={h.category} className="text-sm">
                    {t('reports.anomalyLine', {
                      category: t(`category.${h.category}`),
                      pct: Math.min(Math.round(h.deltaPct * 100), 999),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="px-4 mt-6">
            <h2 className="text-sm uppercase text-gray-500">{t('reports.byCategory')}</h2>
            <ul className="mt-2 space-y-2">
              {CATEGORIES.map(c => {
                const s = bStatus.perCategory[c];
                const barColor = s === 'over' ? 'bg-red-500'
                               : s === 'warn' ? 'bg-amber-500'
                               : 'bg-blue-500';
                const showBar = s === 'over' || s === 'warn';
                const barWidth = s === 'over' ? '100%' : s === 'warn' ? '90%' : '0%';
                return (
                  <li key={c}>
                    <div className="flex justify-between text-sm">
                      <span>{t(`category.${c}`)}</span>
                      <span>{formatVND(sums[c], locale)}</span>
                    </div>
                    {showBar && (
                      <div className="h-1 bg-gray-200 rounded mt-1 overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: barWidth }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
