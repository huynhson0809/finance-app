import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import { upsertBudget } from '../../src/db/budgets';
import { monthOf, todayISO } from '../../src/lib/date';
import { __resetDBForTests } from '../../src/db';
import { addTransaction } from '../../src/db/transactions';
import type { Transaction } from '../../src/types';

const cloudHooks = vi.hoisted(() => ({
  recentReload: vi.fn(),
  monthReload: vi.fn(),
  recentState: {
    data: [] as Transaction[],
    loading: false,
    error: null as string | null,
  },
  monthState: {
    data: [] as Transaction[],
    loading: false,
    error: null as string | null,
  },
}));

vi.mock('../../src/hooks/useCloudTransactions', () => ({
  useRecentCloudTransactions: vi.fn(() => ({
    ...cloudHooks.recentState,
    reload: cloudHooks.recentReload,
  })),
  useMonthCloudTransactions: vi.fn(() => ({
    ...cloudHooks.monthState,
    reload: cloudHooks.monthReload,
  })),
}));

import { HomeScreen } from '../../src/ui/HomeScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  cloudHooks.recentReload.mockReset();
  cloudHooks.monthReload.mockReset();
  cloudHooks.recentState.data = [];
  cloudHooks.recentState.loading = false;
  cloudHooks.recentState.error = null;
  cloudHooks.monthState.data = [];
  cloudHooks.monthState.loading = false;
  cloudHooks.monthState.error = null;
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  await __resetDBForTests();
});

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    amount: 10_000,
    currency: 'VND',
    occurredAt: new Date().toISOString(),
    category: 'others',
    source: 'bank-email',
    ...overrides,
  };
}

function anotherDayThisMonth(): string {
  const date = new Date(todayISO());
  date.setDate(date.getDate() === 1 ? 2 : date.getDate() - 1);
  return date.toISOString();
}

describe('HomeScreen', () => {
  it('shows today total, budget status, and recent cloud rows', async () => {
    await upsertBudget(monthOf(todayISO()), 5_000_000);
    cloudHooks.recentState.data = [
      tx({ id: 'recent-1', amount: 10_000, category: 'food-drinks' }),
      tx({ id: 'recent-2', amount: 20_000, category: 'transportation' }),
      tx({ id: 'recent-3', amount: 30_000, category: 'shopping' }),
    ];
    cloudHooks.monthState.data = [
      tx({ id: 'month-1', amount: 1_000_000, category: 'food-drinks' }),
      tx({ id: 'month-2', amount: 500_000, category: 'transportation' }),
      tx({
        id: 'month-old',
        amount: 500_000,
        occurredAt: anotherDayThisMonth(),
        category: 'shopping',
      }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    const headerDiv = document.querySelector('header .text-3xl');
    expect(/1[.,]500[.,]000/.test(headerDiv?.textContent ?? '')).toBe(true);
    expect(screen.getByText(/3[.,]000[.,]000/)).toBeInTheDocument();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Food & Drinks')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Shopping')).toBeInTheDocument();
  });

  it('shows noBudget message when no budget is set', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);
    expect(await screen.findByText('No budget set')).toBeInTheDocument();
  });

  it('does not surface local backup reminders in the cloud home path', async () => {
    await addTransaction({
      amount: 1000,
      currency: 'VND',
      occurredAt: '2026-06-15T08:00:00.000Z',
      category: 'others',
      source: 'manual',
    });

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('No budget set')).toBeInTheDocument();
    });
    expect(screen.queryByText(/backup|sao lưu/i)).not.toBeInTheDocument();
  });

  it('renders BudgetAlert banner when cloud monthly rows exceed the budget', async () => {
    await upsertBudget(monthOf(todayISO()), 1000);
    cloudHooks.monthState.data = [
      tx({ amount: 1500, category: 'food-drinks' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toHaveTextContent('Total spending exceeds the monthly budget');
  });

  it('shows cloud loading text for the recent list', () => {
    cloudHooks.recentState.loading = true;

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getAllByText('Loading transactions...').length).toBeGreaterThan(0);
  });

  it('shows monthly loading instead of zeroed budget summary while month rows load', async () => {
    await upsertBudget(monthOf(todayISO()), 1000);
    cloudHooks.monthState.loading = true;

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getAllByText('Loading transactions...').length).toBeGreaterThan(0);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows monthly errors without zeroed budget summary', async () => {
    await upsertBudget(monthOf(todayISO()), 1000);
    cloudHooks.monthState.error = 'Month fetch failed';

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getByRole('alert')).toHaveTextContent('Month fetch failed');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    const headerTotal = document.querySelector('header .text-3xl')?.textContent ?? '';
    expect(headerTotal).not.toMatch(/0/);
  });

  it('shows cloud fetch errors and retries both cloud hooks', async () => {
    const user = userEvent.setup();
    cloudHooks.recentState.error = 'Recent fetch failed';
    cloudHooks.monthState.error = 'Month fetch failed';

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Recent fetch failed');
    expect(alert).toHaveTextContent('Month fetch failed');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(cloudHooks.recentReload).toHaveBeenCalledTimes(1);
    expect(cloudHooks.monthReload).toHaveBeenCalledTimes(1);
  });

  it('does not show an empty recent list message when recent loading fails', () => {
    cloudHooks.recentState.error = 'Recent fetch failed';
    cloudHooks.recentState.data = [];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getByRole('alert')).toHaveTextContent('Recent fetch failed');
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument();
  });

  it('deduplicates identical cloud fetch errors', () => {
    cloudHooks.recentState.error = 'Supabase is not configured';
    cloudHooks.monthState.error = 'Supabase is not configured';

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    const alertText = screen.getByRole('alert').textContent ?? '';
    const matches = alertText.match(/Supabase is not configured/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
