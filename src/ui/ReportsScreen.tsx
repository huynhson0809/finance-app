import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCategoryOverrides } from '../hooks/useCategoryOverrides';
import { useCustomCategories } from '../hooks/useCustomCategories';
import { useReports } from '../hooks/useReports';
import { useScopedReportTransactions, type ScopedReportKind } from '../hooks/useScopedReportTransactions';
import {
  categoryDayTotals,
  categorySummaries,
  totalsByDirection,
  transactionDirection,
  type CategorySummary,
} from '../reports';
import { CategoryPie } from './components/Charts/CategoryPie';
import { MonthBar, type DailyDatum } from './components/Charts/MonthBar';
import { PeriodBar, type PeriodDatum } from './components/Charts/PeriodBar';
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
import { categoryLabel, getCategoryMeta } from './theme/categoryMeta';

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
const FALLBACK_CATEGORY_COLOR = '#94a3b8';

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function safeMonth(value: string | null): string {
  return value && VALID_MONTH.test(value) ? value : monthOfVietnamDate(todayVietnamDate());
}

const REPORT_MODE_LABELS = {
  'year-summary': 'reports.yearSummary',
  'year-category': 'reports.yearCategory',
  'all-summary': 'reports.allSummary',
  'all-category': 'reports.allCategory',
  'balance-change': 'reports.balanceChange',
  search: 'reports.search',
} as const;

type ReportMode = keyof typeof REPORT_MODE_LABELS;
type PeriodMetric = TransactionDirection | 'net';

function isReportMode(value: string | null): value is ReportMode {
  return value !== null && value in REPORT_MODE_LABELS;
}

function transactionTitle(transaction: Transaction): string {
  return transaction.merchant?.trim() || transaction.note?.trim() || transaction.category;
}

function signedAmount(transaction: Transaction): number {
  return transactionDirection(transaction) === 'income' ? transaction.amount : -transaction.amount;
}

function scopeForReportMode(mode: ReportMode | null): ScopedReportKind {
  if (mode === null) return null;
  if (mode === 'all-summary' || mode === 'all-category' || mode === 'search') return 'all';
  return 'year';
}

function amountForMetric(transaction: Transaction, metric: PeriodMetric): number {
  if (metric === 'net') return signedAmount(transaction);
  return transactionDirection(transaction) === metric ? transaction.amount : 0;
}

function monthRowsForYear(
  transactions: Transaction[],
  year: number,
  metric: PeriodMetric,
): Array<PeriodDatum & { value: number }> {
  const totals = new Array<number>(12).fill(0);

  for (const transaction of transactions) {
    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (Number(date.slice(0, 4)) !== year) continue;
    const monthIndex = Number(date.slice(5, 7)) - 1;
    totals[monthIndex] += amountForMetric(transaction, metric);
  }

  return totals.map((value, index) => ({
    label: `T${index + 1}`,
    value,
    total: Math.abs(value),
  }));
}

function yearRowsForAllTime(
  transactions: Transaction[],
  metric: PeriodMetric,
): Array<PeriodDatum & { value: number }> {
  const totals = new Map<number, number>();

  for (const transaction of transactions) {
    const year = Number(todayVietnamDate(new Date(transaction.occurredAt)).slice(0, 4));
    totals.set(year, (totals.get(year) ?? 0) + amountForMetric(transaction, metric));
  }

  return Array.from(totals, ([year, value]) => ({
    label: String(year),
    value,
    total: Math.abs(value),
  })).sort((a, b) => a.label.localeCompare(b.label));
}

