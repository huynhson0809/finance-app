import { useLayoutEffect } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import type { Transaction, TransactionDirection } from '../../src/types';

interface MockCloudState {
  data: Transaction[];
  loading: boolean;
  error: string | null;
}

const cloudHooks = vi.hoisted(() => ({
  mode: 'static' as 'static' | 'stateful',
  monthStates: {} as Record<string, MockCloudState>,
  reload: vi.fn(),
  useMonthCloudTransactions: vi.fn(),
  state: {
    data: [] as Transaction[],
    loading: false,
    error: null as string | null,
  },
}));

const dateHooks = vi.hoisted(() => ({
  today: '2026-07-07',
}));

vi.mock('../../src/lib/date', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/date')>('../../src/lib/date');

  return {
    ...actual,
    todayVietnamDate: (now?: Date) => (now ? actual.todayVietnamDate(now) : dateHooks.today),
  };
});

vi.mock('../../src/hooks/useCloudTransactions', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    useMonthCloudTransactions: (month: string) => {
      const [statefulState] = React.useState<MockCloudState>(() => (
        cloudHooks.monthStates[month] ?? { data: [], loading: true, error: null }
      ));
      const staticState = cloudHooks.useMonthCloudTransactions(month);

      return cloudHooks.mode === 'stateful'
        ? { ...statefulState, reload: cloudHooks.reload }
        : staticState;
    },
  };
});

import { CalendarScreen } from '../../src/ui/CalendarScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  dateHooks.today = '2026-07-07';
  cloudHooks.mode = 'static';
  cloudHooks.monthStates = {};
  cloudHooks.reload.mockReset();
  cloudHooks.reload.mockResolvedValue(undefined);
  cloudHooks.state = {
    data: [],
    loading: false,
    error: null,
  };
  cloudHooks.useMonthCloudTransactions.mockReset();
  cloudHooks.useMonthCloudTransactions.mockImplementation(() => ({
    ...cloudHooks.state,
    reload: cloudHooks.reload,
  }));
});

function tx(overrides: Partial<Transaction> = {}): Transaction {
  const direction = (overrides.direction ?? 'expense') as TransactionDirection;
  const occurredAt = overrides.occurredAt ?? '2026-07-07T05:00:00.000Z';
  return {
    id: crypto.randomUUID(),
    amount: 10_000,
    currency: 'VND',
    occurredAt,
    direction,
    category: direction === 'income' ? 'salary' : 'food-drinks',
    source: 'manual',
    createdAt: occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  } as Transaction;
}

function renderCalendar(path = '/calendar?month=2026-07') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CalendarScreen />
    </MemoryRouter>,
  );
}

function CommitProbe({ snapshots }: { snapshots: string[] }) {
  useLayoutEffect(() => {
    snapshots.push(document.body.textContent ?? '');
  });

  return null;
}

function renderCalendarWithProbe(path: string, snapshots: string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CalendarScreen />
      <CommitProbe snapshots={snapshots} />
    </MemoryRouter>,
  );
}

function setupUser() {
  return userEvent.setup();
}

