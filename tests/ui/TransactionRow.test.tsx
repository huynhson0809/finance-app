import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

describe('TransactionRow', () => {
  it('shows the transaction date so recent rows are not confused with today spend', async () => {
    render(<TransactionRow t={tx()} locale="vi" />);

    expect(screen.getByText('Khác')).toBeInTheDocument();
    expect(screen.getByText(/04\/07\/2026/)).toBeInTheDocument();
  });

  it('lets the user choose a new category', async () => {
    const user = userEvent.setup();
    const onCategoryChange = vi.fn();

    render(
      <TransactionRow
        t={tx({ id: 'tx-42', category: 'others' })}
        locale="vi"
        onCategoryChange={onCategoryChange}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Danh mục giao dịch' }), 'shopping');

    expect(onCategoryChange).toHaveBeenCalledWith('tx-42', 'shopping');
  });

  it('uses a custom accessible category label when provided', () => {
    render(
      <TransactionRow
        t={tx({ id: 'tx-42', category: 'others' })}
        locale="vi"
        onCategoryChange={vi.fn()}
        categoryLabel="Danh mục giao dịch tx-42 ₫297.000"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Danh mục giao dịch tx-42 ₫297.000' })).toHaveValue('others');
  });

  it('disables category editing while the row is saving', () => {
    render(
      <TransactionRow
        t={tx({ category: 'others' })}
        locale="vi"
        onCategoryChange={vi.fn()}
        categorySaving
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Danh mục giao dịch' })).toBeDisabled();
  });

  it('shows income amounts with a plus sign', () => {
    render(
      <TransactionRow
        t={tx({ amount: 1_250_000, direction: 'income', category: 'salary' })}
        locale="en"
      />,
    );

    expect(screen.getByText(/\+\D*1[.,]250[.,]000/)).toBeInTheDocument();
  });

  it('shows expense amounts with a minus sign', () => {
    render(
      <TransactionRow
        t={tx({ amount: 297_000, direction: 'expense', category: 'others' })}
        locale="en"
      />,
    );

    expect(screen.getByText(/-\D*297[.,]000/)).toBeInTheDocument();
  });

  it('only offers categories for the transaction direction when editing', () => {
    render(
      <TransactionRow
        t={tx({ direction: 'income', category: 'salary' })}
        locale="en"
        onCategoryChange={vi.fn()}
      />,
    );

    const options = screen.getAllByRole('option').map(option => option.getAttribute('value'));
    expect(options).toContain('salary');
    expect(options).toContain('bonus');
    expect(options).not.toContain('food-drinks');
    expect(options).not.toContain('shopping');
  });
});
