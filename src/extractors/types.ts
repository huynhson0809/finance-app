import type { BankHint } from '../types';
export type { BankHint };
export type OcrBankHint = Exclude<BankHint, 'mb' | 'acb'>;

export interface Extracted {
  amount?: number;
  merchant?: string;
  occurredAt?: string;
}
