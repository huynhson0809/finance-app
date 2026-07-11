export type AssetAccountKind = 'cash' | 'bank' | 'credit_card' | 'savings' | 'gold' | 'foreign_currency';
export type AssetCurrency = 'VND' | 'USD';
export type GoldUnit = 'gram' | 'chi' | 'luong';
export type AssetEventType =
  | 'opening_balance'
  | 'manual_adjustment'
  | 'expense'
  | 'income'
  | 'transfer_in'
  | 'transfer_out'
  | 'card_refund'
  | 'card_payment'
  | 'bank_email_sync';

export interface AssetAccount {
  id: string;
  userId?: string;
  kind: AssetAccountKind;
  name: string;
  currency: AssetCurrency;
  balance: number;
  quantity?: number;
  goldUnit?: GoldUnit;
  bank?: string | null;
  accountIdentifier?: string | null;
  cardIdentifier?: string | null;
  includeInTotal: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRate {
  id: string;
  userId?: string;
  pair: 'USD_VND' | 'GOLD_GRAM_VND';
  value: number;
  source: 'auto' | 'manual';
  fetchedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetEvent {
  id: string;
  userId?: string;
  accountId: string;
  counterpartyAccountId?: string | null;
  transactionId?: string | null;
  type: AssetEventType;
  amount: number;
  currency: AssetCurrency;
  balanceAfter?: number | null;
  note?: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface AssetSummary {
  totalAssetsVnd: number;
  liquidVnd: number;
  savingsVnd: number;
  liabilityVnd: number;
  byAccount: Array<{ account: AssetAccount; valueVnd: number }>;
}
