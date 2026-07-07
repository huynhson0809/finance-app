# Money Note Calendar Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `Lịch` tab that shows a monthly calendar, monthly income/expense/net totals, and selected-day transactions grouped by category.

**Architecture:** Keep calendar calculations in pure report helpers, then build a small screen on top of `useMonthCloudTransactions`. Route and navigation changes stay separate from aggregation logic so the screen can be tested with mocked hooks and the helpers can be tested without React.

**Tech Stack:** React 19, React Router 6, TypeScript, Tailwind CSS utility classes, i18next, Vitest, Testing Library.

---

## File Structure

- Create `src/reports/calendar.ts`
  - Pure helpers for month day summaries, Vietnam-local date grouping, initial selected date, and selected-day category totals.
- Modify `src/reports/index.ts`
  - Export the new calendar helpers.
- Create `tests/reports/calendar.test.ts`
  - Unit tests for the pure calendar helpers.
- Create `src/ui/CalendarScreen.tsx`
  - New `Lịch` page. Owns month query param, selected date, loading/error UI, calendar grid, month totals, and selected-day category rows.
- Create `tests/ui/CalendarScreen.test.tsx`
  - UI tests with `useMonthCloudTransactions` mocked.
- Modify `src/App.tsx`
  - Lazy-load and route `/calendar`.
- Modify `src/ui/Layout.tsx`
  - Add the `Lịch` bottom-nav tab between `Thêm` and `Báo cáo`.
- Modify `tests/ui/Layout.test.tsx`
  - Assert the Calendar tab exists and points to `/calendar`.
- Modify `src/i18n/en.json` and `src/i18n/vi.json`
  - Add nav and calendar copy.

---

### Task 1: Add Calendar Aggregation Helpers

**Files:**
- Create: `src/reports/calendar.ts`
- Modify: `src/reports/index.ts`
- Test: `tests/reports/calendar.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/reports/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  calendarDaySummaries,
  categoryTotalsForDate,
  initialSelectedDate,
  mondayWeekdayIndex,
} from '../../src/reports/calendar';
import type { Transaction, TransactionDirection } from '../../src/types';

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

describe('calendar report helpers', () => {
  it('builds one day summary per Vietnam-local day and separates income from expense', () => {
    const summaries = calendarDaySummaries([
      tx({ amount: 20_000, direction: 'expense', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 30_000, direction: 'expense', occurredAt: '2026-07-07T15:00:00.000Z' }),
      tx({ amount: 100_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T06:00:00.000Z' }),
      tx({ amount: 999_000, direction: 'expense', occurredAt: '2026-08-01T05:00:00.000Z' }),
    ], '2026-07');

    expect(summaries).toHaveLength(31);
    expect(summaries[6]).toEqual({
      date: '2026-07-07',
      expenseTotal: 50_000,
      incomeTotal: 100_000,
      netTotal: 50_000,
      hasTransactions: true,
    });
    expect(summaries[0]).toEqual({
      date: '2026-07-01',
      expenseTotal: 0,
      incomeTotal: 0,
      netTotal: 0,
      hasTransactions: false,
    });
  });

  it('groups selected-day totals by category and direction', () => {
    const rows = categoryTotalsForDate([
      tx({ amount: 20_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T05:00:00.000Z' }),
      tx({ amount: 30_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T06:00:00.000Z' }),
      tx({ amount: 12_000, direction: 'expense', category: 'transportation', occurredAt: '2026-07-07T07:00:00.000Z' }),
      tx({ amount: 1_000_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T08:00:00.000Z' }),
      tx({ amount: 99_000, direction: 'expense', category: 'shopping', occurredAt: '2026-07-08T05:00:00.000Z' }),
    ], '2026-07-07');

    expect(rows).toEqual([
      { category: 'salary', direction: 'income', total: 1_000_000, count: 1 },
      { category: 'food-drinks', direction: 'expense', total: 50_000, count: 2 },
      { category: 'transportation', direction: 'expense', total: 12_000, count: 1 },
    ]);
  });

  it('uses Vietnam-local dates across UTC day boundaries', () => {
    const rows = calendarDaySummaries([
      tx({ amount: 10_000, occurredAt: '2026-06-30T17:30:00.000Z' }),
    ], '2026-07');

    expect(rows[0].date).toBe('2026-07-01');
    expect(rows[0].expenseTotal).toBe(10_000);
  });

  it('selects today for the current month', () => {
    expect(initialSelectedDate('2026-07', [
      tx({ occurredAt: '2026-07-03T05:00:00.000Z' }),
    ], '2026-07-07')).toBe('2026-07-07');
  });

  it('selects the first transaction day for a non-current month', () => {
    expect(initialSelectedDate('2026-06', [
      tx({ occurredAt: '2026-06-12T05:00:00.000Z' }),
      tx({ occurredAt: '2026-06-03T05:00:00.000Z' }),
    ], '2026-07-07')).toBe('2026-06-03');
  });

  it('selects the first day when a non-current month has no transactions', () => {
    expect(initialSelectedDate('2026-06', [], '2026-07-07')).toBe('2026-06-01');
  });

  it('returns Monday-based weekday indexes', () => {
    expect(mondayWeekdayIndex('2026-07-06')).toBe(0);
    expect(mondayWeekdayIndex('2026-07-12')).toBe(6);
  });
});
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```bash
pnpm test tests/reports/calendar.test.ts
```

Expected: FAIL because `src/reports/calendar.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `src/reports/calendar.ts`:

