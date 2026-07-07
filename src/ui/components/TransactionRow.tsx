import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import { categoriesForDirection, type Category, type Transaction } from '../../types';

interface TransactionRowProps {
  t: Transaction;
  locale: 'vi' | 'en';
  onCategoryChange?: (id: string, category: Category) => void;
  categorySaving?: boolean;
  categoryLabel?: string;
}

export function TransactionRow({ t: tx, locale, onCategoryChange, categorySaving, categoryLabel }: TransactionRowProps) {
  const { t } = useTranslation();
  const categoryOptions = categoriesForDirection(tx.direction);
  const amount = tx.direction === 'income'
    ? `+${formatVND(tx.amount, locale)}`
    : formatVND(tx.amount, locale);
  return (
    <li className="flex justify-between gap-3 px-4 py-2 border-b">
      <span className="min-w-0">
        {onCategoryChange ? (
          <select
            aria-label={categoryLabel ?? t('transactions.categoryLabel')}
            className="block max-w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            disabled={categorySaving}
            value={tx.category}
            onChange={event => onCategoryChange(tx.id, event.target.value as Category)}
          >
            {categoryOptions.map(category => (
              <option key={category} value={category}>
                {t(`category.${category}`)}
              </option>
            ))}
          </select>
        ) : (
          <span className="block">{t(`category.${tx.category}`)}</span>
        )}
        <span className="block text-xs text-gray-500">{formatTransactionDate(tx.occurredAt, locale)}</span>
      </span>
      <span className="shrink-0">{amount}</span>
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
