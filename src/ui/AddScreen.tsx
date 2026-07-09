import { Check, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AddImageButton } from './AddImageButton';
import { CategoryChips } from './components/CategoryChips';
import { DarkField, SegmentedControl } from './components/primitives';
import { categoriesForDirectionWithCustom, customCategoriesForDirection } from '../categories/catalog';
import { upsertLearnedRule } from '../db/category-rules';
import { useCategorySuggestion } from '../hooks/useCategorySuggestion';
import { useCustomCategories } from '../hooks/useCustomCategories';
import { shouldLearn } from '../categorizer';
import { parseVNDInput } from '../lib/money';
import { errorMessage } from '../lib/error';
import { saveUserTransaction } from '../transactions/save';
import { dateInputValueForVietnam, vietnamDateInputToNoonISO } from '../lib/date';
import {
  categoryBelongsToDirection,
  type Category,
  type CustomExpenseCategory,
  type CustomIncomeCategory,
  type ExpenseCategory,
  type IncomeCategory,
  type TransactionDirection,
} from '../types';

type CustomCategoryId = CustomExpenseCategory | CustomIncomeCategory;

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [raw, setRaw] = useState('');
  const [merchant, setMerchant] = useState('');
  const [direction, setDirection] = useState<TransactionDirection>('expense');
  const [date, setDate] = useState(dateInputValueForVietnam);
  const [chosen, setChosen] = useState<Category | null>(null);
  const [userPickedChip, setUserPickedChip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState<CustomCategoryId | 'new' | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const { suggestion, refresh } = useCategorySuggestion(merchant);
  const {
    categories: customCategories,
    error: customCategoryError,
    addCategory,
    renameCategory,
    deleteCategory,
  } = useCustomCategories();

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

  useEffect(() => {
    setNewCategoryName('');
    setCategoryError(null);
  }, [direction]);

  useEffect(() => {
    setRenameDrafts(current => {
      const next: Record<string, string> = {};
      for (const category of customCategories) {
        next[category.id] = current[category.id] ?? category.name;
      }
      return next;
    });
  }, [customCategories]);

  function handleAmountChange(value: string) {
    setRaw(value.replace(/[^\d]/g, '').slice(0, 12));
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

  const parsedAmount = parseVNDInput(raw);
  const amount = Number.isNaN(parsedAmount) ? 0 : parsedAmount;
  const visibleCustomCategories = customCategoriesForDirection(customCategories, direction);
  const categoryOptions = categoriesForDirectionWithCustom(direction, customCategories);
  const canSave = Boolean(amount && chosen && isValidDateInput(date) && !saving);
  const categoryManagerError = categoryError ?? customCategoryError;

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name || categoryBusy) return;
    setCategoryBusy('new');
    setCategoryError(null);
    try {
      const category = await addCategory(direction, name);
      setNewCategoryName('');
      setUserPickedChip(true);
      setChosen(category.id);
    } catch (err) {
      setCategoryError(errorMessage(err));
    } finally {
      setCategoryBusy(null);
    }
  }

  async function handleRenameCategory(id: CustomCategoryId, currentName: string) {
    const name = (renameDrafts[id] ?? '').trim();
    if (!name || name === currentName || categoryBusy) return;
    setCategoryBusy(id);
    setCategoryError(null);
    try {
      const category = await renameCategory(id, name);
      setRenameDrafts(current => ({ ...current, [id]: category.name }));
    } catch (err) {
      setCategoryError(errorMessage(err));
    } finally {
      setCategoryBusy(null);
    }
  }

  async function handleDeleteCategory(id: CustomCategoryId) {
    if (categoryBusy) return;
    setCategoryBusy(id);
    setCategoryError(null);
    try {
      await deleteCategory(id);
      setRenameDrafts(current => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setChosen(current => current === id ? null : current);
    } catch (err) {
      setCategoryError(errorMessage(err));
    } finally {
      setCategoryBusy(null);
    }
  }

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
    <div className="space-y-4 px-4 py-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{t('add.title')}</h1>
        <AddImageButton variant="compact" />
      </header>

      <SegmentedControl
        ariaLabel="Direction"
        value={direction}
        onChange={handleDirection}
        options={[
          { value: 'expense', label: t('add.expense') },
          { value: 'income', label: t('add.income') },
        ]}
      />

      <div className="grid gap-3">
        <DarkField label={t('add.date')}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            aria-label={t('add.date')}
          />
        </DarkField>
        <DarkField label={t('add.merchant')}>
          <input
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
            aria-label={t('add.merchant')}
          />
        </DarkField>
        <DarkField label={t('add.amount')}>
          <input
            value={raw}
            onChange={e => handleAmountChange(e.target.value)}
            aria-label={t('add.amount')}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </DarkField>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">{t('add.category')}</h2>
          <button
            type="button"
            onClick={() => setManagerOpen(open => !open)}
            aria-expanded={managerOpen}
            className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-sky-300"
          >
            {t('add.manageCategories')}
          </button>
        </div>
        {managerOpen && (
          <section
            aria-label={t('add.categoryManagerTitle')}
            className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3"
          >
            <div className="flex gap-2">
              <input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleAddCategory();
                }}
                aria-label={t('add.newCategoryName')}
                placeholder={t('add.newCategoryName')}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/70"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim() || categoryBusy != null}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400 text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
                aria-label={t('add.addCategory')}
                title={t('add.addCategory')}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            {visibleCustomCategories.length > 0 && (
              <div className="space-y-2">
                {visibleCustomCategories.map(category => {
                  const draft = renameDrafts[category.id] ?? category.name;
                  return (
                    <div key={category.id} className="flex items-center gap-2">
                      <input
                        value={draft}
                        onChange={e => {
                          const value = e.target.value;
                          setRenameDrafts(current => ({ ...current, [category.id]: value }));
                        }}
                        aria-label={t('add.renameCategoryName', { name: category.name })}
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-sky-300/70"
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameCategory(category.id, category.name)}
                        disabled={!draft.trim() || draft.trim() === category.name || categoryBusy != null}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-emerald-300 disabled:text-slate-600"
                        aria-label={t('add.renameCategory', { name: category.name })}
                        title={t('add.renameCategory', { name: category.name })}
                      >
                        <Check aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(category.id)}
                        disabled={categoryBusy != null}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-rose-300 disabled:text-slate-600"
                        aria-label={t('add.deleteCategory', { name: category.name })}
                        title={t('add.deleteCategory', { name: category.name })}
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {categoryManagerError && (
              <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-2 text-xs text-rose-100">
                {categoryManagerError}
              </div>
            )}
          </section>
        )}
        <CategoryChips
          value={chosen}
          onSelect={handleChip}
          categories={categoryOptions}
          customCategories={customCategories}
          density="compact"
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
        {saving ? t('add.saving') : t(direction === 'expense' ? 'add.submitExpense' : 'add.submitIncome')}
      </button>
    </div>
  );
}