```ts
import { todayVietnamDate } from '../lib/date';
import type { Category, Transaction, TransactionDirection } from '../types';
import { totalsByDirection } from './totals';

export interface CalendarDaySummary {
  date: string;
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  hasTransactions: boolean;
}

export interface CategoryDayTotal {
  category: Category;
  direction: TransactionDirection;
  total: number;
  count: number;
}

function transactionDirection(transaction: Transaction): TransactionDirection {
  return transaction.direction === 'income' ? 'income' : 'expense';
}

function daysInMonth(monthISO: string): number {
  const [year, month] = monthISO.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayDate(monthISO: string, day: number): string {
  return `${monthISO}-${String(day).padStart(2, '0')}`;
}

export function mondayWeekdayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)).getUTCDay();
  return (weekday + 6) % 7;
}

export function calendarDaySummaries(
  transactions: Transaction[],
  monthISO: string,
): CalendarDaySummary[] {
  const totalsByDate = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (date.slice(0, 7) !== monthISO) continue;
    const rows = totalsByDate.get(date) ?? [];
    rows.push(transaction);
    totalsByDate.set(date, rows);
  }

  return Array.from({ length: daysInMonth(monthISO) }, (_, index) => {
    const date = dayDate(monthISO, index + 1);
    const rows = totalsByDate.get(date) ?? [];
    const totals = totalsByDirection(rows);
    return {
      date,
      expenseTotal: totals.expense,
      incomeTotal: totals.income,
      netTotal: totals.net,
      hasTransactions: rows.length > 0,
    };
  });
}

export function categoryTotalsForDate(
  transactions: Transaction[],
  date: string,
): CategoryDayTotal[] {
  const byCategory = new Map<Category, CategoryDayTotal>();

  for (const transaction of transactions) {
    if (todayVietnamDate(new Date(transaction.occurredAt)) !== date) continue;

    const existing = byCategory.get(transaction.category) ?? {
      category: transaction.category,
      direction: transactionDirection(transaction),
      total: 0,
      count: 0,
    };

    existing.total += transaction.amount;
    existing.count += 1;
    byCategory.set(transaction.category, existing);
  }

  return Array.from(byCategory.values()).sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'income' ? -1 : 1;
    return b.total - a.total;
  });
}

export function initialSelectedDate(
  monthISO: string,
  transactions: Transaction[],
  today = todayVietnamDate(),
): string {
  if (today.slice(0, 7) === monthISO) return today;

  const firstTransactionDay = calendarDaySummaries(transactions, monthISO)
    .find(summary => summary.hasTransactions);

  return firstTransactionDay?.date ?? `${monthISO}-01`;
}
```

Modify `src/reports/index.ts`:

```ts
export { sumByCategory } from './by-category';
export { dailyTotals } from './by-day';
export { monthOverMonth } from './deltas';
export { hints } from './anomalies';
export { status, type BudgetStatus } from './over-budget';
export { totalsByDirection, type DirectionTotals } from './totals';
export {
  calendarDaySummaries,
  categoryTotalsForDate,
  initialSelectedDate,
  mondayWeekdayIndex,
  type CalendarDaySummary,
  type CategoryDayTotal,
} from './calendar';
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
pnpm test tests/reports/calendar.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper changes**

Run:

```bash
git add src/reports/calendar.ts src/reports/index.ts tests/reports/calendar.test.ts
git commit -m "feat: add calendar aggregation helpers"
```

Expected: commit succeeds with only helper files staged.

---

### Task 2: Add Calendar Navigation, Route, and Translations

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/Layout.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/vi.json`
- Test: `tests/ui/Layout.test.tsx`

