import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useReports } from '../hooks/useReports';
import { categoryDayTotals, categorySummaries, transactionDirection } from '../reports';
import { CategoryPie } from './components/Charts/CategoryPie';
import { MonthBar, type DailyDatum } from './components/Charts/MonthBar';
import { BudgetAlert } from './components/BudgetAlert';
import { monthOfVietnamDate, todayVietnamDate, prevMonth, nextMonth } from '../lib/date';
import {
  categoryBelongsToDirection,
  EXPENSE_CATEGORIES,
  type Category,
  type Transaction,
  type TransactionDirection,
} from '../types';
import { formatVND } from '../lib/money';
import { GlassPanel, MetricCard, MoneyRow, SegmentedControl } from './components/primitives';
import { CATEGORY_META } from './theme/categoryMeta';

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

function transactionTitle(transaction: Transaction): string {
  return transaction.merchant?.trim() || transaction.note?.trim() || transaction.category;
}

function signedAmount(transaction: Transaction): number {
  return transactionDirection(transaction) === 'income' ? transaction.amount : -transaction.amount;
}

function directionDailyTotals(
  transactions: Transaction[],
  monthISO: string,
  direction: TransactionDirection,
): DailyDatum[] {
  const [year, month] = monthISO.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totals = new Array<number>(daysInMonth).fill(0);

  for (const transaction of transactions) {
    if (transactionDirection(transaction) !== direction) continue;

    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (date.slice(0, 7) !== monthISO) continue;

    const day = Number(date.slice(8, 10));
    totals[day - 1] += transaction.amount;
  }

  return totals.map((total, index) => ({
    date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    total,
  }));
}

