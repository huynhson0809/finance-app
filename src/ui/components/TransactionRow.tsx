import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import type { Transaction } from '../../types';

export function TransactionRow({ t: tx, locale }: { t: Transaction; locale: 'vi' | 'en' }) {
  const { t } = useTranslation();
  return (
    <li className="flex justify-between px-4 py-2 border-b">
      <span>{t(`category.${tx.category}`)}</span>
      <span>{formatVND(tx.amount, locale)}</span>
    </li>
  );
}