- [ ] **Step 1: Write the failing layout test**

Modify `tests/ui/Layout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initI18n } from '../../src/i18n';
import { Layout } from '../../src/ui/Layout';

vi.mock('../../src/ui/components/UpdatePrompt', () => ({
  UpdatePrompt: () => null,
}));

vi.mock('../../src/ui/components/InstallPrompt', () => ({
  InstallPrompt: () => null,
}));

beforeAll(async () => { await initI18n(); });

describe('Layout', () => {
  it('keeps manual add in the primary navigation', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /add|thêm/i })).toHaveAttribute('href', '/add');
  });

  it('adds the calendar tab between add and reports', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/',
      '/add',
      '/calendar',
      '/reports',
      '/settings',
    ]);
    expect(screen.getByRole('link', { name: /calendar|lịch/i })).toHaveAttribute('href', '/calendar');
  });
});
```

- [ ] **Step 2: Run the failing layout test**

Run:

```bash
pnpm test tests/ui/Layout.test.tsx
```

Expected: FAIL because the `/calendar` link is missing.

- [ ] **Step 3: Add translations**

Modify the `nav` object in `src/i18n/en.json`:

```json
"nav": { "home": "Home", "add": "Add", "calendar": "Calendar", "reports": "Reports", "settings": "Settings" },
```

Add a new top-level `calendar` object in `src/i18n/en.json` after `reports`:

```json
"calendar": {
  "title": "Calendar",
  "weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "income": "Income",
  "expense": "Expense",
  "net": "Net",
  "selectedDate": "Selected date",
  "emptyDay": "No transactions on this day",
  "emptyMonth": "No transactions this month",
  "selectDate": "Select {{date}}",
  "transactionCount": "{{count}} transaction",
  "transactionCount_plural": "{{count}} transactions"
},
```

Modify the `nav` object in `src/i18n/vi.json`:

```json
"nav": { "home": "Trang chủ", "add": "Thêm", "calendar": "Lịch", "reports": "Báo cáo", "settings": "Cài đặt" },
```

Add a new top-level `calendar` object in `src/i18n/vi.json` after `reports`:

```json
"calendar": {
  "title": "Lịch",
  "weekdays": ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
  "income": "Thu nhập",
  "expense": "Chi tiêu",
  "net": "Còn lại",
  "selectedDate": "Ngày đang chọn",
  "emptyDay": "Ngày này chưa có giao dịch",
  "emptyMonth": "Tháng này chưa có giao dịch",
  "selectDate": "Chọn {{date}}",
  "transactionCount": "{{count}} giao dịch",
  "transactionCount_plural": "{{count}} giao dịch"
},
```

- [ ] **Step 4: Add route and nav link**

Modify `src/App.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { HomeScreen } from './ui/HomeScreen';
import { AddScreen } from './ui/AddScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { ConfirmScreen } from './ui/ConfirmScreen';
import { AuthGate } from './ui/AuthGate';

const CalendarScreen = lazy(() =>
  import('./ui/CalendarScreen').then(m => ({ default: m.CalendarScreen })),
);

const ReportsScreen = lazy(() =>
  import('./ui/ReportsScreen').then(m => ({ default: m.ReportsScreen })),
);

function RouteFallback() {
  return <div className="p-4 text-sm text-gray-500">Loading...</div>;
}

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeScreen />} />
          <Route path="add" element={<AddScreen />} />
          <Route path="confirm" element={<ConfirmScreen />} />
          <Route
            path="calendar"
            element={
              <Suspense fallback={<RouteFallback />}>
                <CalendarScreen />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ReportsScreen />
              </Suspense>
            }
          />
          <Route path="settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
```

Modify `src/ui/Layout.tsx`:

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UpdatePrompt } from './components/UpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';

