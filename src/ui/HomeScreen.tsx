import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useMonthCloudTransactions,
  useRecentCloudTransactions,
} from '../hooks/useCloudTransactions';
import { errorMessage } from '../lib/error';
import { AddImageButton } from './AddImageButton';
import { useBudget } from '../hooks/useBudget';
import { BudgetBar } from './components/BudgetBar';
import { BudgetAlert } from './components/BudgetAlert';
import { TransactionRow } from './components/TransactionRow';
import { GlassPanel, MetricCard } from './components/primitives';
import { sumByCategory, status as budgetStatus } from '../reports';
import { formatVND } from '../lib/money';
import { isSameVietnamDay, monthOfVietnamDate, todayVietnamDate } from '../lib/date';
import { supabase } from '../supabase/client';
import { updateCloudTransactionCategory } from '../supabase/transactions';
import { EXPENSE_CATEGORIES, type Category, type Transaction } from '../types';

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const [categoryEditError, setCategoryEditError] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const today = todayVietnamDate();
  const month = monthOfVietnamDate(today);
  const { data: budget } = useBudget(month);
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
  const sums = useMemo(() => sumByCategory(monthTx), [monthTx]);
  const bStatus = useMemo(() => budgetStatus(budget, sums), [budget, sums]);
  const monthSpent = bStatus.overallSpent;
  const perCategoryOver = useMemo(
    () => EXPENSE_CATEGORIES.filter(c => bStatus.perCategory[c] === 'over'),
    [bStatus],
  );
  const categoryLabel = (c: Category) => t(`category.${c}`);
  const cloudErrors = Array.from(new Set(
    [recentError, monthError].filter((error): error is string => Boolean(error)),
  ));
  const monthUnavailable = monthLoading || Boolean(monthError);
  const retryCloudTransactions = () => {
    void reloadRecent();
    void reloadMonth();
  };
  const transactionCategoryLabel = (tx: Transaction) =>
    [t('transactions.categoryLabel'), tx.merchant, tx.id, formatVND(tx.amount, locale)]
      .filter(Boolean)
      .join(' ');
  const handleCategoryChange = async (id: string, category: Category) => {
    if (editingCategoryId !== null) {
      return;
    }
    if (!supabase) {
      setCategoryEditError('Supabase is not configured');
      return;
    }

    setCategoryEditError(null);
    setEditingCategoryId(id);
    try {
      await updateCloudTransactionCategory(supabase, id, category);
      await Promise.all([reloadRecent(), reloadMonth()]);
    } catch (error) {
      setCategoryEditError(errorMessage(error));
    } finally {
      setEditingCategoryId(null);
    }
  };

  return (
    <div className="space-y-4 px-4 py-5">
      <header>
        <div className="text-sm font-medium text-slate-400">{month}</div>
        <h1 className="mt-1 text-3xl font-bold text-white">{t('nav.home')}</h1>
      </header>

      <GlassPanel aria-label="Monthly overview" className="border-sky-300/40 p-4 shadow-[0_0_26px_rgba(56,189,248,0.14)]">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label={t('home.todaySpend')} value={monthLoading ? t('cloud.loading') : monthError ? '-' : formatVND(todayExpense, locale)} tone="expense" />
          <MetricCard label={t('home.todayIncome')} value={monthLoading ? t('cloud.loading') : monthError ? '-' : formatVND(todayIncome, locale)} tone="income" />
        </div>
        <div className="mt-3">
          {monthLoading
            ? <div className="text-sm text-slate-400">{t('cloud.loading')}</div>
            : monthError
            ? null
            : budget
            ? <BudgetBar spent={monthSpent} total={budget.total} locale={locale} status={bStatus.overall} />
            : <div className="text-sm text-slate-400">{t('home.noBudget')}</div>}
        </div>
      </GlassPanel>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/add" className="flex min-h-20 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-sm font-semibold text-sky-300">
          {t('nav.add')}
        </Link>
        <AddImageButton variant="tile" />
      </div>

      {cloudErrors.length > 0 && (
        <div role="alert" className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div>{cloudErrors.join(' ')}</div>
          <button type="button" className="mt-2 rounded-xl bg-rose-400 px-3 py-2 font-semibold text-slate-950" onClick={retryCloudTransactions}>
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {categoryEditError && (
        <div role="alert" className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div className="font-medium">{t('transactions.categoryUpdateFailed')}</div>
          <div>{categoryEditError}</div>
        </div>
      )}

      {!monthUnavailable && (
        <BudgetAlert
          overall={bStatus.overall}
          perCategoryOver={perCategoryOver}
          categoryLabel={categoryLabel}
        />
      )}

      <section>
        <h2 className="pb-3 text-xl font-bold text-white">{t('home.lastTransactions')}</h2>
        {recentLoading
          ? <div className="text-sm text-slate-400">{t('cloud.loading')}</div>
          : recentError
          ? null
          : recent.length === 0
          ? <div className="text-sm text-slate-400">{t('home.empty')}</div>
          : <ul className="space-y-2">
              {recent.map(tx => (
                <TransactionRow
                  key={tx.id}
                  t={tx}
                  locale={locale}
                  onCategoryChange={handleCategoryChange}
                  categorySaving={editingCategoryId !== null}
                  categoryLabel={transactionCategoryLabel(tx)}
                />
              ))}
            </ul>}
      </section>
    </div>
  );
}
