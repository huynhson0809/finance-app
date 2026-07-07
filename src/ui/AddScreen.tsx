import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Keypad } from './components/Keypad';
import { CategoryChips } from './components/CategoryChips';
import { upsertLearnedRule } from '../db/category-rules';
import { useCategorySuggestion } from '../hooks/useCategorySuggestion';
import { shouldLearn } from '../categorizer';
import { formatVND } from '../lib/money';
import { errorMessage } from '../lib/error';
import { saveUserTransaction } from '../transactions/save';
import { dateInputValueForVietnam, vietnamDateInputToNoonISO } from '../lib/date';
import {
  categoriesForDirection,
  categoryBelongsToDirection,
  type Category,
  type ExpenseCategory,
  type IncomeCategory,
  type TransactionDirection,
} from '../types';

function isExpenseCategory(category: Category): category is ExpenseCategory {
  return categoryBelongsToDirection(category, 'expense');
}

function isIncomeCategory(category: Category): category is IncomeCategory {
  return categoryBelongsToDirection(category, 'income');
}

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function AddScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [raw, setRaw] = useState('');
  const [merchant, setMerchant] = useState('');
  const [direction, setDirection] = useState<TransactionDirection>('expense');
  const [date, setDate] = useState(dateInputValueForVietnam);
  const [chosen, setChosen] = useState<Category | null>(null);
  const [userPickedChip, setUserPickedChip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { suggestion, refresh } = useCategorySuggestion(merchant);

  // Track suggestion until the user explicitly picks a chip.
  useEffect(() => {
    if (direction !== 'expense') return;
    if (!userPickedChip) setChosen(suggestion);
  }, [direction, suggestion, userPickedChip]);

  useEffect(() => {
    if (chosen && !categoryBelongsToDirection(chosen, direction)) {
      setChosen(null);
    }
  }, [chosen, direction]);

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

  function handleDirection(next: TransactionDirection) {
    setDirection(next);
    setUserPickedChip(false);
    setChosen(current => (
      current && categoryBelongsToDirection(current, next) ? current : null
    ));
  }

  const amount = parseInt(raw || '0', 10);
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const categoryOptions = categoriesForDirection(direction);
  const canSave = Boolean(amount && chosen && isValidDateInput(date) && !saving);

  async function handleSave() {
    if (!canSave || !chosen) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fieldText = merchant.trim() || undefined;
      const occurredAt = vietnamDateInputToNoonISO(date);
      if (direction === 'expense') {
        if (!isExpenseCategory(chosen)) return;
        await saveUserTransaction({
          amount,
          currency: 'VND',
          occurredAt,
          merchant: fieldText,
          direction: 'expense',
          category: chosen,
          source: 'manual',
        });
        const learned = shouldLearn(suggestion, chosen, merchant);
        if (learned) {
          await upsertLearnedRule(learned);
          refresh();
        }
      } else {
        if (!isIncomeCategory(chosen)) return;
        await saveUserTransaction({
          amount,
          currency: 'VND',
          occurredAt,
          note: fieldText,
          direction: 'income',
          category: chosen,
          source: 'manual',
        });
      }
      navigate('/');
    } catch (err) {
      console.error('Failed to save transaction', err);
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col">
      <h1 className="p-4 text-xl">{t('add.title')}</h1>
      <div className="mx-4 flex rounded border p-1">
        <button
          type="button"
          onClick={() => handleDirection('expense')}
          aria-pressed={direction === 'expense'}
          className={`flex-1 rounded px-3 py-2 text-sm ${direction === 'expense' ? 'bg-blue-600 text-white' : 'bg-white'}`}
        >
          {t('add.expense')}
        </button>
        <button
          type="button"
          onClick={() => handleDirection('income')}
          aria-pressed={direction === 'income'}
          className={`flex-1 rounded px-3 py-2 text-sm ${direction === 'income' ? 'bg-blue-600 text-white' : 'bg-white'}`}
        >
          {t('add.income')}
        </button>
      </div>
      <div className="px-4 text-4xl text-center">{formatVND(amount, locale)}</div>
      <label className="px-4 mt-2 block text-sm text-gray-600">
        {t('add.date')}
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="mt-1 w-full p-2 border rounded"
          aria-label={t('add.date')}
        />
      </label>
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
      <CategoryChips value={chosen} onSelect={handleChip} categories={categoryOptions} />
      {saveError && (
        <div role="alert" className="mx-4 mt-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div>{t('add.saveFailed')}</div>
          <div>{saveError}</div>
        </div>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="mx-4 my-4 py-3 bg-blue-600 text-white rounded disabled:bg-gray-300"
      >{saving ? t('add.saving') : t(direction === 'expense' ? 'add.submitExpense' : 'add.submitIncome')}</button>
    </div>
  );
}
