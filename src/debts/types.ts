export type DebtDirection = 'lent' | 'borrowed';

export interface Debt {
  id: string;
  direction: DebtDirection;
  personName: string;
  totalAmount: number;
  currency: string;
  note: string;
  settled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  amount: number;
  note: string;
  paidAt: string;
  createdAt: string;
}

export interface DebtWithPayments extends Debt {
  payments: DebtPayment[];
  paidAmount: number;
  remainingAmount: number;
}

export interface DebtInput {
  direction: DebtDirection;
  personName: string;
  totalAmount: number;
  note?: string;
}

export interface DebtPaymentInput {
  debtId: string;
  amount: number;
  note?: string;
}
