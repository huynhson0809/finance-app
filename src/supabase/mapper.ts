import { classify, SEED_RULES } from '../categorizer';
import type { BankHint, Category, Transaction, TransactionSource } from '../types';

export type CloudBank = 'MB' | 'ACB';
export type CloudTransactionType = 'transfer' | 'card' | 'balance_alert' | 'manual' | 'receipt' | 'bank_screenshot';

export interface CloudTransactionRow {
  id: string;
  bank: CloudBank | null;
  type: CloudTransactionType;
  amount: number;
  currency: 'VND';
  transaction_time: string;
  content: string;
  raw_source: 'email' | TransactionSource;
  merchant: string | null;
  category: Category | null;
  note: string | null;
  bank_hint: BankHint | null;
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

export function mapTransactionRow(row: CloudTransactionRow): Transaction {
  if (row.raw_source !== 'email') {
    return {
      id: row.id,
      amount: row.amount,
      currency: 'VND',
      occurredAt: row.transaction_time,
      merchant: row.merchant ?? row.content,
      category: row.category ?? 'others',
      note: row.note ?? undefined,
      source: row.raw_source,
      bankHint: row.bank_hint ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    };
  }

  const category = row.category ?? classify(row.content, CLOUD_CLASSIFICATION_RULES)?.category ?? 'others';
  return {
    id: row.id,
    amount: row.amount,
    currency: 'VND',
    occurredAt: row.transaction_time,
    merchant: row.content,
    category,
    note: `${row.bank} ${row.type}`,
    source: 'bank-email',
    bankHint: row.bank ? bankHint(row.bank) : undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}
