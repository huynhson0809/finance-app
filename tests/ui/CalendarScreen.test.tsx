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
  it('loads the selected month and renders month totals plus expense day cells', () => {
    cloudHooks.state.data = [
      tx({ amount: 20_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 12_000, direction: 'expense', category: 'transportation', occurredAt: '2026-07-08T05:00:00.000Z' }),
      tx({ amount: 100_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T06:00:00.000Z' }),
    ];

    renderCalendar();

    expect(cloudHooks.useMonthCloudTransactions).toHaveBeenCalledWith('2026-07');
    expect(screen.getByRole('heading', { name: '07/2026' })).toBeInTheDocument();
    expect(screen.getByText('Expense')).toBeInTheDocument();
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByText('Net')).toBeInTheDocument();
    expect(screen.getByText(/32[.,]000/)).toBeInTheDocument();
    expect(screen.getAllByText(/100[.,]000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/68[.,]000/)).toBeInTheDocument();
    const selectedDay = screen.getByRole('button', { name: /Select 2026-07-07/ });
    expect(selectedDay).toHaveTextContent(/20[.,]000/);
    expect(selectedDay).toHaveAttribute('aria-pressed', 'true');
    expect(selectedDay).toHaveAttribute('aria-current', 'date');
    expect(screen.getByRole('button', { name: /Select 2026-07-08/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/100[.,]000/, { selector: 'button *' })).not.toBeInTheDocument();
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
      snapshot.includes('Selected date: 2026-06-01') &&
      snapshot.includes('No transactions on this day')
    ));
    expect(staleEmptyCommit).toBeUndefined();
    expect(screen.getByText('Selected date: 2026-06-15')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: /Selected date/ })).getByText('Food & Drinks')).toBeInTheDocument();
  });

  it('groups the selected day by category', async () => {
    const user = setupUser();
    cloudHooks.state.data = [
      tx({ amount: 20_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 30_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T06:00:00.000Z' }),
      tx({ amount: 12_000, direction: 'expense', category: 'transportation', occurredAt: '2026-07-07T07:00:00.000Z' }),
      tx({ amount: 1_000_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T08:00:00.000Z' }),
    ];

    renderCalendar();
    await user.click(screen.getByRole('button', { name: /Select 2026-07-07/ }));

    const list = screen.getByRole('list', { name: /Selected date/ });
    expect(within(list).getByText('Salary')).toBeInTheDocument();
    expect(within(list).getByText(/1[.,]000[.,]000/)).toBeInTheDocument();
    expect(within(list).getByText('Food & Drinks')).toBeInTheDocument();
    expect(within(list).getByText(/50[.,]000/)).toBeInTheDocument();
    expect(within(list).getByText('Transportation')).toBeInTheDocument();
    expect(within(list).getByText(/12[.,]000/)).toBeInTheDocument();
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
    expect(screen.getByText('Selected date: 2026-07-20')).toBeInTheDocument();

    snapshots.length = 0;
    await user.click(screen.getByRole('button', { name: 'Next month' }));

    const staleManualCommit = snapshots.find(snapshot => (
      snapshot.includes('08/2026') &&
      snapshot.includes('Selected date: 2026-07-20')
    ));
    expect(staleManualCommit).toBeUndefined();
    expect(screen.getByText('Selected date: 2026-08-12')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: /Selected date/ })).getByText('Food & Drinks')).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: '07/2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select 2026-07-10/ })).toHaveTextContent(/25[.,]000/);

    snapshots.length = 0;
    await user.click(screen.getByRole('button', { name: 'Next month' }));

    const staleEmptyTargetMonth = snapshots.find(snapshot => (
      snapshot.includes('08/2026') &&
      snapshot.includes('No transactions this month')
    ));
    expect(staleEmptyTargetMonth).toBeUndefined();
    expect(screen.getByRole('heading', { name: '08/2026' })).toBeInTheDocument();
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
