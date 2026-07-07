export type ExpenseCategory =
  | 'food-drinks'
  | 'coffee-bubble-tea'
  | 'transportation'
  | 'shopping'
  | 'bills-utilities'
  | 'healthcare'
  | 'entertainment'
  | 'transfers-debt'
  | 'others';

export type IncomeCategory =
  | 'salary'
  | 'allowance'
  | 'bonus'
  | 'side-income'
  | 'investment'
  | 'temporary-income';

export type Category = ExpenseCategory | IncomeCategory;

export type TransactionDirection = 'expense' | 'income';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'food-drinks',
  'coffee-bubble-tea',
  'transportation',
  'shopping',
  'bills-utilities',
  'healthcare',
  'entertainment',
  'transfers-debt',
  'others',
];

export const INCOME_CATEGORIES: readonly IncomeCategory[] = [
  'salary',
  'allowance',
  'bonus',
  'side-income',
  'investment',
  'temporary-income',
];

export const CATEGORIES: readonly Category[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
];

export function categoriesForDirection(direction: TransactionDirection): readonly Category[] {
  return direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function categoryBelongsToDirection(
  category: Category,
  direction: TransactionDirection,
): boolean {
  return categoriesForDirection(direction).includes(category);
}

export type TransactionSource = 'manual' | 'receipt' | 'bank-screenshot' | 'bank-email';
export type BankHint = 'vietcombank' | 'techcombank' | 'momo' | 'zalopay' | 'mb' | 'acb';

interface TransactionBase {
  id: string;
  amount: number;         // integer VND
  currency: 'VND';
  occurredAt: string;     // ISO 8601
  merchant?: string;
  note?: string;
  source: TransactionSource;
  bankHint?: BankHint;
  createdAt: string;
  updatedAt: string;
}

export type Transaction = TransactionBase & (
  | { direction: 'expense'; category: ExpenseCategory }
  | { direction: 'income'; category: IncomeCategory }
);

export interface Budget {
  id: string;
  month: string;          // 'YYYY-MM'
  total: number;          // integer VND
  caps: Partial<Record<ExpenseCategory, number>>;
}

export interface CategoryRule {
  id: string;
  pattern: string;
  category: Category;
  weight: number;
  learned: boolean;
  createdAt: string; // ISO 8601 — new in Phase 2
}

export interface Setting<T = unknown> {
  key: string;
  value: T;
}
