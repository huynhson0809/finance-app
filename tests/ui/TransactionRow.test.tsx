import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { initI18n } from '../../src/i18n';
import { TransactionRow } from '../../src/ui/components/TransactionRow';
import type { Transaction } from '../../src/types';

beforeAll(async () => { await initI18n(); });

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    amount: 297000,
    currency: 'VND',
    occurredAt: '2026-07-04T14:48:49.000Z',
    category: 'others',
    direction: 'expense',
    source: 'bank-email',
    createdAt: '2026-07-04T14:48:50.000Z',
    updatedAt: '2026-07-04T14:48:50.000Z',
    ...overrides,
  };
}

function renderRow(transaction: Transaction, locale: 'vi' | 'en' = 'vi') {
  return render(
    <MemoryRouter>
      <TransactionRow t={transaction} locale={locale} />
    </MemoryRouter>,
  );
}

describe('TransactionRow', () => {
  it('shows category and date information', () => {
    renderRow(tx());

    expect(screen.getByText('Khác')).toBeInTheDocument();
    expect(screen.getByText(/04\/07\/2026/)).toBeInTheDocument();
  });

  it('links to the transaction detail screen', () => {
    renderRow(tx({ id: 'tx-42', merchant: 'Corner Store' }), 'en');

    expect(screen.getByRole('link', { name: /Corner Store/ })).toHaveAttribute('href', '/transactions/tx-42');
  });

  it('shows income amounts with a plus sign', () => {
    renderRow(tx({ amount: 1_250_000, direction: 'income', category: 'salary' }), 'en');

    expect(screen.getByText(/\+\D*1[.,]250[.,]000/)).toBeInTheDocument();
  });

  it('shows expense amounts with minus sign and without an inline category combobox', () => {
    renderRow(tx({ amount: 297_000, direction: 'expense', category: 'others' }), 'en');

    const amount = screen.getByText(/-\D*297[.,]000/);
    expect(amount).toHaveTextContent(/^-₫297,000$/);
    expect(screen.queryByRole('combobox', { name: /transaction category|danh mục giao dịch/i })).not.toBeInTheDocument();
  });

  it('uses a useful accessible link name with title, date, and amount', () => {
    renderRow(tx({ merchant: 'Grab* BXTTDKA62JSE', amount: 38_560, category: 'transportation' }), 'en');

    expect(screen.getByRole('link', { name: /Grab.*07\/04\/2026.*38/i })).toBeInTheDocument();
  });
});