export function Layout() {
  const { t } = useTranslation();
  const tab = 'flex-1 py-3 text-center text-sm';
  const active = ({ isActive }: { isActive: boolean }) =>
    `${tab} ${isActive ? 'font-bold text-blue-600' : 'text-gray-600'}`;
  return (
    <div className="min-h-screen flex flex-col">
      <UpdatePrompt />
      <InstallPrompt />
      <main className="flex-1 pb-16"><Outlet /></main>
      <nav className="fixed bottom-0 inset-x-0 flex bg-white border-t">
        <NavLink to="/" end className={active}>{t('nav.home')}</NavLink>
        <NavLink to="/add" className={active}>{t('nav.add')}</NavLink>
        <NavLink to="/calendar" className={active}>{t('nav.calendar')}</NavLink>
        <NavLink to="/reports" className={active}>{t('nav.reports')}</NavLink>
        <NavLink to="/settings" className={active}>{t('nav.settings')}</NavLink>
      </nav>
    </div>
  );
}
```

- [ ] **Step 5: Add a temporary CalendarScreen export for routing**

Create `src/ui/CalendarScreen.tsx`:

```tsx
import { useTranslation } from 'react-i18next';

export function CalendarScreen() {
  const { t } = useTranslation();
  return (
    <div className="p-4 pb-20">
      <h1 className="text-lg font-semibold">{t('calendar.title')}</h1>
    </div>
  );
}
```

- [ ] **Step 6: Run layout test**

Run:

```bash
pnpm test tests/ui/Layout.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit route and nav changes**

Run:

```bash
git add src/App.tsx src/ui/Layout.tsx src/ui/CalendarScreen.tsx src/i18n/en.json src/i18n/vi.json tests/ui/Layout.test.tsx
git commit -m "feat: add calendar route"
```

Expected: commit succeeds with route, nav, i18n, temporary screen, and layout test.

---

### Task 3: Build the Calendar Screen UI

**Files:**
- Modify: `src/ui/CalendarScreen.tsx`
- Test: `tests/ui/CalendarScreen.test.tsx`

- [ ] **Step 1: Write failing CalendarScreen UI tests**

Create `tests/ui/CalendarScreen.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the failing CalendarScreen tests**

Run:

```bash
pnpm test tests/ui/CalendarScreen.test.tsx
```

Expected: FAIL because the temporary `CalendarScreen` does not load cloud transactions or render calendar UI.

- [ ] **Step 3: Replace CalendarScreen with the real implementation**

Modify `src/ui/CalendarScreen.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useMonthCloudTransactions } from '../hooks/useCloudTransactions';
import { monthOfVietnamDate, nextMonth, prevMonth, todayVietnamDate } from '../lib/date';
import { formatVND } from '../lib/money';
import {
  calendarDaySummaries,
  categoryTotalsForDate,
  initialSelectedDate,
  mondayWeekdayIndex,
} from '../reports';
import type { CategoryDayTotal, CalendarDaySummary } from '../reports';

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function safeMonth(value: string | null): string {
  return value && VALID_MONTH.test(value) ? value : monthOfVietnamDate(todayVietnamDate());
}

function displayMonth(monthISO: string): string {
  const [year, month] = monthISO.split('-');
  return `${month}/${year}`;
}

function directionColor(direction: CategoryDayTotal['direction']): string {
  return direction === 'income' ? 'text-emerald-700' : 'text-red-600';
}

interface CalendarGridProps {
  days: CalendarDaySummary[];
  selectedDate: string;
  today: string;
  weekdays: string[];
  locale: 'en' | 'vi';
  onSelect: (date: string) => void;
  selectDateLabel: (date: string) => string;
}

