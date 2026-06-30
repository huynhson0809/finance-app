import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { initI18n } from '../../src/i18n';
import { __resetDBForTests } from '../../src/db';
import { addTransaction } from '../../src/db/transactions';
import { upsertBudget } from '../../src/db/budgets';
import { ReportsScreen } from '../../src/ui/ReportsScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
});

describe('ReportsScreen', () => {
  it('shows empty state when the current month has no transactions', async () => {
    render(<MemoryRouter><ReportsScreen /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/no spending|chưa có chi tiêu/i)).toBeInTheDocument();
    });
  });

  it('shows over-budget banner when overall exceeded', async () => {
    await upsertBudget('2099-06', 1000);
    // back-date to ensure overflow regardless of current month
    const now = new Date('2099-06-10T00:00:00.000Z').toISOString();
    await addTransaction({
      amount: 1500, currency: 'VND', occurredAt: now,
      category: 'food-drinks', source: 'manual',
    });
    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);
    await waitFor(() => screen.getByRole('alert'));
  });
});
