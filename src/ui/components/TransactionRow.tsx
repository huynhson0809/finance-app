import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import type { Transaction } from '../../types';

export function TransactionRow({ t: tx, locale }: { t: Transaction; locale: 'vi' | 'en' }) {
  const { t } = useTranslation();
  return (
    <li className="flex justify-between gap-3 px-4 py-2 border-b">
      <span>
        <span className="block">{t(`category.${tx.category}`)}</span>
        <span className="block text-xs text-gray-500">{formatTransactionDate(tx.occurredAt, locale)}</span>
      </span>
      <span>{formatVND(tx.amount, locale)}</span>
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
