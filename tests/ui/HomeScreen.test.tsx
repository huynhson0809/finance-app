import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeScreen } from '../../src/ui/HomeScreen';
import { initI18n } from '../../src/i18n';
import { addTransaction } from '../../src/db/transactions';
import { upsertBudget } from '../../src/db/budgets';
import { monthOf, todayISO } from '../../src/lib/date';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('HomeScreen', () => {
  it('shows today total, budget remaining, and last 5 rows', async () => {
    await upsertBudget(monthOf(todayISO()), 5_000_000);
    for (let i = 0; i < 6; i++) {
      await addTransaction({
        amount: 10000 * (i + 1), currency: 'VND',
        occurredAt: new Date().toISOString(),
        category: 'others', source: 'manual',
      });
    }
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
    // today total (210,000 VND from 6 transactions)
    const headerDiv = document.querySelector('header .text-3xl');
    expect(/210[.,]000/.test(headerDiv?.textContent ?? '')).toBe(true);
    // last 5 rows only
    const rows = await screen.findAllByRole('listitem');
    expect(rows.length).toBe(5);
  });

  it('shows noBudget message when no budget is set', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);
    expect(await screen.findByText(/Chưa đặt|No budget/)).toBeInTheDocument();
  });
});
