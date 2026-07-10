import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Keypad } from './components/Keypad';
import { CategoryChips } from './components/CategoryChips';
import { useOcr } from '../hooks/useOcr';
import { useCategorySuggestion } from '../hooks/useCategorySuggestion';
import { useCategoryOverrides } from '../hooks/useCategoryOverrides';
import { useCategoryOrder } from '../hooks/useCategoryOrder';
import { useCustomCategories } from '../hooks/useCustomCategories';
import { runExtractors } from '../extractors';
import { imageHolder } from '../lib/image';
import { upsertLearnedRule } from '../db/category-rules';
import { shouldLearn } from '../categorizer';
import { formatVND } from '../lib/money';
import { errorMessage } from '../lib/error';
import { saveUserTransaction } from '../transactions/save';
import { categoriesForDirectionWithCustom } from '../categories/catalog';
import { categoryLabel } from './theme/categoryMeta';
import { type Category, type ExpenseCategory } from '../types';
import { DarkField, GlassPanel } from './components/primitives';
import type { BankHint, Extracted } from '../extractors';

export function ConfirmScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const navigate = useNavigate();
  const location = useLocation();
  const imageId = (location.state as { imageId?: string } | null)?.imageId;

  const blob = imageId ? imageHolder.get(imageId) : undefined;
  const [objectURL, setObjectURL] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setObjectURL(null); return; }
    const url = URL.createObjectURL(blob);
    setObjectURL(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const { recognize, status, progress, error: ocrError } = useOcr();
  const [text, setText] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!blob) { navigate('/'); return; }
    if (ranRef.current) return;
    ranRef.current = true;
    recognize(blob)
      .then(r => setText(r.text))
      .catch(() => setText(''));
  }, [blob, recognize, navigate]);

  const error = ocrError;

  const extracted = useMemo<{ fields: Partial<Extracted>; bankHint: BankHint | null }>(
    () => (text == null ? { fields: {}, bankHint: null } : runExtractors(text)),
    [text],
  );

  const [raw, setRaw] = useState('');
  const [merchant, setMerchant] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [chosen, setChosen] = useState<ExpenseCategory | null>(null);
  const [userPickedChip, setUserPickedChip] = useState(false);
  const userPickedChipRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { categories: customCategories } = useCustomCategories();
  const { overrides: categoryOverrides } = useCategoryOverrides();
  const { order: categoryOrder } = useCategoryOrder('expense');
  const expenseCategories = useMemo(
    () => categoriesForDirectionWithCustom('expense', customCategories, categoryOrder) as ExpenseCategory[],
    [categoryOrder, customCategories],
  );
  const suggestionCategories = useMemo(
    () => expenseCategories.map(category => ({
      id: category,
      label: categoryLabel(category, customCategories, t, categoryOverrides),
    })),
    [expenseCategories, customCategories, t, categoryOverrides],
  );
  const searchText = useMemo(
    () => [merchant, text ?? ''].filter(Boolean).join(' '),
    [merchant, text],
  );
  const { suggestion } = useCategorySuggestion(searchText, {
    direction: 'expense',
    categories: suggestionCategories,
  });

  // pre-fill on extraction
  useEffect(() => {
    if (text == null) return;
    if (extracted.fields.amount != null) setRaw(String(extracted.fields.amount));
    if (extracted.fields.merchant != null) setMerchant(extracted.fields.merchant);
    if (extracted.fields.occurredAt != null) {
      const d = new Date(extracted.fields.occurredAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      setOccurredAt(local.toISOString().slice(0, 16));
    }
  }, [text, extracted]);

  // chosen tracks suggestion until user explicitly taps a chip
  useEffect(() => {
    if (!userPickedChipRef.current) {
      setChosen(
        suggestion != null && expenseCategories.includes(suggestion as ExpenseCategory)
          ? suggestion as ExpenseCategory
          : null,
      );
    }
  }, [expenseCategories, suggestion, userPickedChip]);

  function handleKey(k: string) {
    if (k === '⌫') { setRaw(r => r.slice(0, -1)); return; }
    const next = raw + k;
    if (next.length > 12) return;
    setRaw(next);
  }

  function handleChip(c: Category) {
    if (!expenseCategories.includes(c as ExpenseCategory)) return;
    userPickedChipRef.current = true;
    setUserPickedChip(true);
    setChosen(c as ExpenseCategory);
  }

  const amount = Number.parseInt(raw || '0', 10);
  const canSave = amount > 0 && chosen != null && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    const source = extracted.bankHint != null ? 'bank-screenshot' : 'receipt';
    const occurred = occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString();
    try {
      await saveUserTransaction({
        amount,
        currency: 'VND',
        occurredAt: occurred,
        merchant: merchant.trim() || undefined,
        direction: 'expense',
        category: chosen!,
        source,
        bankHint: extracted.bankHint ?? undefined,
      });
      const learned = shouldLearn(suggestion, chosen!, merchant);
      if (learned) await upsertLearnedRule(learned);
      if (imageId) imageHolder.drop(imageId);
      navigate('/');
    } catch (e) {
      console.error('ConfirmScreen save failed', e);
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!blob) return null;

  const loading = status === 'loading-engine' || status === 'recognizing';

  return (
    <div className="space-y-4 px-4 py-5">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-white">{t('confirm.title')}</h1>
      </header>

      {objectURL && (
        <GlassPanel className="p-3">
          <img src={objectURL} alt="" className="max-h-52 w-full rounded-2xl object-contain" />
        </GlassPanel>
      )}

      {loading && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3 text-sm text-slate-300" role="status">
          {t('confirm.reading')} {progress}%
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100" role="alert">
          <div>{t('confirm.failed')}</div>
          <button
            type="button"
            disabled={status === 'loading-engine' || status === 'recognizing'}
            onClick={() => {
              if (status === 'loading-engine' || status === 'recognizing') return;
              ranRef.current = false;
              setText(null);
              if (blob) recognize(blob).then(r => setText(r.text)).catch(() => setText(''));
            }}
            className="mt-2 font-semibold underline disabled:opacity-50"
          >
            {t('confirm.tryAgain')}
          </button>
        </div>
      )}

      <GlassPanel
        aria-label={t('add.amount')}
        className="flex min-h-24 items-center justify-center p-4"
      >
        <div className="text-center text-5xl font-bold text-white">{formatVND(amount, locale)}</div>
      </GlassPanel>

      <DarkField label={t('add.merchant')}>
        <input
          value={merchant}
          onChange={e => setMerchant(e.target.value)}
          aria-label={t('add.merchant')}
        />
      </DarkField>

      <DarkField label={t('confirm.date')}>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={e => setOccurredAt(e.target.value)}
        />
      </DarkField>

      <div className="-mx-4">
        <Keypad onChange={handleKey} />
      </div>
      <div className="-mx-4">
        <CategoryChips
          value={chosen}
          onSelect={handleChip}
          categories={expenseCategories}
          customCategories={customCategories}
          categoryOverrides={categoryOverrides}
        />
      </div>

      {saveError && (
        <div role="alert" className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div>{t('add.saveFailed')}</div>
          <div>{saveError}</div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="min-h-14 w-full rounded-2xl bg-sky-400 px-4 text-base font-bold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
      >
        {saving ? t('add.saving') : t('add.save')}
      </button>
    </div>
  );
}
