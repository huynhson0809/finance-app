import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import { MemoryRouter } from 'react-router-dom';
import { __resetDBForTests } from '../../src/db';
import { upsertBudget, getBudgetForMonth } from '../../src/db/budgets';
import { monthOfVietnamDate, todayVietnamDate } from '../../src/lib/date';
import { i18n, initI18n, setLocale } from '../../src/i18n';
import { SettingsScreen } from '../../src/ui/SettingsScreen';

const authMocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    setupError: false,
    error: null,
    signInWithGoogle: vi.fn(),
    signOut: authMocks.signOut,
  }),
}));

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
  authMocks.signOut.mockReset();
});

describe('SettingsScreen caps editor', () => {
  it('renders settings in grouped dark sections', async () => {
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: /settings|cài đặt/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /language|ngôn ngữ/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /monthly budget|ngân sách/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /account|tài khoản/i })).toBeInTheDocument();
  });

  it('switches the active language from the locale radios', async () => {
    await setLocale('vi');
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();

    const vietnamese = screen.getByRole('radio', { name: /tiếng việt/i });
    const english = screen.getByRole('radio', { name: /english/i });
    expect(vietnamese).toBeChecked();
    expect(english).not.toBeChecked();

    await user.click(english);

    await waitFor(() => {
      expect(i18n.language).toBe('en');
      expect(english).toBeChecked();
      expect(vietnamese).not.toBeChecked();
    });
  });

  it('reveals email automation support details from a compact disclosure', async () => {
    await setLocale('en');
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: /email automation/i });
    const infoButton = within(section).getByRole('button', { name: /show email automation details/i });
    const detailId = infoButton.getAttribute('aria-controls');
    expect(detailId).toBeTruthy();
    expect(infoButton).toHaveAttribute('aria-expanded', 'false');
    expect(within(section).queryByText(/iphone/i)).not.toBeInTheDocument();
    expect(within(section).queryByText(/MB/)).not.toBeInTheDocument();
    expect(within(section).queryByText(/admin/i)).not.toBeInTheDocument();

    await user.click(infoButton);

    expect(infoButton).toHaveAttribute('aria-expanded', 'true');
    expect(section.querySelector(`#${detailId}`)).toBeInTheDocument();
    expect(section).toHaveTextContent(/iphone/i);
    expect(section).toHaveTextContent(/MB/);
    expect(section).toHaveTextContent(/ACB/);
    expect(section).toHaveTextContent(/admin|quản trị/i);
  });

  it('links to the report entry points from settings', async () => {
    await setLocale('en');
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

    const section = await screen.findByRole('region', { name: /reports/i });
    const reportLinks = [
      ['Yearly report', '/settings/reports/year-summary'],
      ['Yearly category report', '/settings/reports/year-category'],
      ['All-time report', '/settings/reports/all-summary'],
      ['All-time category report', '/settings/reports/all-category'],
      ['Balance change report', '/settings/reports/balance-change'],
      ['Search transactions', '/settings/reports/search'],
    ] as const;

    for (const [name, href] of reportLinks) {
      expect(within(section).getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('saves the monthly budget total', async () => {
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/monthly budget|ngân sách hàng tháng/i, { selector: 'input' }), '6000000');
    await user.click(screen.getByRole('button', { name: /save|lưu/i }));

    await waitFor(async () => {
      const budget = await getBudgetForMonth(currentVietnamMonth());
      expect(budget?.total).toBe(6000000);
    });
  });

  it('saves a savings target and shows the spendable budget', async () => {
    await setLocale('en');
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/monthly budget/i, { selector: 'input' }), '10000000');
    await user.type(screen.getByLabelText(/savings target/i, { selector: 'input' }), '2000000');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(async () => {
      const budget = await getBudgetForMonth(currentVietnamMonth());
      expect(budget?.total).toBe(10000000);
      expect(budget?.savingsTarget).toBe(2000000);
    });
    expect(screen.getByRole('status', { name: /spendable budget/i })).toHaveTextContent(/8,000,000/);
  });

  it('saves a per-category cap after debounce', async () => {
    await upsertBudget(currentVietnamMonth(), 5000000);
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    // open the disclosure
    fireEvent.click(await screen.findByRole('button', { name: /caps|hạng mục/i }));
    const coffeeInput = await screen.findByLabelText(/coffee|cà phê/i);
    fireEvent.change(coffeeInput, { target: { value: '500000' } });
    await waitFor(async () => {
      const b = await getBudgetForMonth(currentVietnamMonth());
      expect(b?.caps?.['coffee-bubble-tea']).toBe(500000);
    }, { timeout: 1500 });
  });

  it('preserves savings target when a cap autosaves', async () => {
    await upsertBudget(currentVietnamMonth(), 10000000, {}, 2000000);
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: /caps|hạng mục/i }));
    const coffeeInput = await screen.findByLabelText(/coffee|cà phê/i);
    fireEvent.change(coffeeInput, { target: { value: '500000' } });

    await waitFor(async () => {
      const budget = await getBudgetForMonth(currentVietnamMonth());
      expect(budget?.caps?.['coffee-bubble-tea']).toBe(500000);
      expect(budget?.savingsTarget).toBe(2000000);
    }, { timeout: 1500 });
  });

  it('clears a cap when input is emptied', async () => {
    await upsertBudget(currentVietnamMonth(), 5000000, { 'coffee-bubble-tea': 500000 });
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /caps|hạng mục/i }));
    const coffeeInput = await screen.findByLabelText(/coffee|cà phê/i);
    fireEvent.change(coffeeInput, { target: { value: '' } });
    await waitFor(async () => {
      const b = await getBudgetForMonth(currentVietnamMonth());
      expect(b?.caps?.['coffee-bubble-tea']).toBeUndefined();
    }, { timeout: 1500 });
  });

  it('does not render income categories in per-category caps', async () => {
    await upsertBudget(currentVietnamMonth(), 5000000);
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: /caps|hạng mục/i }));

    expect(await screen.findByLabelText(/coffee|cà phê/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/salary|lương/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/bonus|thưởng/i)).not.toBeInTheDocument();
  });

  it('keeps a newly saved monthly total when a cap autosave finishes later', async () => {
    await upsertBudget(currentVietnamMonth(), 5000000);
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

    const budgetInput = await screen.findByLabelText(/monthly budget|ngân sách hàng tháng/i, { selector: 'input' });
    await waitFor(() => {
      expect(budgetInput).toHaveValue('5000000');
    });

    fireEvent.click(await screen.findByRole('button', { name: /caps|hạng mục/i }));
    fireEvent.change(await screen.findByLabelText(/coffee|cà phê/i), {
      target: { value: '500000' },
    });
    fireEvent.change(budgetInput, { target: { value: '6000000' } });
    fireEvent.click(screen.getByRole('button', { name: /save|lưu/i }));

    await waitFor(async () => {
      const budget = await getBudgetForMonth(currentVietnamMonth());
      expect(budget?.total).toBe(6000000);
      expect(budget?.caps?.['coffee-bubble-tea']).toBe(500000);
    }, { timeout: 1500 });
  });
});

function currentVietnamMonth(): string {
  return monthOfVietnamDate(todayVietnamDate());
}

describe('SettingsScreen account', () => {
  it('signs out from the account section', async () => {
    authMocks.signOut.mockResolvedValue(undefined);
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: /account|tài khoản/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /sign out|đăng xuất/i }));

    expect(authMocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('disables sign out while the request is pending', async () => {
    let finishSignOut!: () => void;
    authMocks.signOut.mockReturnValue(new Promise<void>(resolve => {
      finishSignOut = resolve;
    }));
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /sign out|đăng xuất/i }));

    const pendingButton = await screen.findByRole('button', { name: /signing out|đang đăng xuất/i });
    expect(pendingButton).toBeDisabled();

    finishSignOut();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign out|đăng xuất/i })).not.toBeDisabled();
    });
  });

  it('shows a visible error when sign out fails', async () => {
    authMocks.signOut.mockRejectedValue(new Error('Supabase rejected sign out'));
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /sign out|đăng xuất/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/sign out failed|đăng xuất thất bại/i);
    expect(alert).toHaveTextContent('Supabase rejected sign out');
    expect(screen.getByRole('button', { name: /sign out|đăng xuất/i })).not.toBeDisabled();
  });
});
