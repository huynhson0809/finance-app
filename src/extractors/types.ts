import type { BankHint } from '../types';
export type { BankHint };

export interface Extracted {
  amount?: number;
  merchant?: string;
  occurredAt?: string;
}
