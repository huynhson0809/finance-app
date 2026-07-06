import { render, screen } from '@testing-library/react';
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
});
