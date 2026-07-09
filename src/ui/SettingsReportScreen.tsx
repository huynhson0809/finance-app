import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCategoryOverrides } from '../hooks/useCategoryOverrides';
import { useCustomCategories } from '../hooks/useCustomCategories';
import { useScopedReportTransactions, type ScopedReportKind } from '../hooks/useScopedReportTransactions';
import { formatVND } from '../lib/money';
import { todayVietnamDate } from '../lib/date';
import {
  categoryBelongsToDirection,
  type Category,
  type Transaction,
  type TransactionDirection,
} from '../types';
import {
  categorySummaries,
  totalsByDirection,
  transactionDirection,
  type CategorySummary,
} from '../reports';
import { CategoryPie } from './components/Charts/CategoryPie';
import { PeriodBar, type PeriodDatum } from './components/Charts/PeriodBar';
import { GlassPanel, MetricCard, MoneyRow, SegmentedControl } from './components/primitives';
import { TransactionRow } from './components/TransactionRow';
import { categoryLabel, getCategoryMeta } from './theme/categoryMeta';

const REPORT_MODE_LABELS = {
  'year-summary': 'reports.yearSummary',
  'year-category': 'reports.yearCategory',
  'all-summary': 'reports.allSummary',
  'all-category': 'reports.allCategory',
  'balance-change': 'reports.balanceChange',
  search: 'reports.search',
} as const;

const CATEGORY_COLORS: Partial<Record<Category, string>> = {
  'food-drinks': '#f97316',
  'coffee-bubble-tea': '#38bdf8',
  transportation: '#60a5fa',
  shopping: '#fb7185',
  'bills-utilities': '#22d3ee',
  healthcare: '#6ee7b7',
  entertainment: '#facc15',
  'transfers-debt': '#94a3b8',
  others: '#c4b5fd',
  salary: '#34d399',
  allowance: '#2dd4bf',
  bonus: '#fb923c',
  'side-income': '#22d3ee',
  investment: '#a78bfa',
  'temporary-income': '#f9a8d4',
};

const FALLBACK_CATEGORY_COLOR = '#94a3b8';

type SettingsReportMode = keyof typeof REPORT_MODE_LABELS;
type PeriodMetric = TransactionDirection | 'net';

function isSettingsReportMode(value: string | undefined): value is SettingsReportMode {
  return Boolean(value && value in REPORT_MODE_LABELS);
}

function scopeForMode(mode: SettingsReportMode): ScopedReportKind {
  return mode === 'all-summary' || mode === 'all-category' || mode === 'search'
    ? 'all'
    : 'year';
}

function signedAmount(transaction: Transaction): number {
  return transactionDirection(transaction) === 'income' ? transaction.amount : -transaction.amount;
}

function amountForMetric(transaction: Transaction, metric: PeriodMetric): number {
  if (metric === 'net') return signedAmount(transaction);
  return transactionDirection(transaction) === metric ? transaction.amount : 0;
}

function yearRows(
  transactions: Transaction[],
  year: number,
  metric: PeriodMetric,
): Array<PeriodDatum & { value: number }> {
  const totals = new Array<number>(12).fill(0);

  for (const transaction of transactions) {
    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (Number(date.slice(0, 4)) !== year) continue;
    totals[Number(date.slice(5, 7)) - 1] += amountForMetric(transaction, metric);
  }

  return totals.map((value, index) => ({
    label: `T${index + 1}`,
    total: Math.abs(value),
    value,
  }));
}

function allTimeRows(
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
    total: Math.abs(value),
    value,
  })).sort((a, b) => a.label.localeCompare(b.label));
}

function categoryRowsWithCustom(
  transactions: Transaction[],
  direction: TransactionDirection,
): CategorySummary[] {
  const rows = categorySummaries(transactions, direction);
  const existingCategories = new Set(rows.map(row => row.category));
  const totals = new Map<Category, number>();
  let directionTotal = 0;

  for (const transaction of transactions) {
    if (transactionDirection(transaction) !== direction) continue;
    if (!categoryBelongsToDirection(transaction.category, direction)) continue;
    directionTotal += transaction.amount;

    if (existingCategories.has(transaction.category)) continue;
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
  }

  if (totals.size === 0) return rows;

  return [
    ...rows.map(row => ({
      ...row,
      percentage: directionTotal > 0 ? row.total / directionTotal : 0,
    })),
    ...Array.from(totals, ([category, total]) => ({
      category,
      direction,
      total,
      percentage: directionTotal > 0 ? total / directionTotal : 0,
    })),
  ];
}

