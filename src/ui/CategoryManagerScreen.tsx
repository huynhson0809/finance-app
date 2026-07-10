import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  builtInCategoriesForDirection,
  categoriesForDirectionWithCustom,
  customCategoriesForDirection,
} from '../categories/catalog';
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
import { useCategoryOrder } from '../hooks/useCategoryOrder';
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

function sameCategoryOrder(left: readonly Category[], right: readonly Category[]): boolean {
  return left.length === right.length && left.every((category, index) => category === right[index]);
}

function moveCategoryByOffset(
  categories: readonly Category[],
  category: Category,
  offset: -1 | 1,
): Category[] {
  const fromIndex = categories.indexOf(category);
  const toIndex = fromIndex + offset;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= categories.length) return [...categories];
  const next = [...categories];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, category);
  return next;
}

function moveCategoryNear(
  categories: readonly Category[],
  moving: Category,
  target: Category,
): Category[] {
  const fromIndex = categories.indexOf(moving);
  const targetIndex = categories.indexOf(target);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return [...categories];

  const withoutMoving = categories.filter(category => category !== moving);
  const targetIndexAfterRemoval = withoutMoving.indexOf(target);
  const insertIndex = fromIndex < targetIndex
    ? targetIndexAfterRemoval + 1
    : targetIndexAfterRemoval;

  return [
    ...withoutMoving.slice(0, insertIndex),
    moving,
    ...withoutMoving.slice(insertIndex),
  ];
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
  const [draftOrder, setDraftOrderState] = useState<Category[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const draggingCategoryRef = useRef<Category | null>(null);
  const draftOrderRef = useRef<Category[] | null>(null);
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
  const {
    order: categoryOrder,
    error: categoryOrderError,
    saveOrder: saveCategoryOrder,
  } = useCategoryOrder(direction);

  const builtInCategories = useMemo(
    () => builtInCategoriesForDirection(direction),
    [direction],
  );
  const visibleCustomCategories = useMemo(
    () => customCategoriesForDirection(customCategories, direction),
    [customCategories, direction],
  );
  const customCategoryById = useMemo(() => (
    new Map(visibleCustomCategories.map(category => [category.id, category]))
  ), [visibleCustomCategories]);
  const orderedCategories = useMemo(
    () => categoriesForDirectionWithCustom(direction, customCategories, categoryOrder),
    [categoryOrder, customCategories, direction],
  );
  const orderedCategoriesKey = orderedCategories.join('|');
  const displayedCategories = draftOrder ?? orderedCategories;
  const editingCategory = editing?.mode === 'custom'
    ? visibleCustomCategories.find(category => category.id === editing.id)
    : undefined;
  const editingBuiltInCategory = editing?.mode === 'builtin' ? editing.category : undefined;
  const managerError = localError ?? error ?? categoryOverridesError ?? categoryOrderError;

  useEffect(() => {
    setDraftOrder(null);
  }, [direction, orderedCategoriesKey]);

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

  function setDraftOrder(next: Category[] | null) {
    draftOrderRef.current = next;
    setDraftOrderState(next);
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

  async function persistCategoryOrder(next: Category[]) {
    setDraftOrder(next);
    setLocalError(null);
    try {
      await saveCategoryOrder(next);
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setDraftOrder(null);
    }
  }

  function editOrderedCategory(category: Category) {
    const customCategory = customCategoryById.get(category as CustomCategoryId);
    if (customCategory) {
      startEditCategory(customCategory);
      return;
    }
    if (builtInCategories.includes(category)) {
      startEditBuiltInCategory(category as BuiltInCategory);
    }
  }

  async function moveOrderedCategory(category: Category, offset: -1 | 1) {
    const next = moveCategoryByOffset(displayedCategories, category, offset);
    if (sameCategoryOrder(next, displayedCategories)) return;
    await persistCategoryOrder(next);
  }

  function handleDragStart(event: PointerEvent<HTMLButtonElement>, category: Category) {
    draggingCategoryRef.current = category;
    setDraftOrder(displayedCategories);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleDragMove(event: PointerEvent<HTMLButtonElement>) {
    const moving = draggingCategoryRef.current;
    if (!moving) return;

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-category-id]')
      ?.dataset.categoryId as Category | undefined;
    if (!target || target === moving) return;

    const current = draftOrderRef.current ?? displayedCategories;
    const next = moveCategoryNear(current, moving, target);
    if (!sameCategoryOrder(next, current)) setDraftOrder(next);
  }

  async function handleDragEnd(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    draggingCategoryRef.current = null;
    const next = draftOrderRef.current;
    if (next && !sameCategoryOrder(next, orderedCategories)) {
      await persistCategoryOrder(next);
      return;
    }
    setDraftOrder(null);
  }

  function renderCategoryRow(category: Category, index: number) {
    const meta = getCategoryMeta(category, customCategories, categoryOverrides);
    const Icon = meta.Icon;
    const label = categoryLabel(category, customCategories, t, categoryOverrides);
    const isFirst = index === 0;
    const isLast = index === displayedCategories.length - 1;

    return (
      <div
        key={category}
        data-category-id={category}
        data-testid="category-order-row"
        className="grid min-h-14 w-full grid-cols-[2rem_2.25rem_minmax(0,1fr)_2rem_2rem_1.25rem] items-center gap-2 border-b border-white/10 px-3 text-left transition hover:bg-white/[0.035] last:border-b-0"
      >
        <button
          type="button"
          aria-label={t('categories.drag', { category: label })}
          onPointerDown={event => handleDragStart(event, category)}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="grid h-9 w-8 touch-none place-items-center rounded-xl text-slate-500 active:cursor-grabbing active:bg-white/10 active:text-slate-200"
        >
          <GripVertical aria-hidden="true" className="h-5 w-5" />
        </button>
        <Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />
        <button
          type="button"
          onClick={() => editOrderedCategory(category)}
          className="min-w-0 py-4 text-left"
        >
          <span data-testid="category-order-label" className="block truncate text-base font-semibold text-slate-100">
            {label}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void moveOrderedCategory(category, -1)}
          disabled={isFirst}
          aria-label={t('categories.moveUp', { category: label })}
          className="grid h-9 w-8 place-items-center rounded-xl text-slate-400 disabled:text-slate-700"
        >
          <ArrowUp aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void moveOrderedCategory(category, 1)}
          disabled={isLast}
          aria-label={t('categories.moveDown', { category: label })}
          className="grid h-9 w-8 place-items-center rounded-xl text-slate-400 disabled:text-slate-700"
        >
          <ArrowDown aria-hidden="true" className="h-4 w-4" />
        </button>
        <ChevronRight aria-hidden="true" className="h-5 w-5 text-slate-500" />
      </div>
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

        {displayedCategories.map(renderCategoryRow)}
      </GlassPanel>
    </div>
  );
}
