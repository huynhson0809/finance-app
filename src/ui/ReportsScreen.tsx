import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useReports } from '../hooks/useReports';
import { categorySummaries } from '../reports';
import { CategoryPie } from './components/Charts/CategoryPie';
import { MonthBar } from './components/Charts/MonthBar';
import { BudgetAlert } from './components/BudgetAlert';
import { monthOfVietnamDate, todayVietnamDate, prevMonth, nextMonth } from '../lib/date';
import { EXPENSE_CATEGORIES, type Category, type TransactionDirection } from '../types';
import { formatVND } from '../lib/money';

const CATEGORY_COLORS: Record<Category, string> = {
  'food-drinks': '#ef4444',
  'coffee-bubble-tea': '#f59e0b',
  transportation: '#3b82f6',
  shopping: '#a855f7',
  'bills-utilities': '#10b981',
  healthcare: '#ec4899',
  entertainment: '#06b6d4',
  'transfers-debt': '#6b7280',
  others: '#9ca3af',
  salary: '#22c55e',
  allowance: '#14b8a6',
  bonus: '#f97316',
  'side-income': '#06b6d4',
  investment: '#8b5cf6',
  'temporary-income': '#f472b6',
};

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function safeMonth(value: string | null): string {
  return value && VALID_MONTH.test(value) ? value : monthOfVietnamDate(todayVietnamDate());
}

export function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const [searchParams, setSearchParams] = useSearchParams();
  const [direction, setDirection] = useState<TransactionDirection>('expense');
  const month = safeMonth(searchParams.get('month'));
  const { loading, error, reload, transactions, daily, directionTotals, anomalyHints, bStatus } = useReports(month);
  const reportAvailable = !loading && !error;
  const selectedDirectionLabel = t(`direction.${direction}`).toLowerCase();
  const noDirectionDataLabel = t('reports.noDirectionData', { direction: selectedDirectionLabel });

  const categoryRows = useMemo(
    () => categorySummaries(transactions, direction),
    [transactions, direction],
  );

  const pieData = useMemo(
    () => categoryRows.map(row => ({
      category: row.category,
      total: row.total,
      label: t(`category.${row.category}`),
      color: CATEGORY_COLORS[row.category],
    })),
    [categoryRows, t],
  );

  const perCategoryOver = useMemo(
    () => EXPENSE_CATEGORIES.filter(c => bStatus.perCategory[c] === 'over'),
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

          <section className="grid grid-cols-3 gap-2 px-4 pb-4">
            <div>
              <div className="text-xs uppercase text-gray-500">{t('reports.expenseTotal')}</div>
              <div className="text-sm font-semibold">{formatVND(directionTotals.expense, locale)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500">{t('reports.incomeTotal')}</div>
              <div className="text-sm font-semibold">{formatVND(directionTotals.income, locale)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500">{t('reports.netTotal')}</div>
              <div className="text-sm font-semibold">{formatVND(directionTotals.net, locale)}</div>
            </div>
          </section>

          <section className="mx-4 mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
            {(['expense', 'income'] as const).map(value => (
              <button
                key={value}
                type="button"
                aria-pressed={direction === value}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  direction === value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                }`}
                onClick={() => setDirection(value)}
              >
                {value === 'expense' ? t('reports.expenseTab') : t('reports.incomeTab')}
              </button>
            ))}
          </section>

          <section className="px-2">
            <CategoryPie
              data={pieData}
              emptyLabel={noDirectionDataLabel}
            />
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
            {categoryRows.length === 0 ? (
              <p className="mt-2 rounded-lg border border-gray-100 bg-white px-3 py-4 text-sm text-gray-500">
                {noDirectionDataLabel}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {categoryRows.map(row => {
                  const categoryLabel = t(`category.${row.category}`);
                  return (
                    <li key={row.category}>
                      <div className="flex w-full items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-3 text-left shadow-sm">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[row.category] }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-900">{categoryLabel}</div>
                          <div className="text-xs text-gray-500">
                            {t('reports.categoryShare', { pct: Math.round(row.percentage * 100) })}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatVND(row.total, locale)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
