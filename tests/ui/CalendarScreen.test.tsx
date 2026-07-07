import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import type { Transaction, TransactionDirection } from '../../src/types';

const cloudHooks = vi.hoisted(() => ({
  reload: vi.fn(),
  useMonthCloudTransactions: vi.fn(),
  state: {
    data: [] as Transaction[],
    loading: false,
    error: null as string | null,
  },
}));

vi.mock('../../src/hooks/useCloudTransactions', () => ({
  useMonthCloudTransactions: cloudHooks.useMonthCloudTransactions,
}));

import { CalendarScreen } from '../../src/ui/CalendarScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('en');
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
    expect(screen.getByRole('button', { name: /Select 2026-07-07/ })).toHaveTextContent(/20[.,]000/);
    expect(screen.queryByText(/100[.,]000/, { selector: 'button *' })).not.toBeInTheDocument();
  });

  it('groups the selected day by category', async () => {
    const user = userEvent.setup();
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
    const user = userEvent.setup();

    renderCalendar('/calendar?month=2026-07');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(cloudHooks.useMonthCloudTransactions).toHaveBeenLastCalledWith('2026-06');

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));

    expect(cloudHooks.useMonthCloudTransactions).toHaveBeenLastCalledWith('2026-08');
  });

  it('shows loading, empty, and error states', async () => {
    const user = userEvent.setup();
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