function formatPeriodLabel(mode: SettingsReportMode, year: number, t: (key: string, options?: Record<string, unknown>) => string) {
  if (scopeForMode(mode) === 'all') return t('reports.allTimeRange');
  return t('reports.yearRange', { year });
}

function ReportValueRow({
  title,
  amount,
  tone = 'neutral',
}: {
  title: string;
  amount: string;
  tone?: 'income' | 'expense' | 'neutral';
}) {
  const toneClass = tone === 'income'
    ? 'text-emerald-300'
    : tone === 'expense'
      ? 'text-rose-300'
      : 'text-slate-50';

  return (
    <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 last:border-b-0">
      <span className="truncate text-base font-bold text-white">{title}</span>
      <span className={`text-base font-bold ${toneClass}`}>{amount}</span>
    </div>
  );
}

export function SettingsReportScreen() {
  const { mode: modeParam } = useParams();
  const mode = isSettingsReportMode(modeParam) ? modeParam : null;
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const [year, setYear] = useState(() => Number(todayVietnamDate().slice(0, 4)));
  const [direction, setDirection] = useState<TransactionDirection>('expense');
  const [search, setSearch] = useState('');
  const { categories: customCategories } = useCustomCategories();
  const { overrides: categoryOverrides } = useCategoryOverrides();
  const scope = mode ? scopeForMode(mode) : null;
  const report = useScopedReportTransactions(scope, `${year}-01`);

  const transactions = report.transactions;
  const totals = useMemo(() => totalsByDirection(transactions), [transactions]);
  const metric: PeriodMetric = mode === 'balance-change' ? 'net' : direction;
  const periodRows = useMemo(
    () => scope === 'all' ? allTimeRows(transactions, metric) : yearRows(transactions, year, metric),
    [metric, scope, transactions, year],
  );
  const periodTotal = periodRows.reduce((sum, row) => sum + row.value, 0);
  const periodAverage = periodRows.length > 0 ? Math.round(periodTotal / periodRows.length) : 0;
  const categoryRows = useMemo(
    () => categoryRowsWithCustom(transactions, direction),
    [direction, transactions],
  );
  const pieData = useMemo(
    () => categoryRows.map(row => ({
      category: row.category,
      total: row.total,
      label: categoryLabel(row.category, customCategories, t, categoryOverrides),
      color: CATEGORY_COLORS[row.category] ?? FALLBACK_CATEGORY_COLOR,
    })),
    [categoryOverrides, categoryRows, customCategories, t],
  );
  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const newest = [...transactions].sort((a, b) => (
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    ));
    if (!query) return newest;

    return newest.filter(transaction => {
      const label = categoryLabel(transaction.category, customCategories, t, categoryOverrides);
      return [
        transaction.merchant,
        transaction.note,
        transaction.bank,
        transaction.bankHint,
        transaction.category,
        label,
        String(transaction.amount),
        formatVND(transaction.amount, locale),
      ].some(value => value?.toLowerCase().includes(query));
    });
  }, [categoryOverrides, customCategories, locale, search, t, transactions]);

  if (!mode) return <Navigate to="/settings" replace />;

  const isCategoryReport = mode === 'year-category' || mode === 'all-category';
  const isSearchReport = mode === 'search';
  const isBalanceReport = mode === 'balance-change';
  const showDirectionTabs = !isBalanceReport && !isSearchReport;

  function retry() {
    void report.reload();
  }

  return (
    <div className="space-y-4 px-4 py-5 text-slate-100">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          aria-label={t('common.back')}
          className="grid h-11 w-11 place-items-center rounded-full text-slate-100"
        >
          <ArrowLeft aria-hidden="true" className="h-7 w-7" />
        </button>
        <h1 className="truncate text-center text-xl font-bold text-white">{t(REPORT_MODE_LABELS[mode])}</h1>
        <span aria-hidden="true" />
      </header>

      <div className="grid min-h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-2">
        {scope === 'year' ? (
          <button
            type="button"
            onClick={() => setYear(value => value - 1)}
            className="grid h-10 w-10 place-items-center rounded-full text-2xl text-slate-200"
            aria-label={t('reports.previousYear')}
          >
            ‹
          </button>
        ) : <span aria-hidden="true" />}
        <div className="text-center">
          <div className="text-xl font-bold text-white">{scope === 'year' ? year : t('reports.allTime')}</div>
          <div className="text-xs font-medium text-slate-400">{formatPeriodLabel(mode, year, t)}</div>
        </div>
        {scope === 'year' ? (
          <button
            type="button"
            onClick={() => setYear(value => value + 1)}
            className="grid h-10 w-10 place-items-center rounded-full text-2xl text-slate-200"
            aria-label={t('reports.nextYear')}
          >
            ›
          </button>
        ) : <span aria-hidden="true" />}
      </div>

      {report.error && (
        <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div>{report.error}</div>
          <button
            type="button"
            onClick={retry}
            className="mt-2 rounded-xl bg-rose-400 px-3 py-1 font-semibold text-slate-950"
          >
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {report.loading && (
        <div className="text-sm text-slate-400" role="status">
          {t('cloud.loading')}
        </div>
      )}

      {!report.loading && !report.error && (
        <>
          <section aria-label={t('reports.totals')} className="grid grid-cols-3 gap-2">
            <MetricCard label={t('reports.expenseTotal')} value={formatVND(totals.expense, locale)} tone="expense" />
            <MetricCard label={t('reports.incomeTotal')} value={formatVND(totals.income, locale)} tone="income" />
            <MetricCard label={t('reports.netTotal')} value={formatVND(totals.net, locale)} tone="neutral" />
          </section>

          {showDirectionTabs && (
            <SegmentedControl<TransactionDirection>
              ariaLabel={t('reports.direction')}
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'expense', label: t('reports.expenseTab') },
                { value: 'income', label: t('reports.incomeTab') },
              ]}
            />
          )}

          {isSearchReport ? (
            <GlassPanel className="space-y-3 p-4">
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={t('reports.searchPlaceholder')}
                aria-label={t('reports.search')}
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50"
              />
              {filteredTransactions.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-4 text-sm text-slate-400">
                  {t('reports.noSearchResults')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {filteredTransactions.map(transaction => (
                    <TransactionRow
                      key={transaction.id}
                      t={transaction}
                      locale={locale}
                      customCategories={customCategories}
                      categoryOverrides={categoryOverrides}
                    />
                  ))}
                </ul>
              )}
            </GlassPanel>
          ) : isCategoryReport ? (
            <>
              <GlassPanel className="p-3">
                <CategoryPie
                  data={pieData}
                  emptyLabel={t('reports.noDirectionData', {
                    direction: t(`direction.${direction}`).toLowerCase(),
                  })}
                  locale={locale}
                />
              </GlassPanel>
              <GlassPanel className="overflow-hidden">
                <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4">
                  <span className="text-base font-bold text-white">{t('reports.total')}</span>
                  <span className="text-lg font-bold text-sky-300">
                    {formatVND(categoryRows.reduce((sum, row) => sum + row.total, 0), locale)}
                  </span>
                </div>
                {categoryRows.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-slate-400">
                    {t('reports.noDirectionData', { direction: t(`direction.${direction}`).toLowerCase() })}
                  </div>
                ) : categoryRows.map(row => {
                  const meta = getCategoryMeta(row.category, customCategories, categoryOverrides);
                  const Icon = meta.Icon;
                  return (
                    <MoneyRow
                      key={row.category}
                      icon={<Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />}
                      title={categoryLabel(row.category, customCategories, t, categoryOverrides)}
                      subtitle={`${Math.round(row.percentage * 1000) / 10}%`}
                      amount={formatVND(row.total, locale)}
                      tone={direction}
                    />
                  );
                })}
              </GlassPanel>
            </>
          ) : (
            <>
              <GlassPanel className="p-3">
                <PeriodBar
                  data={periodRows}
                  color={metric === 'income' ? '#34d399' : metric === 'net' ? '#38bdf8' : '#fb7185'}
                />
              </GlassPanel>
              <GlassPanel className="overflow-hidden">
                <ReportValueRow
                  title={t('reports.total')}
                  amount={formatVND(periodTotal, locale)}
                  tone={metric === 'income' || periodTotal >= 0 ? 'income' : 'expense'}
                />
                {!isBalanceReport && (
                  <ReportValueRow
                    title={t('reports.average')}
                    amount={formatVND(periodAverage, locale)}
                    tone={metric === 'income' || periodAverage >= 0 ? 'income' : 'expense'}
                  />
                )}
                {periodRows.map(row => (
                  <ReportValueRow
                    key={row.label}
                    title={scope === 'all' ? row.label : t('reports.monthName', { month: row.label.slice(1) })}
                    amount={formatVND(row.value, locale)}
                    tone={row.value >= 0 ? 'income' : 'expense'}
                  />
                ))}
              </GlassPanel>
            </>
          )}
        </>
      )}
    </div>
  );
}