function CalendarGrid({
  days,
  selectedDate,
  today,
  weekdays,
  locale,
  onSelect,
  selectDateLabel,
}: CalendarGridProps) {
  const leadingBlanks = days.length > 0 ? mondayWeekdayIndex(days[0].date) : 0;
  const cells = [
    ...Array.from({ length: leadingBlanks }, (_, index) => ({ kind: 'blank' as const, id: `blank-${index}` })),
    ...days.map(day => ({ kind: 'day' as const, day })),
  ];

  return (
    <section className="px-3">
      <div className="grid grid-cols-7 border-y bg-gray-50 text-center text-[11px] uppercase text-gray-500">
        {weekdays.map(day => (
          <div key={day} className="py-2">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l">
        {cells.map(cell => {
          if (cell.kind === 'blank') {
            return <div key={cell.id} className="min-h-16 border-b border-r bg-gray-50" />;
          }

          const { day } = cell;
          const isSelected = day.date === selectedDate;
          const isToday = day.date === today;
          return (
            <button
              key={day.date}
              type="button"
              className={[
                'min-h-16 border-b border-r p-1 text-left text-xs',
                isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-500' : 'bg-white',
                isToday ? 'font-semibold' : '',
              ].join(' ')}
              aria-label={selectDateLabel(day.date)}
              onClick={() => onSelect(day.date)}
            >
              <span className={isToday ? 'text-blue-700' : 'text-gray-700'}>
                {Number(day.date.slice(8, 10))}
              </span>
              {day.expenseTotal > 0 && (
                <span className="mt-1 block truncate text-[11px] font-semibold text-red-600">
                  {formatVND(day.expenseTotal, locale)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const [searchParams, setSearchParams] = useSearchParams();
  const month = safeMonth(searchParams.get('month'));
  const today = todayVietnamDate();
  const { data: transactions, loading, error, reload } = useMonthCloudTransactions(month);
  const [selectedDate, setSelectedDate] = useState(() => initialSelectedDate(month, [], today));
  const [userTouchedDate, setUserTouchedDate] = useState(false);

  const daySummaries = useMemo(
    () => calendarDaySummaries(transactions, month),
    [transactions, month],
  );
  const monthTotals = useMemo(
    () => daySummaries.reduce(
      (totals, day) => ({
        expense: totals.expense + day.expenseTotal,
        income: totals.income + day.incomeTotal,
        net: totals.net + day.netTotal,
      }),
      { expense: 0, income: 0, net: 0 },
    ),
    [daySummaries],
  );
  const selectedRows = useMemo(
    () => categoryTotalsForDate(transactions, selectedDate),
    [transactions, selectedDate],
  );
  const hasMonthTransactions = daySummaries.some(day => day.hasTransactions);

  useEffect(() => {
    setUserTouchedDate(false);
  }, [month]);

  useEffect(() => {
    if (!userTouchedDate) {
      setSelectedDate(initialSelectedDate(month, transactions, today));
    }
  }, [month, transactions, today, userTouchedDate]);

  function step(direction: -1 | 1) {
    const next = direction === -1 ? prevMonth(month) : nextMonth(month);
    setSearchParams({ month: next });
    setUserTouchedDate(false);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setUserTouchedDate(true);
  }

  function retry() {
    void reload();
  }

  return (
    <div className="pb-20">
      <header className="flex items-center justify-between p-4">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="h-10 w-10 rounded border text-xl"
        >
          ‹
        </button>
        <h1 className="text-lg font-semibold">{displayMonth(month)}</h1>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="h-10 w-10 rounded border text-xl"
        >
          ›
        </button>
      </header>

      {error && (
        <div role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div>{error}</div>
          <button
            type="button"
            className="mt-2 rounded bg-red-600 px-3 py-1 text-white"
            onClick={retry}
          >
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {loading && (
        <div className="px-4 pb-3 text-sm text-gray-500" role="status">
          {t('cloud.loading')}
        </div>
      )}

      {!loading && !error && (
        <>
          <CalendarGrid
            days={daySummaries}
            selectedDate={selectedDate}
            today={today}
            weekdays={t('calendar.weekdays', { returnObjects: true }) as string[]}
            locale={locale}
            onSelect={selectDate}
            selectDateLabel={date => t('calendar.selectDate', { date })}
          />

          <section className="grid grid-cols-3 gap-2 px-4 py-4">
            <div>
              <div className="text-xs uppercase text-gray-500">{t('calendar.expense')}</div>
              <div className="text-sm font-semibold text-red-600">{formatVND(monthTotals.expense, locale)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500">{t('calendar.income')}</div>
              <div className="text-sm font-semibold text-emerald-700">{formatVND(monthTotals.income, locale)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500">{t('calendar.net')}</div>
              <div className="text-sm font-semibold">{formatVND(monthTotals.net, locale)}</div>
            </div>
          </section>

          {!hasMonthTransactions && (
            <div className="px-4 pb-3 text-sm text-gray-500">{t('calendar.emptyMonth')}</div>
          )}

          <section className="px-4">
            <h2 className="pb-2 text-sm uppercase text-gray-500">
              {t('calendar.selectedDate')}: {selectedDate}
            </h2>
            {selectedRows.length === 0 ? (
              <div className="text-sm text-gray-500">{t('calendar.emptyDay')}</div>
            ) : (
              <ul aria-label={t('calendar.selectedDate')} className="divide-y rounded border bg-white">
                {selectedRows.map(row => (
                  <li key={`${row.direction}-${row.category}`} className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium">{t(`category.${row.category}`)}</div>
                      <div className="text-xs text-gray-500">
                        {t('calendar.transactionCount', { count: row.count })}
                      </div>
                    </div>
                    <div className={`font-semibold ${directionColor(row.direction)}`}>
                      {formatVND(row.total, locale)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run CalendarScreen tests**

Run:

```bash
pnpm test tests/ui/CalendarScreen.test.tsx
```

Expected: PASS. If React Router warns about future flags, ignore the warning unless the test fails.

- [ ] **Step 5: Commit screen implementation**

Run:

```bash
git add src/ui/CalendarScreen.tsx tests/ui/CalendarScreen.test.tsx
git commit -m "feat: add calendar screen"
```

Expected: commit succeeds with only CalendarScreen and its tests staged.

---

### Task 4: Run Focused Regression Tests and Fix Integration Issues

**Files:**
- Modify only the files touched by Tasks 1-3 if a focused test exposes a real integration issue.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm test tests/reports/calendar.test.ts tests/ui/CalendarScreen.test.tsx tests/ui/Layout.test.tsx tests/hooks/useCloudTransactions.test.tsx tests/ui/ReportsScreen.test.tsx
```

Expected: PASS for all listed test files.

- [ ] **Step 2: Fix any focused test failure with the smallest scoped edit**

If a test fails because the implementation differs from the plan, edit the relevant file and keep the intended behavior:

```ts
// Expected preserved behavior:
// - useMonthCloudTransactions receives the month string shown in the UI.
// - Day cells show expense totals only.
// - Month totals show expense, income, and net.
// - Selected-day rows group by category.
// - Layout order is /, /add, /calendar, /reports, /settings.
```

Run the same focused command again:

```bash
pnpm test tests/reports/calendar.test.ts tests/ui/CalendarScreen.test.tsx tests/ui/Layout.test.tsx tests/hooks/useCloudTransactions.test.tsx tests/ui/ReportsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit any focused regression fixes**

If Step 2 changed files, run:

```bash
git add src/reports/calendar.ts src/reports/index.ts src/ui/CalendarScreen.tsx src/App.tsx src/ui/Layout.tsx src/i18n/en.json src/i18n/vi.json tests/reports/calendar.test.ts tests/ui/CalendarScreen.test.tsx tests/ui/Layout.test.tsx
git commit -m "fix: stabilize calendar integration"
```

Expected: commit succeeds if there were fixes. If Step 2 made no edits, skip this commit.

---

### Task 5: Full Verification

**Files:**
- No source edits unless verification reveals a real issue introduced by this phase.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript build check**

Run:

```bash
pnpm exec tsc -b
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm run build
```

Expected: PASS. A Vite chunk-size warning is acceptable if it matches the existing warning pattern from this repo.

- [ ] **Step 4: Check whitespace and staged state**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` exits successfully.
- `git status --short` shows only intentional calendar-phase changes plus pre-existing untracked files that were already present before this phase, such as `.superpowers/`, older untracked June docs, and `supabase/.temp/`.

- [ ] **Step 5: Commit verification fixes if needed**

If Steps 1-4 required edits, run:

```bash
git add src/reports/calendar.ts src/reports/index.ts src/ui/CalendarScreen.tsx src/App.tsx src/ui/Layout.tsx src/i18n/en.json src/i18n/vi.json tests/reports/calendar.test.ts tests/ui/CalendarScreen.test.tsx tests/ui/Layout.test.tsx
git commit -m "fix: complete calendar verification"
```

Expected: commit succeeds if there were verification fixes. If no edits were needed, skip this commit.

---

## Completion Criteria

- `/calendar` exists and is reachable from the bottom nav as `Lịch` between `Thêm` and `Báo cáo`.
- The calendar screen reads Supabase month transactions through `useMonthCloudTransactions`.
- Calendar day cells show expense totals only.
- Monthly summary shows expense, income, and net.
- Selecting a date shows category-grouped rows for that day.
- Empty, loading, and error states are visible.
- Existing Home, Add, image/OCR, email automation, Reports, and Settings flows are not removed or replaced.
- `pnpm test`, `pnpm exec tsc -b`, and `pnpm run build` pass.
