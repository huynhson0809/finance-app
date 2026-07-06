import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Keypad } from './components/Keypad';
import { CategoryChips } from './components/CategoryChips';
import { upsertLearnedRule } from '../db/category-rules';
import { useCategorySuggestion } from '../hooks/useCategorySuggestion';
import { shouldLearn } from '../categorizer';
import { formatVND } from '../lib/money';
import { saveUserTransaction } from '../transactions/save';
import type { Category } from '../types';

export function AddScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [raw, setRaw] = useState('');
  const [merchant, setMerchant] = useState('');
  const [chosen, setChosen] = useState<Category | null>(null);
  const [userPickedChip, setUserPickedChip] = useState(false);

  const { suggestion, refresh } = useCategorySuggestion(merchant);

  // Track suggestion until the user explicitly picks a chip.
  useEffect(() => {
    if (!userPickedChip) setChosen(suggestion);
  }, [suggestion, userPickedChip]);

  function handleKey(k: string) {
    if (k === '⌫') { setRaw(raw.slice(0, -1)); return; }
    const next = raw + k;
    if (next.length > 12) return;
    setRaw(next);
  }

  function handleChip(c: Category) {
    setUserPickedChip(true);
    setChosen(c);
  }

  const amount = parseInt(raw || '0', 10);
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';

  async function handleSave() {
    if (!amount || !chosen) return;
    try {
      await saveUserTransaction({
        amount, currency: 'VND',
        occurredAt: new Date().toISOString(),
        merchant: merchant.trim() || undefined,
        category: chosen, source: 'manual',
      });
      const learned = shouldLearn(suggestion, chosen, merchant);
      if (learned) {
        await upsertLearnedRule(learned);
        refresh();
      }
      navigate('/');
    } catch (err) {
      console.error('Failed to save transaction', err);
    }
  }

  return (
    <div className="flex flex-col">
      <h1 className="p-4 text-xl">{t('add.title')}</h1>
      <div className="px-4 text-4xl text-center">{formatVND(amount, locale)}</div>
      <label className="px-4 mt-2 block text-sm text-gray-600">
        {t('add.merchant')}
        <input
          value={merchant}
          onChange={e => setMerchant(e.target.value)}
          className="mt-1 w-full p-2 border rounded"
          aria-label={t('add.merchant')}
        />
      </label>
      <Keypad onChange={handleKey} />
      <CategoryChips value={chosen} onSelect={handleChip} />
      <button
        type="button"
        onClick={handleSave}
        disabled={!amount || !chosen}
        className="mx-4 my-4 py-3 bg-blue-600 text-white rounded disabled:bg-gray-300"
      >{t('add.save')}</button>
    </div>
  );
}
