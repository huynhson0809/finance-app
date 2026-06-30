import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTransactions } from '../hooks/useTransactions';
import { useBudget } from '../hooks/useBudget';
import { BudgetBar } from './components/BudgetBar';
import { BudgetAlert } from './components/BudgetAlert';
import { TransactionRow } from './components/TransactionRow';
import { getTodayTotal, listTransactions } from '../db/transactions';
import { sumByCategory, status as budgetStatus } from '../reports';
import { formatVND } from '../lib/money';
import { monthOf, monthStartISO, todayISO } from '../lib/date';
import { CATEGORIES, type Category, type Transaction } from '../types';

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const month = monthOf(todayISO());
  const { data: budget } = useBudget(month);
  const { data: recent } = useTransactions(5);
  const [todayTotal, setTodayTotal] = useState(0);
  const [monthTx, setMonthTx] = useState<Transaction[]>([]);

  useEffect(() => { getTodayTotal().then(setTodayTotal); }, [recent]);
  useEffect(() => {
    listTransactions({ sinceISO: monthStartISO(todayISO()) }).then(setMonthTx);
  }, [recent, month]);

  const sums = useMemo(() => sumByCategory(monthTx), [monthTx]);
  const bStatus = useMemo(() => budgetStatus(budget, sums), [budget, sums]);
  const monthSpent = bStatus.overallSpent;
  const perCategoryOver = useMemo(
    () => CATEGORIES.filter(c => bStatus.perCategory[c] === 'over'),
    [bStatus],
  );
  const categoryLabel = (c: Category) => t(`category.${c}`);

  return (
    <div>
      <header className="p-4">
        <div className="text-sm text-gray-500">{t('home.todaySpend')}</div>
        <div className="text-3xl font-semibold">{formatVND(todayTotal, locale)}</div>
      </header>

      {budget
        ? <BudgetBar spent={monthSpent} total={budget.total} locale={locale} status={bStatus.overall} />
        : <div className="px-4 text-sm text-gray-500">{t('home.noBudget')}</div>}

      <BudgetAlert
        overall={bStatus.overall}
        perCategoryOver={perCategoryOver}
        categoryLabel={categoryLabel}
      />

      <h2 className="px-4 pt-4 pb-2 text-sm uppercase text-gray-500">
        {t('home.lastTransactions')}
      </h2>
      {recent.length === 0
        ? <div className="px-4 text-sm text-gray-500">{t('home.empty')}</div>
        : <ul>{recent.map(tx => <TransactionRow key={tx.id} t={tx} locale={locale} />)}</ul>}

      <Link
        to="/add"
        className="fixed right-4 bottom-20 w-14 h-14 rounded-full bg-blue-600 text-white text-3xl flex items-center justify-center shadow-lg"
        aria-label={t('nav.add')}
      >+</Link>
    </div>
  );
}
