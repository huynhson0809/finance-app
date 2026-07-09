import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { initI18n, i18n } from '../../src/i18n';
import { CATEGORIES, type Category, type Transaction, type UserCategory } from '../../src/types';
import type { UseReportsResult } from '../../src/hooks/useReports';

const reportHooks = vi.hoisted(() => ({
  reload: vi.fn(),
  state: null as UseReportsResult | null,
}));

const customCategoryHooks = vi.hoisted(() => ({
  categories: [] as UserCategory[],
}));

const chartMocks = vi.hoisted(() => ({
  monthBarData: [] as Array<Array<{ date: string; total: number }>>,
  pieData: [] as Array<Array<{ label: string; total: number; color: string }>>,
  pieLocales: [] as Array<'vi' | 'en' | undefined>,
}));

vi.mock('../../src/hooks/useReports', () => ({
  useReports: vi.fn(() => reportHooks.state),
}));

vi.mock('../../src/hooks/useCustomCategories', () => ({
  useCustomCategories: vi.fn(() => ({
    categories: customCategoryHooks.categories,
    loading: false,
    error: null,
    reload: vi.fn(),
    addCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
  })),
}));

vi.mock('../../src/ui/components/Charts/MonthBar', () => ({
  MonthBar: ({ data }: { data: Array<{ date: string; total: number }> }) => {
    chartMocks.monthBarData.push(data);

    return <div data-testid="month-bar" />;
  },
}));

vi.mock('../../src/ui/components/Charts/CategoryPie', () => ({
  CategoryPie: ({
    data,
    emptyLabel,
    locale,
  }: {
    data: Array<{ label: string; total: number; color: string }>;
    emptyLabel?: string;
    locale?: 'vi' | 'en';
  }) => {
    chartMocks.pieData.push(data);
    chartMocks.pieLocales.push(locale);

    if (data.every(datum => datum.total === 0)) {
      return <div role="status">{emptyLabel}</div>;
    }

    return <div data-testid="category-pie" />;
  },
}));

import { ReportsScreen } from '../../src/ui/ReportsScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  reportHooks.reload.mockReset();
  chartMocks.monthBarData = [];
  chartMocks.pieData = [];
  chartMocks.pieLocales = [];
  customCategoryHooks.categories = [];
  reportHooks.state = makeReportState();
});

function zeroSums(): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<Category, number>;
}

function okStatuses(): Record<Category, 'ok'> {
  return Object.fromEntries(CATEGORIES.map(c => [c, 'ok'])) as Record<Category, 'ok'>;
}

function zeroDeltas(): UseReportsResult['deltas'] {
  return Object.fromEntries(
    CATEGORIES.map(c => [c, { curr: 0, prev: 0, deltaPct: 0 }]),
  ) as UseReportsResult['deltas'];
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    amount: overrides.amount ?? 10_000,
    currency: 'VND',
    occurredAt: overrides.occurredAt ?? '2099-06-04T14:48:00.000Z',
    category: 'food-drinks',
    direction: 'expense',
    source: 'manual',
    createdAt: '2099-06-04T14:48:00.000Z',
    updatedAt: '2099-06-04T14:48:00.000Z',
    ...overrides,
  } as Transaction;
}

function customCategory(overrides: Partial<UserCategory> = {}): UserCategory {
  return {
    id: 'custom-expense-pet-care',
    direction: 'expense',
    name: 'Pet Care',
    createdAt: '2099-06-04T14:48:00.000Z',
    updatedAt: '2099-06-04T14:48:00.000Z',
    ...overrides,
  } as UserCategory;
}

function makeReportState(overrides: Partial<UseReportsResult> = {}): UseReportsResult {
  return {
    loading: false,
    error: null,
    reload: reportHooks.reload,
    transactions: [],
    sums: zeroSums(),
    daily: [{ date: '2099-06-01', total: 0 }],
    deltas: zeroDeltas(),
    anomalyHints: [],
    bStatus: {
      overall: 'ok',
      perCategory: okStatuses(),
      overallSpent: 0,
      overallLimit: 0,
    },
    directionTotals: {
      expense: 0,
      income: 0,
      net: 0,
    },
    ...overrides,
  };
}