describe('CalendarScreen', () => {
  it('renders the calendar inside a dark calendar panel', () => {
    renderCalendar();

    expect(screen.getByRole('region', { name: /calendar month/i })).toBeInTheDocument();
  });

  it('loads the selected month and renders month totals plus expense day cells', () => {
    cloudHooks.state.data = [
      tx({ amount: 20_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 12_000, direction: 'expense', category: 'transportation', occurredAt: '2026-07-08T05:00:00.000Z' }),
      tx({ amount: 100_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T06:00:00.000Z' }),
    ];

    renderCalendar();

    expect(cloudHooks.useMonthCloudTransactions).toHaveBeenCalledWith('2026-07');
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getByText('07/2026')).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: /month summary/i });
    expect(within(summary).getByText('Expense')).toBeInTheDocument();
    expect(within(summary).getByText('Income')).toBeInTheDocument();
    expect(within(summary).getByText('Total')).toBeInTheDocument();
    expect(within(summary).getByText(/32[.,]000/)).toBeInTheDocument();
    expect(within(summary).getByText(/100[.,]000/)).toBeInTheDocument();
    expect(within(summary).getByText(/\+.*68[.,]000/)).toBeInTheDocument();
    const selectedDay = screen.getByRole('button', { name: /Select 2026-07-07/ });
    expect(selectedDay).toHaveTextContent('20,000');
    expect(selectedDay).toHaveTextContent('+100,000');
    expect(selectedDay).toHaveAttribute('aria-pressed', 'true');
    expect(selectedDay).toHaveAttribute('aria-current', 'date');
    expect(screen.getByRole('button', { name: /Select 2026-07-08/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('region', { name: /transactions by date/i })).toBeInTheDocument();
  });

  it('renders compact day totals without truncating large amounts', () => {
    cloudHooks.state.data = [
      tx({ amount: 1_645_650, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-08T05:00:00.000Z' }),
    ];

    renderCalendar();

    const day = screen.getByRole('button', { name: /Select 2026-07-08/ });
    expect(day).toHaveTextContent('1.65M');
    expect(day).not.toHaveTextContent('...');
  });

  it('locks the calendar header and day cells into seven columns', () => {
    renderCalendar();

    const weekdayGrid = screen.getByText('Mon').parentElement;
    const dayGrid = screen.getByRole('button', { name: /Select 2026-07-01/ }).parentElement;

    expect(weekdayGrid).toHaveStyle({ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' });
    expect(dayGrid).toHaveStyle({ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' });
  });

  it('selects the first transaction day when transactions arrive without committing stale empty day content', () => {
    const snapshots: string[] = [];
    cloudHooks.state.loading = true;
    const { rerender } = renderCalendarWithProbe('/calendar?month=2026-06', snapshots);

    expect(screen.getByRole('status')).toHaveTextContent('Loading transactions...');

    cloudHooks.state = {
      data: [
        tx({ amount: 42_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-06-15T05:00:00.000Z' }),
      ],
      loading: false,
      error: null,
    };
    snapshots.length = 0;
    rerender(
      <MemoryRouter initialEntries={['/calendar?month=2026-06']}>
        <CalendarScreen />
        <CommitProbe snapshots={snapshots} />
      </MemoryRouter>,
    );

    const staleEmptyCommit = snapshots.find(snapshot => (
      snapshot.includes('No transactions this month') &&
      !snapshot.includes('15/06/2026')
    ));
    expect(staleEmptyCommit).toBeUndefined();
    expect(screen.getByRole('article', { name: '15/06/2026 (Mon)' })).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: '15/06/2026 (Mon)' })).getByText('Food & Drinks')).toBeInTheDocument();
  });

  it('renders only selected-day transactions as chronological tag links', async () => {
    const user = setupUser();
    cloudHooks.state.data = [
      tx({
        id: 'tx-other-day',
        amount: 99_000,
        direction: 'expense',
        category: 'shopping',
        occurredAt: '2026-07-07T05:00:00.000Z',
      }),
      tx({
        id: 'tx-food-early',
        amount: 20_000,
        direction: 'expense',
        category: 'food-drinks',
        merchant: 'Ăn sáng',
        occurredAt: '2026-07-08T05:00:00.000Z',
      }),
      tx({
        id: 'tx-transport',
        amount: 12_000,
        direction: 'expense',
        category: 'transportation',
        merchant: 'Bus',
        occurredAt: '2026-07-08T06:00:00.000Z',
      }),
      tx({
        id: 'tx-food-late',
        amount: 30_000,
        direction: 'expense',
        category: 'food-drinks',
        merchant: 'Cà phê chiều',
        occurredAt: '2026-07-08T07:00:00.000Z',
      }),
      tx({
        id: 'tx-salary',
        amount: 1_000_000,
        direction: 'income',
        category: 'salary',
        note: 'Lương',
        occurredAt: '2026-07-08T08:00:00.000Z',
      }),
    ];

    renderCalendar();
    await user.click(screen.getByRole('button', { name: /Select 2026-07-08/ }));

    expect(screen.queryByRole('article', { name: '07/07/2026 (Tue)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Transactions' })).not.toBeInTheDocument();

    const group = screen.getByRole('article', { name: '08/07/2026 (Wed)' });
    const links = within(group).getAllByRole('link');

    expect(links).toHaveLength(4);
    expect(links[0]).toHaveTextContent('Food & Drinks');
    expect(links[0]).toHaveTextContent(/20[.,]000/);
    expect(links[0]).toHaveAttribute('href', '/transactions/tx-food-early');
    expect(links[1]).toHaveTextContent('Transportation');
    expect(links[1]).toHaveAttribute('href', '/transactions/tx-transport');
    expect(links[2]).toHaveTextContent('Food & Drinks');
    expect(links[2]).toHaveTextContent(/30[.,]000/);
    expect(links[2]).toHaveAttribute('href', '/transactions/tx-food-late');
    expect(links[3]).toHaveTextContent('Salary');
    expect(links[3]).toHaveTextContent(/\+.*1[.,]000[.,]000/);
    expect(links[3]).toHaveAttribute('href', '/transactions/tx-salary');
    expect(within(group).getAllByText('Food & Drinks')).toHaveLength(2);
    expect(within(group).queryByText(/50[.,]000/)).not.toBeInTheDocument();
  });

  it('steps between months', async () => {
    const user = setupUser();

    renderCalendar('/calendar?month=2026-07');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(cloudHooks.useMonthCloudTransactions).toHaveBeenLastCalledWith('2026-06');

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));

    expect(cloudHooks.useMonthCloudTransactions).toHaveBeenLastCalledWith('2026-08');
  });

  it('uses the target month automatic date after month navigation without committing the previous manual date', async () => {
    const user = setupUser();
    const snapshots: string[] = [];
    cloudHooks.state.data = [
      tx({ amount: 25_000, direction: 'expense', category: 'transportation', occurredAt: '2026-07-10T05:00:00.000Z' }),
      tx({ amount: 75_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-08-12T05:00:00.000Z' }),
    ];

    renderCalendarWithProbe('/calendar?month=2026-07', snapshots);
    await user.click(screen.getByRole('button', { name: /Select 2026-07-20/ }));
    expect(screen.getByRole('button', { name: /Select 2026-07-20/ })).toHaveAttribute('aria-pressed', 'true');

    snapshots.length = 0;
    await user.click(screen.getByRole('button', { name: 'Next month' }));

    const staleManualCommit = snapshots.find(snapshot => (
      snapshot.includes('08/2026') &&
      snapshot.includes('Select 2026-07-20')
    ));
    expect(staleManualCommit).toBeUndefined();
    expect(screen.getByRole('button', { name: /Select 2026-08-12/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('article', { name: '12/08/2026 (Wed)' })).getByText('Food & Drinks')).toBeInTheDocument();
  });

  it('does not commit an empty target month from the previous hook state while the target month starts loading', async () => {
    const user = setupUser();
    const snapshots: string[] = [];
    cloudHooks.mode = 'stateful';
    cloudHooks.monthStates = {
      '2026-07': {
        data: [
          tx({ amount: 25_000, direction: 'expense', category: 'transportation', occurredAt: '2026-07-10T05:00:00.000Z' }),
        ],
        loading: false,
        error: null,
      },
      '2026-08': {
        data: [],
        loading: true,
        error: null,
      },
    };

    renderCalendarWithProbe('/calendar?month=2026-07', snapshots);
    expect(screen.getByText('07/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select 2026-07-10/ })).toHaveTextContent('25,000');

    snapshots.length = 0;
    await user.click(screen.getByRole('button', { name: 'Next month' }));

    const staleEmptyTargetMonth = snapshots.find(snapshot => (
      snapshot.includes('08/2026') &&
      snapshot.includes('No transactions this month')
    ));
    expect(staleEmptyTargetMonth).toBeUndefined();
    expect(screen.getByText('08/2026')).toBeInTheDocument();
    expect(screen.queryByText('No transactions this month')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading transactions...');
  });

  it('shows loading, empty, and error states', async () => {
    const user = setupUser();
    cloudHooks.state.loading = true;
    const { rerender } = render(
      <MemoryRouter initialEntries={['/calendar?month=2026-07']}>
        <CalendarScreen />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading transactions...');

    cloudHooks.state.loading = false;
    rerender(
      <MemoryRouter initialEntries={['/calendar?month=2026-07']}>
        <CalendarScreen />
      </MemoryRouter>,
    );
    expect(screen.getByText('No transactions this month')).toBeInTheDocument();

    cloudHooks.state.error = 'calendar cloud failed';
    rerender(
      <MemoryRouter initialEntries={['/calendar?month=2026-07']}>
        <CalendarScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('calendar cloud failed');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(cloudHooks.reload).toHaveBeenCalledTimes(1);
  });
});
