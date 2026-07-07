import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import { upsertBudget } from '../../src/db/budgets';
import { monthOfVietnamDate, todayVietnamDate } from '../../src/lib/date';
import { __resetDBForTests } from '../../src/db';
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

const categoryMutationMocks = vi.hoisted(() => ({
  supabase: {},
  updateCloudTransactionCategory: vi.fn(),
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

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return categoryMutationMocks.supabase;
  },
}));

vi.mock('../../src/supabase/transactions', () => ({
  updateCloudTransactionCategory: categoryMutationMocks.updateCloudTransactionCategory,
}));

import { HomeScreen } from '../../src/ui/HomeScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  cloudHooks.recentReload.mockReset();
  cloudHooks.recentReload.mockResolvedValue(undefined);
  cloudHooks.monthReload.mockReset();
  cloudHooks.monthReload.mockResolvedValue(undefined);
  categoryMutationMocks.supabase = {};
  categoryMutationMocks.updateCloudTransactionCategory.mockReset();
  categoryMutationMocks.updateCloudTransactionCategory.mockResolvedValue(undefined);
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
    occurredAt: vietnamNoonISO(todayVietnamDate()),
    category: 'others',
    direction: 'expense',
    source: 'bank-email',
    ...overrides,
  };
}

function anotherDayThisMonth(): string {
  const today = todayVietnamDate();
  const day = Number(today.slice(8, 10));
  const otherDay = String(day === 1 ? 2 : day - 1).padStart(2, '0');
  return vietnamNoonISO(`${today.slice(0, 8)}${otherDay}`);
}

function currentVietnamMonth(): string {
  return monthOfVietnamDate(todayVietnamDate());
}

function vietnamNoonISO(date: string): string {
  return new Date(`${date}T12:00:00+07:00`).toISOString();
}

