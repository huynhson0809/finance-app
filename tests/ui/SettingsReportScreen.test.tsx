import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import type { CategoryOverride, Transaction, UserCategory } from '../../src/types';

const scopedReportHooks = vi.hoisted(() => ({
  useScopedReportTransactions: vi.fn(),
  reload: vi.fn(),
  state: {
    transactions: [] as Transaction[],
    loading: false,
    error: null as string | null,
    reload: vi.fn(),
  },
}));

const customCategoryHooks = vi.hoisted(() => ({
  categories: [] as UserCategory[],
}));

const categoryOverrideHooks = vi.hoisted(() => ({
  overrides: [] as CategoryOverride[],
}));

const chartMocks = vi.hoisted(() => ({
  periodData: [] as Array<Array<{ label: string; total: number }>>,
  pieData: [] as Array<Array<{ label: string; total: number }>>,
}));

vi.mock('../../src/hooks/useScopedReportTransactions', () => ({
  useScopedReportTransactions: scopedReportHooks.useScopedReportTransactions,
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

vi.mock('../../src/hooks/useCategoryOverrides', () => ({
  useCategoryOverrides: vi.fn(() => ({
    overrides: categoryOverrideHooks.overrides,
    loading: false,
    error: null,
    reload: vi.fn(),
    saveOverride: vi.fn(),
  })),
}));

vi.mock('../../src/ui/components/Charts/PeriodBar', () => ({
  PeriodBar: ({ data }: { data: Array<{ label: string; total: number }> }) => {
    chartMocks.periodData.push(data);
    return <div data-testid="period-bar" />;
  },
}));

vi.mock('../../src/ui/components/Charts/CategoryPie', () => ({
  CategoryPie: ({ data }: { data: Array<{ label: string; total: number }> }) => {
    chartMocks.pieData.push(data);
    return <div data-testid="category-pie" />;
  },
}));

import { SettingsReportScreen } from '../../src/ui/SettingsReportScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-09T05:00:00.000Z'));
  await i18n.changeLanguage('en');
  scopedReportHooks.reload.mockReset();
  scopedReportHooks.useScopedReportTransactions.mockReset();
  chartMocks.periodData = [];
  chartMocks.pieData = [];
  scopedReportHooks.state = {
    transactions: [
      tx({ id: 'expense-1', amount: 112_700, category: 'food-drinks', direction: 'expense' }),
      tx({ id: 'income-1', amount: 90_000, category: 'salary', direction: 'income' }),
    ],
    loading: false,
    error: null,
    reload: scopedReportHooks.reload,
  };
  scopedReportHooks.useScopedReportTransactions.mockReturnValue(scopedReportHooks.state);
});

afterEach(() => {
  vi.useRealTimers();
});

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    amount: overrides.amount ?? 10_000,
    currency: 'VND',
    occurredAt: overrides.occurredAt ?? '2026-07-04T07:00:00.000Z',
    category: 'food-drinks',
    direction: 'expense',
    source: 'manual',
    createdAt: '2026-07-04T07:00:00.000Z',
    updatedAt: '2026-07-04T07:00:00.000Z',
    ...overrides,
  } as Transaction;
}

function renderReport(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/reports/:mode" element={<SettingsReportScreen />} />
        <Route path="/settings" element={<div>Settings</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SettingsReportScreen', () => {
  it('renders the yearly report as a settings-owned year view, not the monthly report tab', () => {
    renderReport('/settings/reports/year-summary');

    expect(screen.getByRole('heading', { name: 'Yearly report' })).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByText('2026 (01/01 – 12/31)')).toBeInTheDocument();
    expect(screen.queryByText('2026-07')).not.toBeInTheDocument();
    expect(scopedReportHooks.useScopedReportTransactions).toHaveBeenCalledWith('year', '2026-01');
    expect(screen.getByTestId('period-bar')).toBeInTheDocument();
  });

  it('uses all-time scope for all-time category reports', () => {
    renderReport('/settings/reports/all-category');

    expect(screen.getByRole('heading', { name: 'All-time category report' })).toBeInTheDocument();
    expect(screen.getByText('All time')).toBeInTheDocument();
    expect(scopedReportHooks.useScopedReportTransactions).toHaveBeenCalledWith('all', '2026-01');
    expect(screen.getByTestId('category-pie')).toBeInTheDocument();
  });
});
