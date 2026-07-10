import { ArrowLeft, Check, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { builtInCategoriesForDirection, customCategoriesForDirection } from '../categories/catalog';
import { errorMessage } from '../lib/error';
import type {
  BuiltInCategory,
  Category,
  CategoryIconKey,
  CustomExpenseCategory,
  CustomIncomeCategory,
  TransactionDirection,
  UserCategory,
} from '../types';
import { useCustomCategories } from '../hooks/useCustomCategories';
import { useCategoryOverrides } from '../hooks/useCategoryOverrides';
import { DarkField, GlassPanel, SegmentedControl } from './components/primitives';
import {
  categoryLabel,
  CUSTOM_CATEGORY_ICON_OPTIONS,
  defaultIconKeyForDirection,
  getCategoryMeta,
  iconKeyForCategory,
} from './theme/categoryMeta';

type CustomCategoryId = CustomExpenseCategory | CustomIncomeCategory;
type EditingState =
  | { mode: 'new' }
  | { mode: 'custom'; id: CustomCategoryId }
  | { mode: 'builtin'; category: BuiltInCategory }
  | null;

function searchDirection(value: string | null): TransactionDirection {
  return value === 'income' ? 'income' : 'expense';
}

export function CategoryManagerScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [direction, setDirectionState] = useState<TransactionDirection>(
    () => searchDirection(searchParams.get('direction')),
  );
  const [editing, setEditing] = useState<EditingState>(null);
  const [draftName, setDraftName] = useState('');
  const [draftIconKey, setDraftIconKey] = useState<CategoryIconKey>(
    () => defaultIconKeyForDirection(direction),
  );
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    categories: customCategories,
    error,
    addCategory,
    renameCategory,
    updateCategoryIcon,
    deleteCategory,
  } = useCustomCategories();
  const {
    overrides: categoryOverrides,
    error: categoryOverridesError,
    saveOverride,
  } = useCategoryOverrides();

  const builtInCategories = useMemo(
    () => builtInCategoriesForDirection(direction),
    [direction],
  );
  const visibleCustomCategories = useMemo(
    () => customCategoriesForDirection(customCategories, direction),
    [customCategories, direction],
  );
  const editingCategory = editing?.mode === 'custom'
    ? visibleCustomCategories.find(category => category.id === editing.id)
    : undefined;
  const editingBuiltInCategory = editing?.mode === 'builtin' ? editing.category : undefined;
  const managerError = localError ?? error ?? categoryOverridesError;

  function setDirection(next: TransactionDirection) {
    setDirectionState(next);
    setEditing(null);
    setDraftName('');
    setDraftIconKey(defaultIconKeyForDirection(next));
    setLocalError(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('direction', next);
    setSearchParams(nextParams, { replace: true });
  }

  function startNewCategory() {
    setEditing({ mode: 'new' });
    setDraftName('');
    setDraftIconKey(defaultIconKeyForDirection(direction));
    setLocalError(null);
  }

  function startEditCategory(category: UserCategory) {
    setEditing({ mode: 'custom', id: category.id });
    setDraftName(category.name);
    setDraftIconKey(category.iconKey ?? defaultIconKeyForDirection(category.direction));
    setLocalError(null);
  }

  function startEditBuiltInCategory(category: BuiltInCategory) {
    const override = categoryOverrides.find(item => item.category === category);
    setEditing({ mode: 'builtin', category });
    setDraftName(categoryLabel(category, customCategories, t, categoryOverrides));
    setDraftIconKey(override?.iconKey ?? iconKeyForCategory(category));
    setLocalError(null);
  }

  async function saveCategory() {
    const name = draftName.trim();
    if (!name || busy || !editing) return;

    setBusy(true);
    setLocalError(null);
    try {
      if (editing.mode === 'new') {
        await addCategory(direction, name, draftIconKey);
      } else if (editing.mode === 'builtin') {
        await saveOverride(editing.category, { name, iconKey: draftIconKey });
      } else if (editingCategory) {
        if (name !== editingCategory.name) {
          await renameCategory(editingCategory.id, name);
        }
        if (draftIconKey !== editingCategory.iconKey) {
          await updateCategoryIcon(editingCategory.id, draftIconKey);
        }
      }

      setEditing(null);
      setDraftName('');
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory() {
    if (!editingCategory || busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      await deleteCategory(editingCategory.id);
      setEditing(null);
      setDraftName('');
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function renderBuiltInCategoryRow(category: Category) {
    const meta = getCategoryMeta(category, customCategories, categoryOverrides);
    const Icon = meta.Icon;
    const label = categoryLabel(category, customCategories, t, categoryOverrides);

    return (
      <button
        key={category}
        type="button"
        onClick={() => startEditBuiltInCategory(category as BuiltInCategory)}
        className="grid min-h-14 w-full grid-cols-[2.25rem_minmax(0,1fr)_1.25rem] items-center gap-3 border-b border-white/10 px-4 text-left transition hover:bg-white/[0.035] last:border-b-0"
      >
        <Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />
        <span className="truncate text-base font-semibold text-slate-100">{label}</span>
        <ChevronRight aria-hidden="true" className="h-5 w-5 text-slate-500" />
      </button>
    );
  }

  function renderCustomCategoryRow(category: UserCategory) {
    const meta = getCategoryMeta(category.id, customCategories, categoryOverrides);
    const Icon = meta.Icon;
    return (
      <button
        key={category.id}
        type="button"
        onClick={() => startEditCategory(category)}
        className="grid min-h-14 w-full grid-cols-[2.25rem_minmax(0,1fr)_1.25rem] items-center gap-3 border-b border-white/10 px-4 text-left transition hover:bg-white/[0.035] last:border-b-0"
      >
        <Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />
        <span className="truncate text-base font-semibold text-slate-100">{category.name}</span>
        <ChevronRight aria-hidden="true" className="h-5 w-5 text-slate-500" />
      </button>
    );
  }

  return (
    <div className="space-y-4 px-4 py-5 pb-36 text-slate-100">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="grid h-11 w-11 place-items-center rounded-full text-slate-100"
        >
          <ArrowLeft aria-hidden="true" className="h-7 w-7" />
        </button>
        <h1 className="truncate text-center text-xl font-bold text-white">{t('categories.title')}</h1>
        <span aria-hidden="true" />
      </header>

      <SegmentedControl
        ariaLabel={t('categories.direction')}
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'expense', label: t('categories.expense') },
          { value: 'income', label: t('categories.income') },
        ]}
      />

      {editing && (
        <GlassPanel className="space-y-4 p-4" data-testid="category-editor">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">
              {editing.mode === 'new' ? t('categories.add') : t('categories.edit')}
            </h2>
            {editing.mode === 'custom' && (
              <button
                type="button"
                onClick={removeCategory}
                disabled={busy}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-300/30 bg-rose-500/10 text-rose-200 disabled:opacity-50"
                aria-label={t('categories.delete')}
                title={t('categories.delete')}
              >
                <Trash2 aria-hidden="true" className="h-5 w-5" />
              </button>
            )}
          </div>

          {editingBuiltInCategory && (
            <p className="text-sm leading-relaxed text-slate-400">
              {t('categories.builtInHint')}
            </p>
          )}

          <DarkField label={t('categories.name')}>
            <input
              value={draftName}
              autoFocus
              onChange={event => setDraftName(event.target.value)}
              aria-label={t('categories.name')}
            />
          </DarkField>

          <section aria-label={t('categories.icon')}>
            <h3 className="text-sm font-semibold text-slate-300">{t('categories.icon')}</h3>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {CUSTOM_CATEGORY_ICON_OPTIONS.map(option => {
                const Icon = option.Icon;
                const selected = option.key === draftIconKey;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-label={t('categories.iconOption', { icon: option.key })}
                    aria-pressed={selected}
                    onClick={() => setDraftIconKey(option.key)}
                    className={[
                      'grid h-11 w-full place-items-center rounded-xl border transition',
                      selected
                        ? 'border-sky-300 bg-sky-300/15 shadow-[0_0_16px_rgba(56,189,248,0.28)]'
                        : 'border-white/10 bg-white/[0.055]',
                    ].join(' ')}
                  >
                    <Icon aria-hidden="true" className={`h-5 w-5 ${option.accentClass}`} />
                  </button>
                );
              })}
            </div>
          </section>

          {managerError && (
            <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              {managerError}
            </div>
          )}

          <button
            type="button"
            onClick={saveCategory}
            disabled={busy || !draftName.trim()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-400 px-4 font-bold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
          >
            <Check aria-hidden="true" className="h-5 w-5" />
            {t('categories.save')}
          </button>
        </GlassPanel>
      )}

      <GlassPanel className="overflow-hidden">
        <button
          type="button"
          onClick={startNewCategory}
          className="grid min-h-14 w-full grid-cols-[2.25rem_minmax(0,1fr)_1.25rem] items-center gap-3 border-b border-white/10 px-4 text-left transition hover:bg-white/[0.035]"
        >
          <Plus aria-hidden="true" className="h-6 w-6 text-sky-300" />
          <span className="truncate text-base font-semibold text-white">{t('categories.add')}</span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 text-slate-500" />
        </button>

        {builtInCategories.map(renderBuiltInCategoryRow)}
        {visibleCustomCategories.map(renderCustomCategoryRow)}
      </GlassPanel>
    </div>
  );
}