describe('ReportsScreen', () => {
  it('shows empty state when the current month has no transactions', () => {
    render(<MemoryRouter><ReportsScreen /></MemoryRouter>);
    expect(screen.getAllByText('No expense transactions this month')).toHaveLength(2);
  });

  it('shows over-budget banner when overall exceeded', () => {
    reportHooks.state = makeReportState({
      sums: { ...zeroSums(), 'food-drinks': 1500 },
      bStatus: {
        overall: 'over',
        perCategory: okStatuses(),
        overallSpent: 1500,
        overallLimit: 1000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    expect(screen.getByRole('alert')).toHaveTextContent('Total spending exceeds the monthly budget');
  });

  it('renders expense, income, and net summary totals', () => {
    reportHooks.state = makeReportState({
      directionTotals: {
        expense: 125_000,
        income: 500_000,
        net: 375_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    expect(screen.getByText('Expense total')).toBeInTheDocument();
    expect(screen.getByText('Income total')).toBeInTheDocument();
    expect(screen.getByText('Net total')).toBeInTheDocument();
    expect(screen.getByText(/125[.,]000/)).toBeInTheDocument();
    expect(screen.getByText(/500[.,]000/)).toBeInTheDocument();
    expect(screen.getByText(/375[.,]000/)).toBeInTheDocument();
  });

  it('renders report totals in the dark metric section', () => {
    reportHooks.state = makeReportState({
      directionTotals: { expense: 125_000, income: 500_000, net: 375_000 },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    expect(screen.getByRole('region', { name: /report totals/i })).toBeInTheDocument();
  });

  it('shows the yearly report mode label from the query param', () => {
    render(<MemoryRouter initialEntries={['/reports?mode=year-summary&month=2099-06']}><ReportsScreen /></MemoryRouter>);

    expect(screen.getByText('Yearly report')).toBeInTheDocument();
  });

  it('searches current report transactions by query', async () => {
    const user = userEvent.setup();
    reportHooks.state = makeReportState({
      transactions: [
        tx({
          id: 'coffee',
          amount: 45_000,
          category: 'coffee-bubble-tea',
          merchant: 'Highlands Coffee',
          note: 'Morning latte',
          bankHint: 'mb',
          occurredAt: '2099-06-05T14:48:00.000Z',
        }),
        tx({
          id: 'grocery',
          amount: 120_000,
          category: 'food-drinks',
          merchant: 'Big C',
          note: 'Groceries',
          bankHint: 'acb',
          occurredAt: '2099-06-04T14:48:00.000Z',
        }),
      ],
      directionTotals: {
        expense: 165_000,
        income: 0,
        net: -165_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?mode=search&month=2099-06']}><ReportsScreen /></MemoryRouter>);

    const searchInput = screen.getByPlaceholderText('Search merchant, note, category...');
    expect(searchInput).toBeInTheDocument();
    expect(screen.getByText('Highlands Coffee')).toBeInTheDocument();
    expect(screen.getByText('Big C')).toBeInTheDocument();

    await user.type(searchInput, 'coffee');

    expect(screen.getByText('Highlands Coffee')).toBeInTheDocument();
    expect(screen.queryByText('Big C')).not.toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'nomatch');

    expect(screen.getByText('No matching transactions')).toBeInTheDocument();
  });

  it('renders expense category rows with percentages by default', () => {
    reportHooks.state = makeReportState({
      transactions: [
        tx({ id: 'food', amount: 30_000, category: 'food-drinks' }),
        tx({ id: 'health', amount: 10_000, category: 'healthcare' }),
        tx({ id: 'salary', amount: 100_000, direction: 'income', category: 'salary' }),
      ],
      directionTotals: {
        expense: 40_000,
        income: 100_000,
        net: 60_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /expense/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Food & Drinks')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Healthcare')).toBeInTheDocument();
    expect(screen.queryByText('Salary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /food & drinks/i })).toBeInTheDocument();
  });

  it('renders custom expense categories with saved labels and fallback pie colors', () => {
    customCategoryHooks.categories = [customCategory()];
    reportHooks.state = makeReportState({
      transactions: [
        tx({
          id: 'pet-care',
          amount: 25_000,
          category: 'custom-expense-pet-care',
          merchant: 'Vet',
        }),
      ],
      directionTotals: {
        expense: 25_000,
        income: 0,
        net: -25_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    expect(screen.getByText('Pet Care')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pet care/i })).toBeInTheDocument();
    expect(chartMocks.pieData.at(-1)).toContainEqual(expect.objectContaining({
      label: 'Pet Care',
      color: '#94a3b8',
    }));
  });

  it('does not crash when search results include an unknown custom category', () => {
    reportHooks.state = makeReportState({
      transactions: [
        tx({
          id: 'child-care',
          amount: 25_000,
          category: 'custom-expense-child-care',
          merchant: '',
          note: '',
        }),
      ],
      directionTotals: {
        expense: 25_000,
        income: 0,
        net: -25_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?mode=search&month=2099-06']}><ReportsScreen /></MemoryRouter>);

    expect(screen.getAllByText('Child Care').length).toBeGreaterThan(0);
  });

  it('opens a category detail view with matching transactions', async () => {
    const user = userEvent.setup();
    reportHooks.state = makeReportState({
      transactions: [
        tx({
          id: 'food-1',
          amount: 30_000,
          category: 'food-drinks',
          merchant: 'Grab',
          occurredAt: '2099-06-04T14:48:00.000Z',
        }),
        tx({
          id: 'food-2',
          amount: 10_000,
          category: 'food-drinks',
          note: 'Lunch',
          occurredAt: '2099-06-05T14:48:00.000Z',
        }),
        tx({
          id: 'health',
          amount: 12_000,
          category: 'healthcare',
          merchant: 'Pharmacy',
          occurredAt: '2099-06-05T14:48:00.000Z',
        }),
        tx({
          id: 'food-outside-month',
          amount: 20_000,
          category: 'food-drinks',
          merchant: 'July dinner',
          occurredAt: '2099-07-05T14:48:00.000Z',
        }),
      ],
      directionTotals: {
        expense: 52_000,
        income: 0,
        net: -52_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /food & drinks/i }));

    expect(screen.getByRole('button', { name: /back to reports/i })).toBeInTheDocument();
    expect(screen.getByText('Grab')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('2099-06-05')).toBeInTheDocument();
    expect(screen.queryByText('Pharmacy')).not.toBeInTheDocument();
    expect(screen.queryByText('July dinner')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to reports/i }));

    expect(screen.getByRole('button', { name: /food & drinks/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to reports/i })).not.toBeInTheDocument();
  });

  it('resets category detail when switching to an incompatible direction', async () => {
    const user = userEvent.setup();
    reportHooks.state = makeReportState({
      transactions: [
        tx({ id: 'food', amount: 30_000, category: 'food-drinks', merchant: 'Grab' }),
        tx({ id: 'salary', amount: 100_000, direction: 'income', category: 'salary', merchant: 'Company' }),
      ],
      directionTotals: {
        expense: 30_000,
        income: 100_000,
        net: 70_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /food & drinks/i }));
    expect(screen.getByRole('button', { name: /back to reports/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /income/i }));

    expect(screen.queryByRole('button', { name: /back to reports/i })).not.toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
  });

  it('renders a by-category empty state when the selected direction has no rows', () => {
    reportHooks.state = makeReportState({
      transactions: [
        tx({ id: 'salary', amount: 100_000, direction: 'income', category: 'salary' }),
      ],
      directionTotals: {
        expense: 0,
        income: 100_000,
        net: 100_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    const byCategory = screen.getByRole('heading', { name: 'By category' }).closest('section');
    expect(byCategory).not.toBeNull();
    expect(within(byCategory as HTMLElement).getByText('No expense transactions this month')).toBeInTheDocument();
  });

  it('switches to income category rows with percentages', async () => {
    const user = userEvent.setup();
    reportHooks.state = makeReportState({
      transactions: [
        tx({ id: 'food', amount: 30_000, category: 'food-drinks' }),
        tx({ id: 'salary', amount: 80_000, direction: 'income', category: 'salary' }),
        tx({ id: 'bonus', amount: 20_000, direction: 'income', category: 'bonus' }),
      ],
      directionTotals: {
        expense: 30_000,
        income: 100_000,
        net: 70_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /income/i }));

    expect(screen.getByRole('button', { name: /income/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Salary')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('Bonus')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.queryByText('Food & Drinks')).not.toBeInTheDocument();
  });

  it('uses income daily totals in the overview chart when income is selected', async () => {
    const user = userEvent.setup();
    reportHooks.state = makeReportState({
      transactions: [
        tx({
          id: 'food',
          amount: 30_000,
          category: 'food-drinks',
          occurredAt: '2099-06-04T14:48:00.000Z',
        }),
        tx({
          id: 'salary',
          amount: 80_000,
          direction: 'income',
          category: 'salary',
          occurredAt: '2099-06-05T14:48:00.000Z',
        }),
        tx({
          id: 'bonus',
          amount: 20_000,
          direction: 'income',
          category: 'bonus',
          occurredAt: '2099-06-06T14:48:00.000Z',
        }),
      ],
      daily: [{ date: '2099-06-04', total: 30_000 }],
      directionTotals: {
        expense: 30_000,
        income: 100_000,
        net: 70_000,
      },
    });

    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /income/i }));

    const latestOverviewSeries = chartMocks.monthBarData.at(-1) ?? [];
    expect(latestOverviewSeries.find(day => day.date === '2099-06-04')?.total).toBe(0);
    expect(latestOverviewSeries.find(day => day.date === '2099-06-05')?.total).toBe(80_000);
    expect(latestOverviewSeries.find(day => day.date === '2099-06-06')?.total).toBe(20_000);
  });

  it('keeps stale report content hidden during loading', async () => {
    const user = userEvent.setup();
    reportHooks.state = makeReportStateWithStaleContent();

    const view = render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /food & drinks/i }));
    expect(screen.getByRole('button', { name: /back to reports/i })).toBeInTheDocument();

    reportHooks.state = makeUnavailableReportState({ loading: true });
    view.rerender(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    expect(screen.getByText('Loading transactions...')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectStaleReportContentHidden();
  });

  it('keeps stale report content hidden during errors', async () => {
    const user = userEvent.setup();
    reportHooks.state = makeReportStateWithStaleContent();

    const view = render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /food & drinks/i }));
    expect(screen.getByRole('button', { name: /back to reports/i })).toBeInTheDocument();

    reportHooks.state = makeUnavailableReportState({ error: 'Cloud report failed' });
    view.rerender(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Cloud report failed');
    expectStaleReportContentHidden();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(reportHooks.reload).toHaveBeenCalledTimes(1);
  });
});

function expectStaleReportContentHidden() {
  expect(screen.queryByText('No spending this month')).not.toBeInTheDocument();
  expect(screen.queryByText('No expense transactions this month')).not.toBeInTheDocument();
  expect(screen.queryByText('Expense total')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /expense/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /income/i })).not.toBeInTheDocument();
  expect(screen.queryByText('Anomalies')).not.toBeInTheDocument();
  expect(screen.queryByText('By category')).not.toBeInTheDocument();
  expect(screen.queryByText('Food & Drinks')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /food & drinks/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /back to reports/i })).not.toBeInTheDocument();
  expect(screen.queryByText('Food & Drinks in 2099-06')).not.toBeInTheDocument();
  expect(screen.queryByText('Grab')).not.toBeInTheDocument();
}

function makeReportStateWithStaleContent(overrides: Partial<UseReportsResult> = {}): UseReportsResult {
  return makeReportState({
    transactions: [
      tx({
        id: 'stale-food',
        amount: 30_000,
        category: 'food-drinks',
        merchant: 'Grab',
      }),
      tx({
        id: 'stale-salary',
        amount: 100_000,
        direction: 'income',
        category: 'salary',
        merchant: 'Company',
      }),
    ],
    sums: { ...zeroSums(), 'food-drinks': 30_000 },
    daily: [{ date: '2099-06-04', total: 30_000 }],
    directionTotals: {
      expense: 30_000,
      income: 100_000,
      net: 70_000,
    },
    anomalyHints: [{ category: 'food-drinks', deltaPct: 2 }],
    bStatus: {
      overall: 'over',
      perCategory: { ...okStatuses(), 'food-drinks': 'over' },
      overallSpent: 30_000,
      overallLimit: 20_000,
    },
    ...overrides,
  });
}

function makeUnavailableReportState(overrides: Partial<UseReportsResult>): UseReportsResult {
  return makeReportStateWithStaleContent(overrides);
}
