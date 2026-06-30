import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useReports } from '../hooks/useReports';
import { CategoryPie } from './components/Charts/CategoryPie';
import { MonthBar } from './components/Charts/MonthBar';
import { BudgetAlert } from './components/BudgetAlert';
import { monthOf, todayISO, prevMonth } from '../lib/date';
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

function nextMonth(monthISO: string): string {
  const [y, m] = monthISO.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMonth = searchParams.get('month') ?? monthOf(todayISO());
  const [month, setMonth] = useState(initialMonth);
  const { sums, daily, anomalyHints, bStatus } = useReports(month);

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
    setMonth(next);
    setSearchParams({ month: next });
  }

  return (
    <div className="pb-20">
      <header className="flex items-center justify-between p-4">
        <button type="button" onClick={() => step(-1)} aria-label="prev-month">‹</button>
        <h1 className="text-lg">{month}</h1>
        <button type="button" onClick={() => step(1)} aria-label="next-month">›</button>
      </header>

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
                  pct: Math.round(h.deltaPct * 100),
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
                           : s === 'warn' ? 'bg-amber-500' : 'bg-blue-500';
            return (
              <li key={c}>
                <div className="flex justify-between text-sm">
                  <span>{t(`category.${c}`)}</span>
                  <span>{formatVND(sums[c], locale)}</span>
                </div>
                <div className="h-1 bg-gray-200 rounded mt-1 overflow-hidden">
                  <div className={`h-full ${barColor}`} style={{ width: '100%' }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
