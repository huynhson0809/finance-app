import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTransactions } from '../hooks/useTransactions';
import { useBudget } from '../hooks/useBudget';
import { BudgetBar } from './components/BudgetBar';
import { TransactionRow } from './components/TransactionRow';
import { getTodayTotal, listTransactions } from '../db/transactions';
import { formatVND } from '../lib/money';
import { monthOf, monthStartISO, todayISO } from '../lib/date';

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const month = monthOf(todayISO());
  const { data: budget } = useBudget(month);
  const { data: recent } = useTransactions(5);
  const [todayTotal, setTodayTotal] = useState(0);

  useEffect(() => { getTodayTotal().then(setTodayTotal); }, [recent]);

  // monthly spent for the bar
  const [monthSpent, setMonthSpent] = useState(0);
  useEffect(() => {
    listTransactions({ sinceISO: monthStartISO(todayISO()) })
      .then(all => setMonthSpent(all.reduce((s, tx) => s + tx.amount, 0)));
  }, [recent, month]);

  return (
    <div>
      <header className="p-4">
        <div className="text-sm text-gray-500">{t('home.todaySpend')}</div>
        <div className="text-3xl font-semibold">{formatVND(todayTotal, locale)}</div>
      </header>

      {budget
        ? <BudgetBar spent={monthSpent} total={budget.total} locale={locale} />
        : <div className="px-4 text-sm text-gray-500">{t('home.noBudget')}</div>}

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