function monthRowsForCategory(
  transactions: Transaction[],
  year: number,
  direction: TransactionDirection,
  category: Category,
): Array<PeriodDatum & { value: number }> {
  const totals = new Array<number>(12).fill(0);

  for (const transaction of transactions) {
    if (transactionDirection(transaction) !== direction) continue;
    if (transaction.category !== category) continue;
    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (Number(date.slice(0, 4)) !== year) continue;
    const monthIndex = Number(date.slice(5, 7)) - 1;
    totals[monthIndex] += transaction.amount;
  }

  return totals.map((value, index) => ({
    label: `T${index + 1}`,
    value,
    total: value,
  }));
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
  const direction: TransactionDirection = searchParams.get('direction') === 'income' ? 'income' : 'expense';
  const selectedCategory: Category | null = (searchParams.get('category') as Category) || null;
  const [transactionSearch, setTransactionSearch] = useState('');
  const month = safeMonth(searchParams.get('month'));
  const rawReportMode = searchParams.get('mode');
  const reportMode = isReportMode(rawReportMode) ? rawReportMode : null;
  const reportModeLabel = reportMode ? t(REPORT_MODE_LABELS[reportMode]) : null;
  const reportScope = scopeForReportMode(reportMode);
  const { loading, error, reload, transactions, daily, directionTotals, anomalyHints, bStatus } = useReports(month);
  const scopedReport = useScopedReportTransactions(reportScope, month);
  const { categories: customCategories } = useCustomCategories();
  const { overrides: categoryOverrides } = useCategoryOverrides();
  const reportLoading = reportScope ? scopedReport.loading : loading;
  const reportError = reportScope ? scopedReport.error : error;
  const reportTransactions = reportScope ? scopedReport.transactions : transactions;
  const reportDirectionTotals = useMemo(
    () => reportScope ? totalsByDirection(reportTransactions) : directionTotals,
    [directionTotals, reportScope, reportTransactions],
  );
  const reportAvailable = !reportLoading && !reportError;
  const year = Number(month.slice(0, 4));
  const isPeriodSummaryReport = reportMode === 'year-summary' || reportMode === 'balance-change';
  const isAllSummaryReport = reportMode === 'all-summary';
  const isSummaryReport = isPeriodSummaryReport || isAllSummaryReport;
  const selectedDirectionLabel = t(`direction.${direction}`).toLowerCase();
  const noDirectionDataLabel = t('reports.noDirectionData', { direction: selectedDirectionLabel });

  const categoryRows = useMemo(
    () => {
      const rows = categorySummaries(reportTransactions, direction);
      const existingCategories = new Set(rows.map(row => row.category));
      const customTotals = new Map<Category, number>();

      for (const transaction of reportTransactions) {
        if (transactionDirection(transaction) !== direction) continue;
        if (!categoryBelongsToDirection(transaction.category, direction)) continue;
        if (existingCategories.has(transaction.category)) continue;

        customTotals.set(
          transaction.category,
          (customTotals.get(transaction.category) ?? 0) + transaction.amount,
        );
      }

      if (customTotals.size === 0) return rows;

      const directionTotal = rows.reduce((total, row) => total + row.total, 0)
        + Array.from(customTotals.values()).reduce((total, value) => total + value, 0);
      const customRows: CategorySummary[] = Array.from(customTotals, ([category, total]) => ({
        category,
        direction,
        total,
        percentage: directionTotal > 0 ? total / directionTotal : 0,
      }));

      return [...rows, ...customRows];
    },
    [reportTransactions, direction],
  );

  const overviewDaily = useMemo(
    () => direction === 'expense'
      ? daily
      : directionDailyTotals(reportTransactions, month, direction),
    [daily, direction, reportTransactions, month],
  );

  const periodMetric: PeriodMetric = reportMode === 'balance-change' ? 'net' : direction;
  const periodRows = useMemo(
    () => reportScope === 'all'
      ? yearRowsForAllTime(reportTransactions, periodMetric)
      : monthRowsForYear(reportTransactions, year, periodMetric),
    [periodMetric, reportScope, reportTransactions, year],
  );
  const periodTotal = periodRows.reduce((sum, row) => sum + row.value, 0);
  const periodAverage = periodRows.length > 0 ? Math.round(periodTotal / periodRows.length) : 0;

  const effectiveCategory = selectedCategory && categoryBelongsToDirection(selectedCategory, direction)
    ? selectedCategory
    : null;

  const selectedSummary = effectiveCategory
    ? categoryRows.find(row => row.category === effectiveCategory)
    : undefined;

  const detailDaily = useMemo(
    () => effectiveCategory
      ? categoryDayTotals(reportTransactions, month, direction, effectiveCategory)
      : [],
    [reportTransactions, month, direction, effectiveCategory],
  );

  const detailPeriodRows = useMemo(
    () => effectiveCategory && reportScope === 'year'
      ? monthRowsForCategory(reportTransactions, year, direction, effectiveCategory)
      : [],
    [direction, reportScope, reportTransactions, effectiveCategory, year],
  );

  const detailTransactions = useMemo(
    () => effectiveCategory
      ? reportTransactions
        .filter(transaction => (
          transactionDirection(transaction) === direction &&
          transaction.category === effectiveCategory &&
          (reportScope ? true : monthOfVietnamDate(transaction.occurredAt) === month)
        ))
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      : [],
    [reportTransactions, reportScope, month, direction, effectiveCategory],
  );

  const searchTransactions = useMemo(() => {
    const normalizedQuery = transactionSearch.trim().toLowerCase();
    const newestFirst = [...reportTransactions]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    if (!normalizedQuery) return newestFirst;

    return newestFirst.filter(transaction => {
      const label = categoryLabel(transaction.category, customCategories, t, categoryOverrides);
      const values = [
        transaction.merchant,
        transaction.note,
        transaction.bankHint,
        transaction.bank,
        String(transaction.amount),
        formatVND(transaction.amount, locale),
        formatVND(signedAmount(transaction), locale),
        transaction.category,
        label,
      ];

      return values.some(value => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [categoryOverrides, customCategories, locale, t, transactionSearch, reportTransactions]);

  const pieData = useMemo(
    () => categoryRows.map(row => ({
      category: row.category,
      total: row.total,
      label: categoryLabel(row.category, customCategories, t, categoryOverrides),
      color: CATEGORY_COLORS[row.category] ?? FALLBACK_CATEGORY_COLOR,
    })),
    [categoryOverrides, categoryRows, customCategories, t],
  );

  const perCategoryOver = useMemo(
    () => EXPENSE_CATEGORIES.filter(c => bStatus.perCategory[c] === 'over'),
    [bStatus],
  );

  function step(direction: -1 | 1) {
    const next = direction === -1 ? prevMonth(month) : nextMonth(month);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('month', next);
    setSearchParams(nextParams);
  }

  function retryReports() {
    void (reportScope ? scopedReport.reload() : reload());
  }

  function setDirection(next: TransactionDirection) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('direction', next);
    nextParams.delete('category');
    setSearchParams(nextParams, { replace: true });
  }

  function setSelectedCategory(category: Category | null) {
    const nextParams = new URLSearchParams(searchParams);
    if (category) {
      nextParams.set('category', category);
    } else {
      nextParams.delete('category');
    }
    setSearchParams(nextParams, { replace: true });
  }

  function currentReportUrl(): string {
    const params = new URLSearchParams();
    params.set('month', month);
    if (direction !== 'expense') params.set('direction', direction);
    if (reportMode) params.set('mode', reportMode);
    if (effectiveCategory) params.set('category', effectiveCategory);
    return `/reports?${params.toString()}`;
  }

  function renderTransactionRow(transaction: Transaction) {
    const title = transactionTitle(transaction);
    const label = categoryLabel(transaction.category, customCategories, t, categoryOverrides);
    const meta = getCategoryMeta(transaction.category, customCategories, categoryOverrides);
    const Icon = meta.Icon;
    const direction = transactionDirection(transaction);
    const subtitle = [
      todayVietnamDate(new Date(transaction.occurredAt)),
      transaction.bankHint?.toUpperCase() ?? transaction.bank,
    ].filter(Boolean).join(' · ');

    return (
      <li key={transaction.id}>
        <Link
          to={`/transactions/${transaction.id}`}
          state={{ backTo: currentReportUrl() }}
          className="block active:bg-white/5"
        >
          <MoneyRow
            icon={<Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />}
            title={title === transaction.category ? label : title}
            subtitle={subtitle}
            amount={formatVND(signedAmount(transaction), locale)}
            tone={direction}
          />
        </Link>
      </li>
    );
  }

  return (
    <div className="space-y-4 pb-24 pt-4 text-slate-100">
      {effectiveCategory && !isSummaryReport && reportAvailable ? (
        <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            aria-label={t('reports.backToReports')}
            className="grid h-11 w-11 place-items-center rounded-full text-slate-100"
          >
            <ArrowLeft aria-hidden="true" className="h-7 w-7" />
          </button>
          <h1 className="truncate text-center text-xl font-bold text-white">
            {categoryLabel(effectiveCategory, customCategories, t, categoryOverrides)}
          </h1>
          <span aria-hidden="true" />
        </header>
      ) : (
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
      )}

      {reportModeLabel && (
        <div className="px-4">
          <div className="inline-flex min-h-8 items-center rounded-full border border-sky-300/30 bg-sky-400/10 px-3 text-sm font-semibold text-sky-100">
            {reportModeLabel}
          </div>
        </div>
      )}

      {reportError && (
        <div role="alert" className="mx-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div>{reportError}</div>
          <button
            type="button"
            className="mt-2 rounded-xl bg-rose-400 px-3 py-1 font-semibold text-slate-950"
            onClick={retryReports}
          >
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {reportLoading && (
        <div className="px-4 text-sm text-slate-400" role="status">
          {t('cloud.loading')}
        </div>
      )}

      {reportAvailable && (
        <>
          {!reportScope && (
            <BudgetAlert
              overall={bStatus.overall}
              perCategoryOver={perCategoryOver}
              categoryLabel={c => categoryLabel(c, customCategories, t, categoryOverrides)}
            />
          )}

          <section aria-label="Report totals" className="grid grid-cols-3 gap-2 px-4">
            <MetricCard
              label={t('reports.expenseTotal')}
              value={formatVND(reportDirectionTotals.expense, locale)}
              tone="expense"
            />
            <MetricCard
              label={t('reports.incomeTotal')}
              value={formatVND(reportDirectionTotals.income, locale)}
              tone="income"
            />
            <MetricCard
              label={t('reports.netTotal')}
              value={formatVND(reportDirectionTotals.net, locale)}
              tone="neutral"
            />
          </section>

          {reportMode !== 'balance-change' && (
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
          )}

          {isSummaryReport && (
            <section className="space-y-3 px-4">
              <GlassPanel className="p-3">
                <PeriodBar
                  data={periodRows}
                  color={periodMetric === 'income' ? '#34d399' : periodMetric === 'net' ? '#38bdf8' : '#fb7185'}
                />
              </GlassPanel>

              <GlassPanel className="overflow-hidden">
                <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4">
                  <span className="text-base font-bold text-white">{t('reports.total')}</span>
                  <span className="text-lg font-bold text-sky-300">{formatVND(periodTotal, locale)}</span>
                </div>
                {reportMode !== 'balance-change' && (
                  <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4">
                    <span className="text-base font-bold text-white">{t('reports.average')}</span>
                    <span className="text-lg font-bold text-sky-300">{formatVND(periodAverage, locale)}</span>
                  </div>
                )}
                {periodRows.map(row => (
                  <div
                    key={row.label}
                    className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 last:border-b-0"
                  >
                    <span className="text-base font-semibold text-white">
                      {reportScope === 'all' ? row.label : t('reports.monthName', { month: row.label.slice(1) })}
                    </span>
                    <span className="text-base font-bold text-slate-100">{formatVND(row.value, locale)}</span>
                  </div>
                ))}
              </GlassPanel>
            </section>
          )}

          {!isSummaryReport && reportMode === 'search' && (
            <section className="px-4">
              <GlassPanel className="space-y-3 p-4">
                <input
                  type="search"
                  value={transactionSearch}
                  onChange={event => setTransactionSearch(event.target.value)}
                  placeholder={t('reports.searchPlaceholder')}
                  aria-label={t('reports.search')}
                  className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50"
                />

                {searchTransactions.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-4 text-sm text-slate-400">
                    {t('reports.noSearchResults')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {searchTransactions.map(renderTransactionRow)}
                  </ul>
                )}
              </GlassPanel>
            </section>
          )}

          {!isSummaryReport && effectiveCategory ? (
            <section className="space-y-4">
              <GlassPanel className="mx-4 p-4">
                <div className="text-sm text-slate-400">
                  {t('reports.categoryDetailTitle', {
                    category: categoryLabel(effectiveCategory, customCategories, t, categoryOverrides),
                    month,
                  })}
                </div>
                <div className="mt-1 text-2xl font-bold text-sky-300">
                  {formatVND(selectedSummary?.total ?? 0, locale)}
                </div>
              </GlassPanel>

              <GlassPanel className="mx-4 p-3">
                {reportScope === 'year'
                  ? <PeriodBar data={detailPeriodRows} color={direction === 'income' ? '#34d399' : '#fb7185'} />
                  : <MonthBar data={detailDaily} />}
              </GlassPanel>

              {detailTransactions.length === 0 ? (
                <GlassPanel className="mx-4 border-dashed border-white/15 p-4 text-sm text-slate-400">
                  {t('reports.noCategoryTransactions')}
                </GlassPanel>
              ) : (
                <ul className="space-y-2 px-4">
                  {detailTransactions.map(renderTransactionRow)}
                </ul>
              )}
            </section>
          ) : !isSummaryReport && reportMode !== 'search' ? (
            <>
              <GlassPanel className="mx-4 p-3">
                <CategoryPie
                  data={pieData}
                  emptyLabel={noDirectionDataLabel}
                  locale={locale}
                />
              </GlassPanel>

              <GlassPanel className="mx-4 p-3">
                {reportScope === 'year'
                  ? <PeriodBar data={periodRows} color={direction === 'income' ? '#34d399' : '#fb7185'} />
                  : <MonthBar data={overviewDaily} />}
              </GlassPanel>

              {anomalyHints.length > 0 && (
                <section className="px-4">
                  <GlassPanel className="p-4">
                    <h2 className="text-sm uppercase text-slate-400">{t('reports.anomalies')}</h2>
                    <ul className="mt-2 space-y-1">
                      {anomalyHints.map(h => (
                        <li key={h.category} className="text-sm text-slate-200">
                          {t('reports.anomalyLine', {
                            category: categoryLabel(h.category, customCategories, t, categoryOverrides),
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
                        const meta = getCategoryMeta(row.category, customCategories, categoryOverrides);
                        const Icon = meta.Icon;
                        const label = categoryLabel(row.category, customCategories, t, categoryOverrides);

                        return (
                          <li key={row.category}>
                            <button
                              type="button"
                              className="w-full text-left"
                              onClick={() => setSelectedCategory(row.category)}
                            >
                              <MoneyRow
                                icon={<Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />}
                                title={label}
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
          ) : null}
        </>
      )}
    </div>
  );
}
