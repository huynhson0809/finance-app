import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Keypad } from './components/Keypad';
import { CategoryChips } from './components/CategoryChips';
import { addTransaction } from '../db/transactions';
import { formatVND } from '../lib/money';
import type { Category } from '../types';

export function AddScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [raw, setRaw] = useState('');
  const [category, setCategory] = useState<Category | null>(null);

  function handleKey(k: string) {
    if (k === '⌫') setRaw(raw.slice(0, -1));
    else setRaw((raw + k).slice(0, 12));
  }

  const amount = parseInt(raw || '0', 10);
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';

  async function handleSave() {
    if (!amount || !category) return;
    await addTransaction({
      amount, currency: 'VND',
      occurredAt: new Date().toISOString(),
      category, source: 'manual',
    });
    navigate('/');
  }

  return (
    <div className="flex flex-col">
      <h1 className="p-4 text-xl">{t('add.title')}</h1>
      <div className="px-4 text-4xl text-center">{formatVND(amount, locale)}</div>
      <Keypad onChange={handleKey} />
      <CategoryChips value={category} onSelect={setCategory} />
      <button
        type="button"
        onClick={handleSave}
        disabled={!amount || !category}
        className="mx-4 my-4 py-3 bg-blue-600 text-white rounded disabled:bg-gray-300"
      >{t('add.save')}</button>
    </div>
  );
}
