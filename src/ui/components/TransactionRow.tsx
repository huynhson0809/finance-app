import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import type { Transaction, UserCategory } from '../../types';
import { categoryLabel, getCategoryMeta } from '../theme/categoryMeta';

interface TransactionRowProps {
  t: Transaction;
  locale: 'vi' | 'en';
  customCategories?: readonly UserCategory[];
}

export function TransactionRow({ t: tx, locale, customCategories = [] }: TransactionRowProps) {
  const { t } = useTranslation();
  const meta = getCategoryMeta(tx.category);
  const Icon = meta.Icon;
  const signedAmount = tx.direction === 'income'
    ? `+${formatVND(tx.amount, locale)}`
    : formatVND(tx.amount, locale);
  const label = categoryLabel(tx.category, customCategories, t);
  const title = tx.merchant?.trim() || tx.note?.trim() || label;
  const subtitle = `${label} · ${formatTransactionDate(tx.occurredAt, locale)}`;

  return (
    <li>
      <Link
        to={`/transactions/${tx.id}`}
        className="grid min-h-[4.25rem] grid-cols-[2.75rem_minmax(0,1fr)_minmax(5.5rem,7.5rem)_1.25rem] items-center gap-2 border-b border-white/10 bg-black px-3 py-2 text-slate-50"
        aria-label={`${title} ${subtitle} ${signedAmount}`}
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg">
          <Icon aria-hidden="true" className={`h-7 w-7 ${meta.accentClass}`} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-bold">{title}</span>
          <span className="block truncate text-xs text-zinc-400">{subtitle}</span>
        </span>
        <span className={`shrink-0 truncate whitespace-nowrap text-right text-base font-bold ${tx.direction === 'income' ? 'text-emerald-400' : 'text-zinc-50'}`}>
          {signedAmount}
        </span>
        <ChevronRight aria-hidden="true" className="h-5 w-5 text-zinc-500" />
      </Link>
    </li>
  );
}

function formatTransactionDate(iso: string, locale: 'vi' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
