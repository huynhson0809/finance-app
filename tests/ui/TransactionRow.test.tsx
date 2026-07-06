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
});
