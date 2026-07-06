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
import { sumByCategory, status as budgetStatus } from '../reports';
import { formatVND } from '../lib/money';
import { isSameVietnamDay, monthOfVietnamDate, todayVietnamDate } from '../lib/date';
import { supabase } from '../supabase/client';
import { updateCloudTransactionCategory } from '../supabase/transactions';
import { CATEGORIES, type Category, type Transaction } from '../types';

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

  const todayTotal = useMemo(
    () => monthTx
      .filter(tx => isSameVietnamDay(tx.occurredAt, today))
      .reduce((sum, tx) => sum + tx.amount, 0),
    [monthTx, today],
  );
  const sums = useMemo(() => sumByCategory(monthTx), [monthTx]);
  const bStatus = useMemo(() => budgetStatus(budget, sums), [budget, sums]);
  const monthSpent = bStatus.overallSpent;
  const perCategoryOver = useMemo(
    () => CATEGORIES.filter(c => bStatus.perCategory[c] === 'over'),
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
    <div>
      <header className="p-4">
        <div className="text-sm text-gray-500">{t('home.todaySpend')}</div>
        <div className="text-3xl font-semibold">
          {monthLoading ? t('cloud.loading') : monthError ? '-' : formatVND(todayTotal, locale)}
        </div>
      </header>

      {cloudErrors.length > 0 && (
        <div role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div>{cloudErrors.join(' ')}</div>
          <button
            type="button"
            className="mt-2 rounded bg-red-600 px-3 py-1 text-white"
            onClick={retryCloudTransactions}
          >
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {categoryEditError && (
        <div role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="font-medium">{t('transactions.categoryUpdateFailed')}</div>
          <div>{categoryEditError}</div>
        </div>
      )}

      {monthLoading
        ? <div className="px-4 text-sm text-gray-500">{t('cloud.loading')}</div>
        : monthError
        ? null
        : budget
        ? <BudgetBar spent={monthSpent} total={budget.total} locale={locale} status={bStatus.overall} />
        : <div className="px-4 text-sm text-gray-500">{t('home.noBudget')}</div>}

      {!monthUnavailable && (
        <BudgetAlert
          overall={bStatus.overall}
          perCategoryOver={perCategoryOver}
          categoryLabel={categoryLabel}
        />
      )}

      <h2 className="px-4 pt-4 pb-2 text-sm uppercase text-gray-500">
        {t('home.lastTransactions')}
      </h2>
      {recentLoading
        ? <div className="px-4 text-sm text-gray-500">{t('cloud.loading')}</div>
        : recentError
        ? null
        : recent.length === 0
        ? <div className="px-4 text-sm text-gray-500">{t('home.empty')}</div>
        : <ul>
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

      <AddImageButton />
      <Link
        to="/add"
        className="fixed right-4 bottom-20 w-14 h-14 rounded-full bg-blue-600 text-white text-3xl flex items-center justify-center shadow-lg"
        aria-label={t('nav.add')}
      >+</Link>
    </div>
  );
}
