import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Keypad } from './components/Keypad';
import { CategoryChips } from './components/CategoryChips';
import { useOcr } from '../hooks/useOcr';
import { useCategorySuggestion } from '../hooks/useCategorySuggestion';
import { runExtractors } from '../extractors';
import { imageHolder } from '../lib/image';
import { upsertLearnedRule } from '../db/category-rules';
import { shouldLearn } from '../categorizer';
import { formatVND } from '../lib/money';
import { saveUserTransaction } from '../transactions/save';
import type { Category } from '../types';
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
  const [chosen, setChosen] = useState<Category | null>(null);
  const [userPickedChip, setUserPickedChip] = useState(false);
  const searchText = useMemo(
    () => [merchant, text ?? ''].filter(Boolean).join(' '),
    [merchant, text],
  );
  const { suggestion } = useCategorySuggestion(searchText);

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
    if (!userPickedChip) setChosen(suggestion);
  }, [suggestion, userPickedChip]);

  function handleKey(k: string) {
    if (k === '⌫') { setRaw(r => r.slice(0, -1)); return; }
    const next = raw + k;
    if (next.length > 12) return;
    setRaw(next);
  }

  function handleChip(c: Category) {
    setUserPickedChip(true);
    setChosen(c);
  }

  const amount = Number.parseInt(raw || '0', 10);
  const canSave = amount > 0 && chosen != null;

  async function handleSave() {
    if (!canSave) return;
    const source = extracted.bankHint != null ? 'bank-screenshot' : 'receipt';
    const occurred = occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString();
    try {
      await saveUserTransaction({
        amount,
        currency: 'VND',
        occurredAt: occurred,
        merchant: merchant.trim() || undefined,
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
    }
  }

  if (!blob) return null;

  const loading = status === 'loading-engine' || status === 'recognizing';

  return (
    <div className="flex flex-col">
      <h1 className="p-4 text-xl">{t('confirm.title')}</h1>

      {objectURL && (
        <img src={objectURL} alt="" className="mx-4 max-h-48 object-contain rounded border" />
      )}

      {loading && (
        <div className="px-4 py-2 text-sm text-gray-500" role="status">
          {t('confirm.reading')} {progress}%
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-sm text-red-600" role="alert">
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
            className="mt-1 underline disabled:opacity-50"
          >
            {t('confirm.tryAgain')}
          </button>
        </div>
      )}

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

      <label className="px-4 mt-2 block text-sm text-gray-600">
        {t('confirm.date')}
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={e => setOccurredAt(e.target.value)}
          className="mt-1 w-full p-2 border rounded"
        />
      </label>

      <Keypad onChange={handleKey} />
      <CategoryChips value={chosen} onSelect={handleChip} />

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="mx-4 my-4 py-3 bg-blue-600 text-white rounded disabled:bg-gray-300"
      >{t('add.save')}</button>
    </div>
  );
}
