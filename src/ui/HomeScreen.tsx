import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useMonthCloudTransactions,
  useRecentCloudTransactions,
} from '../hooks/useCloudTransactions';
import { AddImageButton } from './AddImageButton';
import { useBudget } from '../hooks/useBudget';
import { useCustomCategories } from '../hooks/useCustomCategories';
import { BudgetBar } from './components/BudgetBar';
import { BudgetAlert } from './components/BudgetAlert';
import { TransactionRow } from './components/TransactionRow';
import { sumByCategory, status as budgetStatus, totalsByDirection } from '../reports';
import { formatVND } from '../lib/money';
import { isSameVietnamDay, monthOfVietnamDate, todayVietnamDate } from '../lib/date';
import { EXPENSE_CATEGORIES, type Category } from '../types';
import { categoryLabel as displayCategoryLabel } from './theme/categoryMeta';

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const today = todayVietnamDate();
  const month = monthOfVietnamDate(today);
  const { data: budget } = useBudget(month);
  const { categories: customCategories } = useCustomCategories();
  const {
    data: recent,
    loading: recentLoading,
    error: recentError,
    reload: reloadRecent,
  } = useRecentCloudTransactions(5);
  const {
    data: monthTx,
    loading: monthLoading,
    error: monthError,
    reload: reloadMonth,
  } = useMonthCloudTransactions(month);

  const todayExpense = useMemo(
    () => monthTx
      .filter(tx => tx.direction !== 'income' && isSameVietnamDay(tx.occurredAt, today))
      .reduce((sum, tx) => sum + tx.amount, 0),
    [monthTx, today],
  );
  const todayIncome = useMemo(
    () => monthTx
      .filter(tx => tx.direction === 'income' && isSameVietnamDay(tx.occurredAt, today))
      .reduce((sum, tx) => sum + tx.amount, 0),
    [monthTx, today],
  );
  const monthTotals = useMemo(() => totalsByDirection(monthTx), [monthTx]);
  const monthValue = (amount: number) =>
    monthLoading ? t('cloud.loading') : monthError ? '-' : formatVND(amount, locale);
  const sums = useMemo(() => sumByCategory(monthTx), [monthTx]);
  const bStatus = useMemo(() => budgetStatus(budget, sums), [budget, sums]);
  const monthSpent = bStatus.overallSpent;
  const perCategoryOver = useMemo(
    () => EXPENSE_CATEGORIES.filter(c => bStatus.perCategory[c] === 'over'),
    [bStatus],
  );
  const categoryLabel = (c: Category) => displayCategoryLabel(c, customCategories, t);
  const cloudErrors = Array.from(new Set(
    [recentError, monthError].filter((error): error is string => Boolean(error)),
  ));
  const monthUnavailable = monthLoading || Boolean(monthError);
  const retryCloudTransactions = () => {
    void reloadRecent();
    void reloadMonth();
  };

  return (
    <div className="min-h-screen bg-black pb-28 text-zinc-50">
      <header className="border-b border-white/10 px-4 pb-3 pt-5 text-center">
        <h1 className="text-xl font-bold">{t('nav.home')}</h1>
      </header>

      <div className="mx-4 mt-3 grid min-h-11 grid-cols-[2.5rem_1fr_2.5rem] items-center rounded-lg bg-zinc-800 text-center">
        <span className="text-2xl text-zinc-300">‹</span>
        <span className="text-lg font-bold">{formatMonthLabel(month)}</span>
        <span className="text-2xl text-zinc-300">›</span>
      </div>

      <section aria-label="Monthly overview" className="grid grid-cols-3 gap-2 px-3 py-3">
        <SummaryCell label={t('home.monthIncome')} value={monthValue(monthTotals.income)} tone="income" />
        <SummaryCell label={t('home.monthExpense')} value={monthValue(monthTotals.expense)} tone="expense" />
        <SummaryCell
          label={t('home.monthNet')}
          value={monthValue(monthTotals.net)}
          tone={monthTotals.net > 0 ? 'income' : monthTotals.net < 0 ? 'expense' : 'neutral'}
        />
        <SummaryCell label={t('home.todaySpend')} value={monthValue(todayExpense)} tone="expense" />
        <SummaryCell label={t('home.todayIncome')} value={monthValue(todayIncome)} tone="income" />
        <div className="col-span-3">
          {monthLoading
            ? <div className="px-1 text-sm text-zinc-400">{t('cloud.loading')}</div>
            : monthError
            ? null
            : budget
            ? (
                <BudgetBar
                  spent={monthSpent}
                  total={bStatus.overallLimit}
                  locale={locale}
                  status={bStatus.overall}
                  savingsTarget={budget.savingsTarget ?? 0}
                />
              )
            : <div className="px-1 text-sm text-zinc-400">{t('home.noBudget')}</div>}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        <Link to="/add" className="flex min-h-16 flex-col items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-sm font-semibold text-sky-400">
          {t('nav.add')}
        </Link>
        <AddImageButton variant="tile" />
      </div>

      {cloudErrors.length > 0 && (
        <div role="alert" className="mx-3 mb-3 rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div>{cloudErrors.join(' ')}</div>
          <button type="button" className="mt-2 rounded-lg bg-rose-400 px-3 py-2 font-semibold text-slate-950" onClick={retryCloudTransactions}>
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {!monthUnavailable && (
        <div className="px-3">
          <BudgetAlert
            overall={bStatus.overall}
            perCategoryOver={perCategoryOver}
            categoryLabel={categoryLabel}
          />
        </div>
      )}

      <section>
        <div className="flex h-7 items-center justify-between bg-zinc-700 px-3 text-xs font-bold text-zinc-100">
          <span>{t('home.lastTransactions')}</span>
          <span>{monthValue(monthTotals.net)}</span>
        </div>
        {recentLoading
          ? <div className="px-3 py-3 text-sm text-zinc-400">{t('cloud.loading')}</div>
          : recentError
          ? null
          : recent.length === 0
          ? <div className="px-3 py-3 text-sm text-zinc-400">{t('home.empty')}</div>
          : <ul className="bg-black">
              {recent.map(tx => (
                <TransactionRow key={tx.id} t={tx} locale={locale} customCategories={customCategories} />
              ))}
            </ul>}
      </section>
    </div>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' | 'neutral' }) {
  const toneClass = tone === 'income' ? 'text-sky-400' : tone === 'expense' ? 'text-red-400' : 'text-zinc-50';
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black px-2 py-2">
      <div className="truncate text-xs font-semibold text-zinc-300">{label}</div>
      <div className={`mt-1 truncate text-sm font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function formatMonthLabel(month: string): string {
  const [year, value] = month.split('-');
  return `${value}/${year}`;
}
