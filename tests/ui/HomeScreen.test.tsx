import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import { upsertBudget } from '../../src/db/budgets';
import { monthOfVietnamDate, todayVietnamDate } from '../../src/lib/date';
import { __resetDBForTests } from '../../src/db';
import type { Transaction, UserCategory } from '../../src/types';
import type { AssetAccount, AssetSummary } from '../../src/assets/types';

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

const customCategoryHooks = vi.hoisted(() => ({
  useCustomCategories: vi.fn(),
  state: {
    categories: [] as UserCategory[],
    loading: false,
    error: null as string | null,
    reload: vi.fn(),
    addCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
  },
}));

const assetHooks = vi.hoisted(() => ({
  useAssetSummary: vi.fn(),
  state: {
    data: {
      totalAssetsVnd: 0,
      liquidVnd: 0,
      savingsVnd: 0,
      liabilityVnd: 0,
      byAccount: [],
    } as AssetSummary,
    isLoading: false,
    error: null as Error | null,
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

vi.mock('../../src/hooks/useCustomCategories', () => ({
  useCustomCategories: customCategoryHooks.useCustomCategories,
}));

vi.mock('../../src/hooks/useAssets', () => ({
  useAssetSummary: assetHooks.useAssetSummary,
}));

import { HomeScreen } from '../../src/ui/HomeScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  cloudHooks.recentReload.mockReset();
  cloudHooks.recentReload.mockResolvedValue(undefined);
  cloudHooks.monthReload.mockReset();
  cloudHooks.monthReload.mockResolvedValue(undefined);
  cloudHooks.recentState.data = [];
  cloudHooks.recentState.loading = false;
  cloudHooks.recentState.error = null;
  cloudHooks.monthState.data = [];
  cloudHooks.monthState.loading = false;
  cloudHooks.monthState.error = null;
  customCategoryHooks.useCustomCategories.mockReset();
  customCategoryHooks.state.categories = [];
  customCategoryHooks.state.loading = false;
  customCategoryHooks.state.error = null;
  customCategoryHooks.state.reload.mockReset();
  customCategoryHooks.state.addCategory.mockReset();
  customCategoryHooks.state.renameCategory.mockReset();
  customCategoryHooks.state.deleteCategory.mockReset();
  customCategoryHooks.useCustomCategories.mockImplementation(() => customCategoryHooks.state);
  assetHooks.useAssetSummary.mockReset();
  assetHooks.state.data = emptyAssetSummary();
  assetHooks.state.isLoading = false;
  assetHooks.state.error = null;
  assetHooks.useAssetSummary.mockImplementation(() => assetHooks.state);
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

function expectPanelMetric(panel: HTMLElement, label: string | RegExp, value: RegExp) {
  const labelNode = within(panel).getByText(label);
  expect(labelNode.parentElement).toHaveTextContent(value);
}

function emptyAssetSummary(): AssetSummary {
  return {
    totalAssetsVnd: 0,
    liquidVnd: 0,
    savingsVnd: 0,
    liabilityVnd: 0,
    byAccount: [],
  };
}

function assetAccount(overrides: Partial<AssetAccount> = {}): AssetAccount {
  return {
    id: 'asset-cash',
    kind: 'cash',
    name: 'Cash',
    currency: 'VND',
    balance: 1_000_000,
    includeInTotal: true,
    sortOrder: 0,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

describe('HomeScreen', () => {
  it('renders the empty asset summary state', () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(assetHooks.useAssetSummary).toHaveBeenCalled();
    expect(screen.getByText('Chưa thiết lập tài sản')).toBeInTheDocument();
  });

  it('renders non-empty total assets', () => {
    assetHooks.state.data = {
      totalAssetsVnd: 12_500_000,
      liquidVnd: 4_000_000,
      savingsVnd: 9_000_000,
      liabilityVnd: 500_000,
      byAccount: [{ account: assetAccount(), valueVnd: 12_500_000 }],
    };

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getByText(/12[.,]500[.,]000/)).toBeInTheDocument();
  });

  it('navigates to assets when clicking the asset summary', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <HomeScreen />
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /tài sản/i }));

    expect(screen.getByTestId('current-path')).toHaveTextContent('/assets');
  });

  it('shows monthly totals, budget status, today chips, and recent cloud rows', async () => {
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
      tx({
        id: 'month-income',
        amount: 4_500_000,
        direction: 'income',
        category: 'salary',
        occurredAt: anotherDayThisMonth(),
      }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    const monthlyOverview = screen.getByRole('region', { name: /monthly overview/i });
    expectPanelMetric(monthlyOverview, /monthly income/i, /4[.,]500[.,]000/);
    expectPanelMetric(monthlyOverview, /monthly expense/i, /2[.,]000[.,]000/);
    expectPanelMetric(monthlyOverview, /net this month/i, /2[.,]500[.,]000/);
    expectPanelMetric(monthlyOverview, /today's spend/i, /1[.,]500[.,]000/);
    expectPanelMetric(monthlyOverview, /today's income/i, /0/);
    expect(screen.getByText(/3[.,]000[.,]000/)).toBeInTheDocument();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/transactions/recent-1');
    expect(within(rows[2]).getByRole('link')).toHaveAttribute('href', '/transactions/recent-3');
  });

  it('uses spendable budget and shows protected savings in the budget bar', async () => {
    await upsertBudget(currentVietnamMonth(), 5_000_000, undefined, 1_000_000);
    cloudHooks.monthState.data = [
      tx({ id: 'month-expense', amount: 2_000_000, category: 'food-drinks' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    const monthlyOverview = screen.getByRole('region', { name: /monthly overview/i });
    expect(monthlyOverview).toHaveTextContent(/2[.,]000[.,]000\s*\/\s*[^0-9]*4[.,]000[.,]000/);
    expect(monthlyOverview).toHaveTextContent('Protected savings');
    expect(monthlyOverview).toHaveTextContent(/1[.,]000[.,]000/);
  });

  it('uses all monthly expenses including custom categories for remaining budget', async () => {
    await upsertBudget(currentVietnamMonth(), 1_000_000, undefined, 200_000);
    cloudHooks.monthState.data = [
      tx({ id: 'custom-month-expense', amount: 332_000, category: 'custom-expense-date-night' }),
      tx({ id: 'built-in-month-expense', amount: 163_000, category: 'healthcare' }),
      tx({
        id: 'income-does-not-count',
        amount: 50_000,
        direction: 'income',
        category: 'salary',
      }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    const monthlyOverview = screen.getByRole('region', { name: /monthly overview/i });
    expect(monthlyOverview).toHaveTextContent(/495[.,]000\s*\/\s*[^0-9]*800[.,]000/);
    expect(monthlyOverview).toHaveTextContent(/remaining this month:\s*[^0-9]*305[.,]000/i);
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

    const monthlyOverview = screen.getByRole('region', { name: /monthly overview/i });
    expectPanelMetric(monthlyOverview, "Today's spend", /25[.,]000/);
    expectPanelMetric(monthlyOverview, "Today's income", /100[.,]000/);
  });

  it('renders recent transaction rows as links to detail screens', () => {
    cloudHooks.recentState.data = [
      tx({ id: 'email-1', merchant: 'Grab* BXTTDKA62JSE', amount: 38_560, category: 'transportation' }),
      tx({ id: 'income-1', amount: 6_666, direction: 'income', category: 'temporary-income', note: 'ACB Ghi có' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(screen.getByRole('link', { name: /Grab.*38/i })).toHaveAttribute('href', '/transactions/email-1');
    expect(screen.getByRole('link', { name: /ACB Ghi có.*6/i })).toHaveAttribute('href', '/transactions/income-1');
    expect(screen.queryByRole('combobox', { name: /Transaction category/ })).not.toBeInTheDocument();
  });

  it('uses saved custom category names in recent transaction rows', () => {
    customCategoryHooks.state.categories = [{
      id: 'custom-expense-pet-care',
      direction: 'expense',
      name: 'Pet Care',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }];
    cloudHooks.recentState.data = [
      tx({ id: 'custom-pet-care', category: 'custom-expense-pet-care' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(customCategoryHooks.useCustomCategories).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Pet Care/i })).toHaveAttribute('href', '/transactions/custom-pet-care');
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
    const monthlyOverview = screen.getByRole('region', { name: /monthly overview/i });
    expect(within(monthlyOverview).getAllByText('-')).toHaveLength(5);
    expect(within(monthlyOverview).queryByText(/0/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
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
