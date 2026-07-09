import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Bus,
  Clapperboard,
  Coffee,
  Coins,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Landmark,
  MoreHorizontal,
  PiggyBank,
  ReceiptText,
  Repeat2,
  ShoppingBag,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react';
import {
  CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Category,
  type ExpenseCategory,
  type IncomeCategory,
  type UserCategory,
} from '../../types';

export interface CategoryMeta {
  labelKey: `category.${Category}`;
  Icon: LucideIcon;
  accentClass: string;
  surfaceClass: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  'food-drinks': {
    labelKey: 'category.food-drinks',
    Icon: Utensils,
    accentClass: 'text-emerald-300',
    surfaceClass: 'bg-emerald-400/20',
  },
  'coffee-bubble-tea': {
    labelKey: 'category.coffee-bubble-tea',
    Icon: Coffee,
    accentClass: 'text-sky-300',
    surfaceClass: 'bg-sky-400/20',
  },
  transportation: {
    labelKey: 'category.transportation',
    Icon: Bus,
    accentClass: 'text-blue-300',
    surfaceClass: 'bg-blue-400/20',
  },
  shopping: {
    labelKey: 'category.shopping',
    Icon: ShoppingBag,
    accentClass: 'text-rose-300',
    surfaceClass: 'bg-rose-400/20',
  },
  'bills-utilities': {
    labelKey: 'category.bills-utilities',
    Icon: ReceiptText,
    accentClass: 'text-cyan-300',
    surfaceClass: 'bg-cyan-400/20',
  },
  healthcare: {
    labelKey: 'category.healthcare',
    Icon: HeartPulse,
    accentClass: 'text-emerald-200',
    surfaceClass: 'bg-emerald-300/20',
  },
  entertainment: {
    labelKey: 'category.entertainment',
    Icon: Clapperboard,
    accentClass: 'text-amber-300',
    surfaceClass: 'bg-amber-300/20',
  },
  'transfers-debt': {
    labelKey: 'category.transfers-debt',
    Icon: Repeat2,
    accentClass: 'text-slate-300',
    surfaceClass: 'bg-slate-300/20',
  },
  others: {
    labelKey: 'category.others',
    Icon: MoreHorizontal,
    accentClass: 'text-violet-300',
    surfaceClass: 'bg-violet-300/20',
  },
  salary: {
    labelKey: 'category.salary',
    Icon: Wallet,
    accentClass: 'text-emerald-300',
    surfaceClass: 'bg-emerald-300/20',
  },
  allowance: {
    labelKey: 'category.allowance',
    Icon: PiggyBank,
    accentClass: 'text-teal-300',
    surfaceClass: 'bg-teal-300/20',
  },
  bonus: {
    labelKey: 'category.bonus',
    Icon: Gift,
    accentClass: 'text-orange-300',
    surfaceClass: 'bg-orange-300/20',
  },
  'side-income': {
    labelKey: 'category.side-income',
    Icon: HandCoins,
    accentClass: 'text-cyan-300',
    surfaceClass: 'bg-cyan-300/20',
  },
  investment: {
    labelKey: 'category.investment',
    Icon: TrendingUp,
    accentClass: 'text-indigo-300',
    surfaceClass: 'bg-indigo-300/20',
  },
  'temporary-income': {
    labelKey: 'category.temporary-income',
    Icon: Coins,
    accentClass: 'text-pink-300',
    surfaceClass: 'bg-pink-300/20',
  },
};

export function isExpenseVisualCategory(category: Category): category is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly Category[]).includes(category);
}

export function isIncomeVisualCategory(category: Category): category is IncomeCategory {
  return (INCOME_CATEGORIES as readonly Category[]).includes(category);
}

export function categoryToneClass(category: Category): string {
  return isIncomeVisualCategory(category) ? 'text-emerald-300' : 'text-rose-300';
}

export const DEFAULT_EXPENSE_ICON = Landmark;
export const DEFAULT_INCOME_ICON = Banknote;
export const EDUCATION_ICON = GraduationCap;

const DEFAULT_EXPENSE_META: CategoryMeta = {
  labelKey: 'category.others',
  Icon: DEFAULT_EXPENSE_ICON,
  accentClass: 'text-rose-300',
  surfaceClass: 'bg-rose-400/20',
};

const DEFAULT_INCOME_META: CategoryMeta = {
  labelKey: 'category.temporary-income',
  Icon: DEFAULT_INCOME_ICON,
  accentClass: 'text-emerald-300',
  surfaceClass: 'bg-emerald-400/20',
};

function isBuiltInCategory(category: Category): category is typeof CATEGORIES[number] {
  return (CATEGORIES as readonly Category[]).includes(category);
}

export function getCategoryMeta(category: Category): CategoryMeta {
  if (isBuiltInCategory(category)) return CATEGORY_META[category];
  return category.startsWith('custom-income-') ? DEFAULT_INCOME_META : DEFAULT_EXPENSE_META;
}

function humanizeCategoryId(category: Category): string {
  const words = category
    .replace(/^custom-(expense|income)-/, '')
    .split('-')
    .map(word => word.trim())
    .filter(Boolean);

  if (words.length === 0) return 'Custom category';

  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function categoryLabel(
  category: Category,
  customCategories: readonly UserCategory[],
  t: (key: string) => string,
): string {
  const customCategory = customCategories.find(item => item.id === category);
  if (customCategory) return customCategory.name;
  if (isBuiltInCategory(category)) return t(`category.${category}`);
  return humanizeCategoryId(category);
}
