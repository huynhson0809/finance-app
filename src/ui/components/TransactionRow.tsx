import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import { categoriesForDirection, type Category, type Transaction } from '../../types';
import { CATEGORY_META, categoryToneClass } from '../theme/categoryMeta';
import { MoneyRow } from './primitives';

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
  const meta = CATEGORY_META[tx.category];
  const Icon = meta.Icon;
  const signedAmount = tx.direction === 'income'
    ? `+${formatVND(tx.amount, locale)}`
    : `-${formatVND(tx.amount, locale)}`;
  const title = tx.merchant?.trim() || tx.note?.trim() || t(`category.${tx.category}`);
  const subtitle = `${t(`category.${tx.category}`)} · ${formatTransactionDate(tx.occurredAt, locale)}`;

  return (
    <MoneyRow
      as="li"
      icon={<Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />}
      title={title}
      subtitle={subtitle}
      amount={signedAmount}
      tone={tx.direction}
    >
      {onCategoryChange && (
        <select
          aria-label={categoryLabel ?? t('transactions.categoryLabel')}
          className={`mt-2 max-w-full rounded-xl border border-white/10 bg-slate-950/70 px-2 py-1 text-xs ${categoryToneClass(tx.category)}`}
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
      )}
    </MoneyRow>
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