describe('HomeScreen', () => {
  it('shows today total, budget status, and recent cloud rows', async () => {
    await upsertBudget(currentVietnamMonth(), 5_000_000);
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

    expect(screen.getByRole('region', { name: /monthly overview/i })).toBeInTheDocument();
    expect(screen.getByText(/today's spend/i)).toBeInTheDocument();
    expect(screen.getByText(/today's income/i)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]500[.,]000/)).toBeInTheDocument();
    expect(screen.getByText(/3[.,]000[.,]000/)).toBeInTheDocument();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole('combobox', { name: /Transaction category/ })).toHaveValue('food-drinks');
    expect(within(rows[2]).getByRole('combobox', { name: /Transaction category/ })).toHaveValue('shopping');
  });

  it('shows today expense and today income separately', () => {
    cloudHooks.monthState.data = [
      tx({ id: 'expense-today', amount: 25_000, direction: 'expense', category: 'food-drinks' }),
      tx({ id: 'income-today', amount: 100_000, direction: 'income', category: 'salary' }),
      tx({
        id: 'expense-other-day',
        amount: 50_000,
        direction: 'expense',
        category: 'shopping',
        occurredAt: anotherDayThisMonth(),
      }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getByText("Today's spend")).toBeInTheDocument();
    expect(screen.getByText("Today's income")).toBeInTheDocument();
    expect(screen.getByText(/25[.,]000/)).toBeInTheDocument();
    expect(screen.getByText(/100[.,]000/)).toBeInTheDocument();
  });

  it('updates a recent transaction category and refreshes cloud data', async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: Transaction) => void;
    categoryMutationMocks.updateCloudTransactionCategory.mockReturnValue(
      new Promise<Transaction>(resolve => {
        resolveUpdate = resolve;
      }),
    );
    cloudHooks.recentState.data = [
      tx({ id: 'email-1', category: 'others' }),
    ];
    cloudHooks.monthState.data = [
      tx({ id: 'month-1', category: 'others' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    const categorySelect = screen.getByRole('combobox', { name: /Transaction category/ });
    await user.selectOptions(categorySelect, 'shopping');

    await waitFor(() => {
      expect(categoryMutationMocks.updateCloudTransactionCategory).toHaveBeenCalledWith(
        expect.anything(),
        'email-1',
        'shopping',
      );
    });
    expect(categorySelect).toBeDisabled();

    resolveUpdate(tx({ id: 'email-1', category: 'shopping' }));

    await waitFor(() => {
      expect(cloudHooks.recentReload).toHaveBeenCalledTimes(1);
      expect(cloudHooks.monthReload).toHaveBeenCalledTimes(1);
      expect(categorySelect).not.toBeDisabled();
    });
  });

  it('disables every recent category control while a category update is pending', async () => {
    const user = userEvent.setup();
    categoryMutationMocks.updateCloudTransactionCategory.mockReturnValue(new Promise(() => {}));
    cloudHooks.recentState.data = [
      tx({ id: 'email-1', amount: 10_000, category: 'others' }),
      tx({ id: 'email-2', amount: 20_000, category: 'food-drinks' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await user.selectOptions(
      screen.getAllByRole('combobox', { name: /Transaction category/ })[0],
      'shopping',
    );

    await waitFor(() => {
      expect(categoryMutationMocks.updateCloudTransactionCategory).toHaveBeenCalledTimes(1);
    });

    const categorySelects = screen.getAllByRole('combobox', { name: /Transaction category/ });
    expect(categorySelects).toHaveLength(2);
    expect(categorySelects[0]).toBeDisabled();
    expect(categorySelects[1]).toBeDisabled();
  });

  it('gives recent category controls distinct accessible names', () => {
    cloudHooks.recentState.data = [
      tx({ id: 'email-1', amount: 10_000, category: 'others' }),
      tx({ id: 'email-2', amount: 20_000, category: 'food-drinks' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    const categorySelects = screen.getAllByRole('combobox', { name: /Transaction category/ });
    const accessibleNames = categorySelects.map(select => select.getAttribute('aria-label'));
    expect(new Set(accessibleNames).size).toBe(categorySelects.length);
    expect(accessibleNames).toEqual([
      expect.stringContaining('email-1'),
      expect.stringContaining('email-2'),
    ]);
  });

  it('keeps recent category accessible names unique for matching merchant and amount', () => {
    cloudHooks.recentState.data = [
      tx({ id: 'email-1', merchant: 'Corner Store', amount: 10_000, category: 'others' }),
      tx({ id: 'email-2', merchant: 'Corner Store', amount: 10_000, category: 'food-drinks' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    const categorySelects = screen.getAllByRole('combobox', { name: /Transaction category/ });
    const accessibleNames = categorySelects.map(select => select.getAttribute('aria-label'));
    expect(new Set(accessibleNames).size).toBe(categorySelects.length);
    expect(accessibleNames).toEqual([
      expect.stringContaining('email-1'),
      expect.stringContaining('email-2'),
    ]);
  });

  it('shows a visible error when category update fails', async () => {
    const user = userEvent.setup();
    categoryMutationMocks.updateCloudTransactionCategory.mockRejectedValue(
      new Error('Supabase category update failed'),
    );
    cloudHooks.recentState.data = [
      tx({ id: 'email-1', category: 'others' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await user.selectOptions(
      screen.getByRole('combobox', { name: /Transaction category/ }),
      'shopping',
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not update category');
    expect(alert).toHaveTextContent('Supabase category update failed');
    expect(cloudHooks.recentReload).not.toHaveBeenCalled();
    expect(cloudHooks.monthReload).not.toHaveBeenCalled();
  });

  it('shows noBudget message when no budget is set', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);
    expect(await screen.findByText('No budget set')).toBeInTheDocument();
  });

  it('keeps manual and image add actions visible on the cloud home path', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'Add' })).toHaveAttribute('href', '/add');
    expect(screen.getByLabelText('Add by image')).toBeInTheDocument();
  });

  it('keeps the image add action available from the dashboard', () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getByLabelText(/image|hình ảnh|ảnh/i)).toBeInTheDocument();
  });

  it('does not surface local backup reminders in the cloud home path', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('No budget set')).toBeInTheDocument();
    });
    expect(screen.queryByText(/backup|sao lưu/i)).not.toBeInTheDocument();
  });

  it('renders BudgetAlert banner when cloud monthly rows exceed the budget', async () => {
    await upsertBudget(currentVietnamMonth(), 1000);
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
    await upsertBudget(currentVietnamMonth(), 1000);
    cloudHooks.monthState.loading = true;

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getAllByText('Loading transactions...').length).toBeGreaterThan(0);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows monthly errors without zeroed budget summary', async () => {
    await upsertBudget(currentVietnamMonth(), 1000);
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
