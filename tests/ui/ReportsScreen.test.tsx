import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { initI18n, i18n } from '../../src/i18n';
import { CATEGORIES, type Category } from '../../src/types';
import type { UseReportsResult } from '../../src/hooks/useReports';

const reportHooks = vi.hoisted(() => ({
  reload: vi.fn(),
  state: null as UseReportsResult | null,
}));

vi.mock('../../src/hooks/useReports', () => ({
  useReports: vi.fn(() => reportHooks.state),
}));

import { ReportsScreen } from '../../src/ui/ReportsScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  reportHooks.reload.mockReset();
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

function makeReportState(overrides: Partial<UseReportsResult> = {}): UseReportsResult {
  return {
    loading: false,
    error: null,
    reload: reportHooks.reload,
    sums: zeroSums(),
    daily: [{ date: '2099-06-01', total: 0 }],
    deltas: zeroDeltas(),
    anomalyHints: [],
    bStatus: {
      overall: 'ok',
      perCategory: okStatuses(),
      overallSpent: 0,
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
    expect(screen.getByText('No spending this month')).toBeInTheDocument();
  });

  it('shows over-budget banner when overall exceeded', () => {
    reportHooks.state = makeReportState({
      sums: { ...zeroSums(), 'food-drinks': 1500 },
      bStatus: {
        overall: 'over',
        perCategory: okStatuses(),
        overallSpent: 1500,
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

  it('shows cloud loading without stale report content', () => {
    reportHooks.state = makeUnavailableReportState({ loading: true });

    render(<MemoryRouter><ReportsScreen /></MemoryRouter>);

    expect(screen.getByText('Loading transactions...')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('No spending this month')).not.toBeInTheDocument();
    expect(screen.queryByText('Anomalies')).not.toBeInTheDocument();
    expect(screen.queryByText('By category')).not.toBeInTheDocument();
    expect(screen.queryByText('Food & Drinks')).not.toBeInTheDocument();
  });

  it('shows cloud errors with retry without stale report content', async () => {
    const user = userEvent.setup();
    reportHooks.state = makeUnavailableReportState({ error: 'Cloud report failed' });

    render(<MemoryRouter><ReportsScreen /></MemoryRouter>);

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Cloud report failed');
    expect(screen.queryByText('No spending this month')).not.toBeInTheDocument();
    expect(screen.queryByText('Anomalies')).not.toBeInTheDocument();
    expect(screen.queryByText('By category')).not.toBeInTheDocument();
    expect(screen.queryByText('Food & Drinks')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(reportHooks.reload).toHaveBeenCalledTimes(1);
  });
});

function makeUnavailableReportState(overrides: Partial<UseReportsResult>): UseReportsResult {
  return makeReportState({
    sums: { ...zeroSums(), 'food-drinks': 1500 },
    anomalyHints: [{ category: 'food-drinks', deltaPct: 2 }],
    bStatus: {
      overall: 'over',
      perCategory: { ...okStatuses(), 'food-drinks': 'over' },
      overallSpent: 1500,
    },
    ...overrides,
  });
}
