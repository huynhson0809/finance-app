import { classify, SEED_RULES } from '../categorizer';
import {
  type BankHint,
  type Category,
  type CloudBank,
  type CloudRawSource,
  type CloudTransactionType,
  type ExpenseCategory,
  type IncomeCategory,
  type Transaction,
  type TransactionDirection,
  categoryBelongsToDirection,
} from '../types';

export interface CloudTransactionRow {
  id: string;
  bank: CloudBank | null;
  type: CloudTransactionType;
  amount: number;
  currency: 'VND';
  transaction_time: string;
  content: string;
  direction?: TransactionDirection | null;
  raw_source: CloudRawSource;
  merchant: string | null;
  category: Category | null;
  note: string | null;
  bank_hint: BankHint | null;
  asset_account_id: string | null;
  counterparty_asset_account_id: string | null;
  asset_event_id: string | null;
  created_at: string;
}

const CLOUD_EXCLUDED_CLASSIFICATION_PATTERNS = new Set([
  'transfer',
  'chuyen khoan',
  'vietcombank',
  'techcombank',
]);

const CLOUD_CLASSIFICATION_RULES = SEED_RULES.filter(rule =>
  !CLOUD_EXCLUDED_CLASSIFICATION_PATTERNS.has(rule.pattern),
);

function bankHint(bank: CloudBank): BankHint {
  return bank === 'MB' ? 'mb' : 'acb';
}

function direction(row: CloudTransactionRow): TransactionDirection {
  return row.direction ?? 'expense';
}

function isExpenseCategory(category: Category | null | undefined): category is ExpenseCategory {
  return category != null && categoryBelongsToDirection(category, 'expense');
}

function isIncomeCategory(category: Category | null | undefined): category is IncomeCategory {
  return category != null && categoryBelongsToDirection(category, 'income');
}

function expenseCategoryForEmail(row: CloudTransactionRow): ExpenseCategory {
  if (isExpenseCategory(row.category) && row.category !== 'others') {
    return row.category;
  }

  const classifiedCategory = classify(row.content, CLOUD_CLASSIFICATION_RULES)?.category;
  if (isExpenseCategory(classifiedCategory)) {
    return classifiedCategory;
  }
  return isExpenseCategory(row.category) ? row.category : 'others';
}

function categoryForDirection(row: CloudTransactionRow, transactionDirection: 'expense'): ExpenseCategory;
function categoryForDirection(row: CloudTransactionRow, transactionDirection: 'income'): IncomeCategory;
function categoryForDirection(
  row: CloudTransactionRow,
  transactionDirection: TransactionDirection,
): ExpenseCategory | IncomeCategory {
  if (transactionDirection === 'income') {
    return isIncomeCategory(row.category) ? row.category : 'temporary-income';
  }

  return isExpenseCategory(row.category) ? row.category : 'others';
}

function assetLinks(row: CloudTransactionRow): Pick<
  Transaction,
  'assetAccountId' | 'counterpartyAssetAccountId' | 'assetEventId'
> {
  return {
    assetAccountId: row.asset_account_id,
    counterpartyAssetAccountId: row.counterparty_asset_account_id,
    assetEventId: row.asset_event_id,
  };
}

export function mapTransactionRow(row: CloudTransactionRow): Transaction {
  const transactionDirection = direction(row);

  if (row.raw_source !== 'email') {
    if (transactionDirection === 'income') {
      return {
        id: row.id,
        amount: row.amount,
        currency: 'VND',
        occurredAt: row.transaction_time,
        merchant: row.merchant ?? row.content,
        direction: 'income',
        category: categoryForDirection(row, 'income'),
        note: row.note ?? undefined,
        source: row.raw_source,
        bankHint: row.bank_hint ?? undefined,
        bank: row.bank ?? undefined,
        transactionType: row.type,
        rawSource: row.raw_source,
        ...assetLinks(row),
        createdAt: row.created_at,
        updatedAt: row.created_at,
      };
    }

    return {
      id: row.id,
      amount: row.amount,
      currency: 'VND',
      occurredAt: row.transaction_time,
      merchant: row.merchant ?? row.content,
      direction: 'expense',
      category: categoryForDirection(row, 'expense'),
      note: row.note ?? undefined,
      source: row.raw_source,
      bankHint: row.bank_hint ?? undefined,
      bank: row.bank ?? undefined,
      transactionType: row.type,
      rawSource: row.raw_source,
      ...assetLinks(row),
      createdAt: row.created_at,
      updatedAt: row.created_at,
    };
  }

  if (transactionDirection === 'income') {
    return {
      id: row.id,
      amount: row.amount,
      currency: 'VND',
      occurredAt: row.transaction_time,
      merchant: row.content,
      direction: 'income',
      category: categoryForDirection(row, 'income'),
      note: `${row.bank} ${row.type}`,
      source: 'bank-email',
      bankHint: row.bank ? bankHint(row.bank) : undefined,
      bank: row.bank ?? undefined,
      transactionType: row.type,
      rawSource: row.raw_source,
      ...assetLinks(row),
      createdAt: row.created_at,
      updatedAt: row.created_at,
    };
  }

  const category = expenseCategoryForEmail(row);
  return {
    id: row.id,
    amount: row.amount,
    currency: 'VND',
    occurredAt: row.transaction_time,
    merchant: row.content,
    direction: 'expense',
    category,
    note: `${row.bank} ${row.type}`,
    source: 'bank-email',
    bankHint: row.bank ? bankHint(row.bank) : undefined,
    bank: row.bank ?? undefined,
    transactionType: row.type,
    rawSource: row.raw_source,
    ...assetLinks(row),
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}
