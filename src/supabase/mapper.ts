import { classify, SEED_RULES } from '../categorizer';
import type { BankHint, Transaction } from '../types';

export type CloudBank = 'MB' | 'ACB';
export type CloudTransactionType = 'transfer' | 'card' | 'balance_alert';

export interface CloudTransactionRow {
  id: string;
  bank: CloudBank;
  type: CloudTransactionType;
  amount: number;
  currency: 'VND';
  transaction_time: string;
  content: string;
  raw_source: 'email';
  created_at: string;
}

const CLOUD_CLASSIFICATION_RULES = SEED_RULES.filter(rule => rule.pattern !== 'transfer');

function bankHint(bank: CloudBank): BankHint {
  return bank === 'MB' ? 'mb' : 'acb';
}

export function mapTransactionRow(row: CloudTransactionRow): Transaction {
  const suggestion = classify(row.content, CLOUD_CLASSIFICATION_RULES);
  return {
    id: row.id,
    amount: row.amount,
    currency: 'VND',
    occurredAt: row.transaction_time,
    merchant: row.content,
    category: suggestion?.category ?? 'others',
    note: `${row.bank} ${row.type}`,
    source: 'bank-email',
    bankHint: bankHint(row.bank),
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}
