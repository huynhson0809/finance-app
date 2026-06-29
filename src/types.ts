export type Category =
  | 'food-drinks'
  | 'coffee-bubble-tea'
  | 'transportation'
  | 'shopping'
  | 'bills-utilities'
  | 'healthcare'
  | 'entertainment'
  | 'transfers-debt'
  | 'others';

export const CATEGORIES: readonly Category[] = [
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

export type TransactionSource = 'manual' | 'receipt' | 'bank-screenshot';
export type BankHint = 'vietcombank' | 'techcombank' | 'momo' | 'zalopay';

export interface Transaction {
  id: string;
  amount: number;         // integer VND
  currency: 'VND';
  occurredAt: string;     // ISO 8601
  merchant?: string;
  category: Category;
  note?: string;
  source: TransactionSource;
  bankHint?: BankHint;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  month: string;          // 'YYYY-MM'
  total: number;          // integer VND
  caps: Partial<Record<Category, number>>;
}

export interface CategoryRule {
  id: string;
  pattern: string;
  category: Category;
  weight: number;
  learned: boolean;
}

export interface Setting<T = unknown> {
  key: string;
  value: T;
}
