import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMonthCloudTransactions,
  useRecentCloudTransactions,
} from '../hooks/useCloudTransactions';
import { useBudget } from '../hooks/useBudget';
import { BudgetBar } from './components/BudgetBar';
import { BudgetAlert } from './components/BudgetAlert';
import { BackupReminder } from './components/BackupReminder';
import { TransactionRow } from './components/TransactionRow';
import { sumByCategory, status as budgetStatus } from '../reports';
import { formatVND } from '../lib/money';
import { isSameDay, monthOf, todayISO } from '../lib/date';
import { CATEGORIES, type Category } from '../types';

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const today = todayISO();
  const month = monthOf(today);
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
      .filter(tx => isSameDay(tx.occurredAt, today))
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
  const retryCloudTransactions = () => {
    void reloadRecent();
    void reloadMonth();
  };

  return (
    <div>
      <header className="p-4">
        <div className="text-sm text-gray-500">{t('home.todaySpend')}</div>
        <div className="text-3xl font-semibold">
          {monthLoading ? t('cloud.loading') : formatVND(todayTotal, locale)}
        </div>
      </header>

      <BackupReminder />

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

      {monthLoading
        ? <div className="px-4 text-sm text-gray-500">{t('cloud.loading')}</div>
        : budget
        ? <BudgetBar spent={monthSpent} total={budget.total} locale={locale} status={bStatus.overall} />
        : <div className="px-4 text-sm text-gray-500">{t('home.noBudget')}</div>}

      {!monthLoading && (
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
        : recent.length === 0
        ? <div className="px-4 text-sm text-gray-500">{t('home.empty')}</div>
        : <ul>{recent.map(tx => <TransactionRow key={tx.id} t={tx} locale={locale} />)}</ul>}
    </div>
  );
}
