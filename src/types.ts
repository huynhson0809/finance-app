import type { AssetCurrency } from './assets/types';

export type CustomExpenseCategory = `custom-expense-${string}`;
export type CustomIncomeCategory = `custom-income-${string}`;

export type BuiltInExpenseCategory =
  | 'food-drinks'
  | 'coffee-bubble-tea'
  | 'transportation'
  | 'shopping'
  | 'bills-utilities'
  | 'healthcare'
  | 'entertainment'
  | 'transfers-debt'
  | 'others';

export type BuiltInIncomeCategory =
  | 'salary'
  | 'allowance'
  | 'bonus'
  | 'side-income'
  | 'investment'
  | 'temporary-income';

export type ExpenseCategory = BuiltInExpenseCategory | CustomExpenseCategory;

export type IncomeCategory = BuiltInIncomeCategory | CustomIncomeCategory;

export type Category = ExpenseCategory | IncomeCategory;
export type BuiltInCategory = BuiltInExpenseCategory | BuiltInIncomeCategory;

type BuiltInCategoryList<T extends BuiltInCategory> = readonly T[] & {
  includes(category: Category): boolean;
};

export type TransactionDirection = 'expense' | 'income';

export type CategoryIconKey =
  | 'utensils'
  | 'coffee'
  | 'transportation'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'entertainment'
  | 'transfer'
  | 'wallet'
  | 'piggy'
  | 'gift'
  | 'coins'
  | 'bank'
  | 'other';

export interface UserCategory {
  id: CustomExpenseCategory | CustomIncomeCategory;
  direction: TransactionDirection;
  name: string;
  iconKey?: CategoryIconKey;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryOverride {
  category: BuiltInCategory;
  name?: string;
  iconKey?: CategoryIconKey;
  updatedAt: string;
}

export interface CategoryOrder {
  direction: TransactionDirection;
  categories: Category[];
  updatedAt: string;
}

export const EXPENSE_CATEGORIES: BuiltInCategoryList<BuiltInExpenseCategory> = [
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

export const INCOME_CATEGORIES: BuiltInCategoryList<BuiltInIncomeCategory> = [
  'salary',
  'allowance',
  'bonus',
  'side-income',
  'investment',
  'temporary-income',
];

export const CATEGORIES: BuiltInCategoryList<BuiltInCategory> = [
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
  if (category.startsWith('custom-expense-')) return direction === 'expense';
  if (category.startsWith('custom-income-')) return direction === 'income';
  return categoriesForDirection(direction).includes(category);
}

export type TransactionSource = 'manual' | 'receipt' | 'bank-screenshot' | 'bank-email';
export type BankHint = 'vietcombank' | 'techcombank' | 'momo' | 'zalopay' | 'mb' | 'acb';
export type CloudBank = 'MB' | 'ACB';
export type CloudTransactionType =
  | 'transfer'
  | 'card'
  | 'balance_alert'
  | 'manual'
  | 'receipt'
  | 'bank_screenshot';
export type CloudRawSource = 'email' | 'manual' | 'receipt' | 'bank-screenshot';

interface TransactionBase {
  id: string;
  amount: number;         // integer VND
  currency: 'VND';
  occurredAt: string;     // ISO 8601
  merchant?: string;
  note?: string;
  source: TransactionSource;
  bankHint?: BankHint;
  bank?: CloudBank;
  transactionType?: CloudTransactionType;
  rawSource?: CloudRawSource;
  assetAccountId?: string | null;
  counterpartyAssetAccountId?: string | null;
  assetEventId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Transaction = TransactionBase & (
  | { direction: 'expense'; category: ExpenseCategory }
  | { direction: 'income'; category: IncomeCategory }
);

export interface TransactionAssetLinkInput {
  assetAccountId?: string | null;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: AssetCurrency;
  occurredAt: string;
  note?: string;
  operationId: string;
}

export interface Budget {
  id: string;
  month: string;          // 'YYYY-MM'
  total: number;          // integer VND
  savingsTarget?: number; // integer VND
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