export function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const [searchParams, setSearchParams] = useSearchParams();
  const [direction, setDirection] = useState<TransactionDirection>('expense');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const month = safeMonth(searchParams.get('month'));
  const { loading, error, reload, transactions, daily, directionTotals, anomalyHints, bStatus } = useReports(month);
  const reportAvailable = !loading && !error;
  const selectedDirectionLabel = t(`direction.${direction}`).toLowerCase();
  const noDirectionDataLabel = t('reports.noDirectionData', { direction: selectedDirectionLabel });

  const categoryRows = useMemo(
    () => categorySummaries(transactions, direction),
    [transactions, direction],
  );

  const overviewDaily = useMemo(
    () => direction === 'expense'
      ? daily
      : directionDailyTotals(transactions, month, direction),
    [daily, direction, transactions, month],
  );

  useEffect(() => {
    if (selectedCategory && !categoryBelongsToDirection(selectedCategory, direction)) {
      setSelectedCategory(null);
    }
  }, [direction, selectedCategory]);

  const selectedSummary = selectedCategory
    ? categoryRows.find(row => row.category === selectedCategory)
    : undefined;

  const detailDaily = useMemo(
    () => selectedCategory
      ? categoryDayTotals(transactions, month, direction, selectedCategory)
      : [],
    [transactions, month, direction, selectedCategory],
  );

  const detailTransactions = useMemo(
    () => selectedCategory
      ? transactions
        .filter(transaction => (
          transactionDirection(transaction) === direction &&
          transaction.category === selectedCategory &&
          monthOfVietnamDate(transaction.occurredAt) === month
        ))
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      : [],
    [transactions, month, direction, selectedCategory],
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
    <div className="space-y-4 pb-24 pt-4 text-slate-100">
      <header className="flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="prev-month"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-2xl leading-none text-slate-100 shadow-sm"
        >
          ‹
        </button>
        <h1 className="text-xl font-bold text-white">{month}</h1>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="next-month"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-2xl leading-none text-slate-100 shadow-sm"
        >
          ›
        </button>
      </header>

      {error && (
        <div role="alert" className="mx-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div>{error}</div>
          <button
            type="button"
            className="mt-2 rounded-xl bg-rose-400 px-3 py-1 font-semibold text-slate-950"
            onClick={retryReports}
          >
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {loading && (
        <div className="px-4 text-sm text-slate-400" role="status">
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

          <section aria-label="Report totals" className="grid grid-cols-3 gap-2 px-4">
            <MetricCard
              label={t('reports.expenseTotal')}
              value={formatVND(directionTotals.expense, locale)}
              tone="expense"
            />
            <MetricCard
              label={t('reports.incomeTotal')}
              value={formatVND(directionTotals.income, locale)}
              tone="income"
            />
            <MetricCard
              label={t('reports.netTotal')}
              value={formatVND(directionTotals.net, locale)}
              tone="neutral"
            />
          </section>

          <section className="px-4">
            <SegmentedControl<TransactionDirection>
              ariaLabel="Report direction"
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'expense', label: t('reports.expenseTab') },
                { value: 'income', label: t('reports.incomeTab') },
              ]}
            />
          </section>

          {selectedCategory ? (
            <section className="space-y-4 px-4">
              <button
                type="button"
                className="text-sm font-semibold text-sky-300"
                onClick={() => setSelectedCategory(null)}
              >
                {t('reports.backToReports')}
              </button>

              <GlassPanel className="p-4">
                <h2 className="text-lg font-semibold text-white">
                  {t('reports.categoryDetailTitle', {
                    category: t(`category.${selectedCategory}`),
                    month,
                  })}
                </h2>
                <div className="mt-1 text-2xl font-bold text-sky-300">
                  {formatVND(selectedSummary?.total ?? 0, locale)}
                </div>
              </GlassPanel>

              <GlassPanel className="p-3">
                <MonthBar data={detailDaily} />
              </GlassPanel>

              {detailTransactions.length === 0 ? (
                <GlassPanel className="border-dashed border-white/15 p-4 text-sm text-slate-400">
                  {t('reports.noCategoryTransactions')}
                </GlassPanel>
              ) : (
                <ul className="space-y-2">
                  {detailTransactions.map(transaction => {
                    const title = transactionTitle(transaction);
                    const meta = CATEGORY_META[transaction.category];
                    const Icon = meta.Icon;
                    const direction = transactionDirection(transaction);
                    const subtitle = [
                      todayVietnamDate(new Date(transaction.occurredAt)),
                      transaction.bankHint?.toUpperCase(),
                    ].filter(Boolean).join(' · ');

                    return (
                      <MoneyRow
                        key={transaction.id}
                        as="li"
                        icon={<Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />}
                        title={title === transaction.category ? t(`category.${transaction.category}`) : title}
                        subtitle={subtitle}
                        amount={formatVND(signedAmount(transaction), locale)}
                        tone={direction}
                      />
                    );
                  })}
                </ul>
              )}
            </section>
          ) : (
            <>
              <GlassPanel className="mx-4 p-3">
                <CategoryPie
                  data={pieData}
                  emptyLabel={noDirectionDataLabel}
                />
              </GlassPanel>

              <GlassPanel className="mx-4 p-3">
                <MonthBar data={overviewDaily} />
              </GlassPanel>

              {anomalyHints.length > 0 && (
                <section className="px-4">
                  <GlassPanel className="p-4">
                    <h2 className="text-sm uppercase text-slate-400">{t('reports.anomalies')}</h2>
                    <ul className="mt-2 space-y-1">
                      {anomalyHints.map(h => (
                        <li key={h.category} className="text-sm text-slate-200">
                          {t('reports.anomalyLine', {
                            category: t(`category.${h.category}`),
                            pct: Math.min(Math.round(h.deltaPct * 100), 999),
                          })}
                        </li>
                      ))}
                    </ul>
                  </GlassPanel>
                </section>
              )}

              <section className="px-4">
                <GlassPanel className="p-4">
                  <h2 className="text-sm uppercase text-slate-400">{t('reports.byCategory')}</h2>
                  {categoryRows.length === 0 ? (
                    <p className="mt-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-4 text-sm text-slate-400">
                      {noDirectionDataLabel}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {categoryRows.map(row => {
                        const meta = CATEGORY_META[row.category];
                        const Icon = meta.Icon;

                        return (
                          <li key={row.category}>
                            <button
                              type="button"
                              className="w-full text-left"
                              onClick={() => setSelectedCategory(row.category)}
                            >
                              <MoneyRow
                                icon={<Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />}
                                title={t(`category.${row.category}`)}
                                subtitle={`${Math.round(row.percentage * 100)}%`}
                                amount={formatVND(row.total, locale)}
                                tone={direction}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </GlassPanel>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
