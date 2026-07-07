# Money Note Reports Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/reports` into a compact Money Note-like monthly report with expense/income tabs, category percentages, and category drill-down.

**Architecture:** Keep `/reports` backed by the existing `useReports(monthISO)` hook and Supabase monthly query. Add small pure report helpers for direction-aware category summaries and category-day totals, then derive all UI state locally in `ReportsScreen`. Preserve existing budget alert, anomaly, month navigation, and cloud error paths.

**Tech Stack:** React, TypeScript, Vite, Vitest, React Testing Library, Recharts, react-i18next, Supabase client helpers.

---

## File Structure

- Create `src/reports/direction.ts`
  - Responsibility: normalize legacy transactions without `direction` to `expense`.
- Create `src/reports/category-summary.ts`
  - Responsibility: produce non-zero category summaries for one transaction direction, including percentages.
- Create `src/reports/category-day-totals.ts`
  - Responsibility: produce one day bucket per day in a month for one direction/category pair.
- Modify `src/reports/index.ts`
  - Responsibility: export the new pure helpers.
- Modify `src/hooks/useReports.ts`
  - Responsibility: expose current-month `transactions` alongside existing aggregate values.
- Modify `src/ui/components/Charts/CategoryPie.tsx`
  - Responsibility: accept a custom empty-state label for expense/income reports.
- Modify `src/ui/ReportsScreen.tsx`
  - Responsibility: render direction tabs, category summary rows, and in-screen category detail.
- Modify `src/i18n/vi.json` and `src/i18n/en.json`
  - Responsibility: add new report strings.
- Modify tests:
  - `tests/reports/category-summary.test.ts`
  - `tests/reports/category-day-totals.test.ts`
  - `tests/hooks/useReports.test.tsx`
  - `tests/ui/Charts.test.tsx`
  - `tests/ui/ReportsScreen.test.tsx`

---

### Task 1: Add Direction-Aware Report Helpers

**Files:**
- Create: `src/reports/direction.ts`
- Create: `src/reports/category-summary.ts`
- Create: `src/reports/category-day-totals.ts`
- Modify: `src/reports/index.ts`
- Test: `tests/reports/category-summary.test.ts`
- Test: `tests/reports/category-day-totals.test.ts`

- [ ] **Step 1: Write failing tests for category summaries**

Create `tests/reports/category-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { categorySummaries } from '../../src/reports/category-summary';
import type { Transaction } from '../../src/types';

function tx(overrides: Partial<Transaction> & { direction?: Transaction['direction'] } = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    amount: overrides.amount ?? 10_000,
    currency: 'VND',
    occurredAt: overrides.occurredAt ?? '2026-07-04T14:48:00.000Z',
    category: 'food-drinks',
    direction: 'expense',
    source: 'manual',
    createdAt: '2026-07-04T14:48:00.000Z',
    updatedAt: '2026-07-04T14:48:00.000Z',
    ...overrides,
  } as Transaction;
}

describe('categorySummaries', () => {
  it('returns non-zero expense categories with percentages', () => {
    const out = categorySummaries([
      tx({ id: 'food', amount: 30_000, category: 'food-drinks' }),
      tx({ id: 'health', amount: 10_000, category: 'healthcare' }),
      tx({ id: 'income', amount: 100_000, direction: 'income', category: 'salary' }),
    ], 'expense');

    expect(out).toEqual([
      { category: 'food-drinks', direction: 'expense', total: 30_000, percentage: 0.75 },
      { category: 'healthcare', direction: 'expense', total: 10_000, percentage: 0.25 },
    ]);
  });

  it('returns non-zero income categories with percentages', () => {
    const out = categorySummaries([
      tx({ id: 'salary', amount: 80_000, direction: 'income', category: 'salary' }),
      tx({ id: 'bonus', amount: 20_000, direction: 'income', category: 'bonus' }),
      tx({ id: 'expense', amount: 10_000, category: 'food-drinks' }),
    ], 'income');

    expect(out).toEqual([
      { category: 'salary', direction: 'income', total: 80_000, percentage: 0.8 },
      { category: 'bonus', direction: 'income', total: 20_000, percentage: 0.2 },
    ]);
  });

  it('treats legacy transactions without direction as expenses', () => {
    const legacy = tx({ id: 'legacy', amount: 12_000, category: 'others' }) as Transaction & { direction?: never };
    delete legacy.direction;

    expect(categorySummaries([legacy], 'expense')).toEqual([
      { category: 'others', direction: 'expense', total: 12_000, percentage: 1 },
    ]);
    expect(categorySummaries([legacy], 'income')).toEqual([]);
  });

  it('returns an empty array when the selected direction has no total', () => {
    expect(categorySummaries([], 'expense')).toEqual([]);
    expect(categorySummaries([tx({ direction: 'income', category: 'salary' })], 'expense')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run category summary tests and verify failure**

Run:

```bash
pnpm test tests/reports/category-summary.test.ts
```

Expected: fail because `src/reports/category-summary.ts` does not exist.

- [ ] **Step 3: Write failing tests for category day totals**

Create `tests/reports/category-day-totals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { categoryDayTotals } from '../../src/reports/category-day-totals';
import type { Transaction } from '../../src/types';

function tx(overrides: Partial<Transaction> & { direction?: Transaction['direction'] } = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    amount: overrides.amount ?? 10_000,
    currency: 'VND',
    occurredAt: overrides.occurredAt ?? '2026-07-04T14:48:00.000Z',
    category: 'food-drinks',
    direction: 'expense',
    source: 'manual',
    createdAt: '2026-07-04T14:48:00.000Z',
    updatedAt: '2026-07-04T14:48:00.000Z',
    ...overrides,
  } as Transaction;
}

describe('categoryDayTotals', () => {
  it('returns one bucket per day and filters by direction and category', () => {
    const out = categoryDayTotals([
      tx({ id: 'food-4', amount: 10_000, category: 'food-drinks', occurredAt: '2026-07-04T14:48:00.000Z' }),
      tx({ id: 'food-4-again', amount: 5_000, category: 'food-drinks', occurredAt: '2026-07-04T17:00:00.000Z' }),
      tx({ id: 'health', amount: 12_000, category: 'healthcare', occurredAt: '2026-07-04T14:48:00.000Z' }),
      tx({ id: 'income', amount: 90_000, direction: 'income', category: 'salary', occurredAt: '2026-07-04T14:48:00.000Z' }),
      tx({ id: 'next-month', amount: 8_000, category: 'food-drinks', occurredAt: '2026-08-01T14:48:00.000Z' }),
    ], '2026-07', 'expense', 'food-drinks');

    expect(out).toHaveLength(31);
    expect(out.find(d => d.date === '2026-07-04')?.total).toBe(15_000);
    expect(out.find(d => d.date === '2026-07-05')?.total).toBe(0);
  });

  it('supports income categories', () => {
    const out = categoryDayTotals([
      tx({ id: 'salary', amount: 100_000, direction: 'income', category: 'salary', occurredAt: '2026-07-10T08:00:00.000Z' }),
      tx({ id: 'expense', amount: 20_000, category: 'food-drinks', occurredAt: '2026-07-10T08:00:00.000Z' }),
    ], '2026-07', 'income', 'salary');

    expect(out.find(d => d.date === '2026-07-10')?.total).toBe(100_000);
  });

  it('treats legacy transactions without direction as expenses', () => {
    const legacy = tx({ id: 'legacy', amount: 7_000, category: 'others' }) as Transaction & { direction?: never };
    delete legacy.direction;

    expect(categoryDayTotals([legacy], '2026-07', 'expense', 'others').find(d => d.date === '2026-07-04')?.total).toBe(7_000);
    expect(categoryDayTotals([legacy], '2026-07', 'income', 'salary').find(d => d.date === '2026-07-04')?.total).toBe(0);
  });
});
```

- [ ] **Step 4: Run category day tests and verify failure**

Run:

```bash
pnpm test tests/reports/category-day-totals.test.ts
```

Expected: fail because `src/reports/category-day-totals.ts` does not exist.

- [ ] **Step 5: Implement the pure helpers**

Create `src/reports/direction.ts`:

```ts
import type { Transaction, TransactionDirection } from '../types';

type LegacyTransaction = Transaction & { direction?: TransactionDirection };

export function transactionDirection(transaction: Transaction): TransactionDirection {
  return (transaction as LegacyTransaction).direction ?? 'expense';
}
```

Create `src/reports/category-summary.ts`:

```ts
import {
  categoriesForDirection,
  categoryBelongsToDirection,
  type Category,
  type Transaction,
  type TransactionDirection,
} from '../types';
import { transactionDirection } from './direction';

export interface CategorySummary {
  category: Category;
  direction: TransactionDirection;
  total: number;
  percentage: number;
}

export function categorySummaries(
  transactions: Transaction[],
  direction: TransactionDirection,
): CategorySummary[] {
  const categories = categoriesForDirection(direction);
  const totals = new Map<Category, number>();

  for (const category of categories) {
    totals.set(category, 0);
  }

  for (const transaction of transactions) {
    if (transactionDirection(transaction) !== direction) continue;
    if (!categoryBelongsToDirection(transaction.category, direction)) continue;

    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
  }

  const directionTotal = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  if (directionTotal <= 0) return [];

  return categories
    .map(category => ({
      category,
      direction,
      total: totals.get(category) ?? 0,
      percentage: (totals.get(category) ?? 0) / directionTotal,
    }))
    .filter(summary => summary.total > 0);
}
```

Create `src/reports/category-day-totals.ts`:

```ts
import { todayVietnamDate } from '../lib/date';
import {
  categoryBelongsToDirection,
  type Category,
  type Transaction,
  type TransactionDirection,
} from '../types';
import { transactionDirection } from './direction';

export interface CategoryDayTotal {
  date: string;
  total: number;
}

export function categoryDayTotals(
  transactions: Transaction[],
  monthISO: string,
  direction: TransactionDirection,
  category: Category,
): CategoryDayTotal[] {
  const [year, month] = monthISO.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totals = new Array<number>(daysInMonth).fill(0);

  if (!categoryBelongsToDirection(category, direction)) {
    return totals.map((total, index) => ({
      date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
      total,
    }));
  }

  for (const transaction of transactions) {
    if (transactionDirection(transaction) !== direction) continue;
    if (transaction.category !== category) continue;

    const date = todayVietnamDate(new Date(transaction.occurredAt));
    if (date.slice(0, 7) !== monthISO) continue;

    const day = Number(date.slice(8, 10));
    totals[day - 1] += transaction.amount;
  }

  return totals.map((total, index) => ({
    date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    total,
  }));
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
export { transactionDirection } from './direction';
export { categorySummaries, type CategorySummary } from './category-summary';
export { categoryDayTotals, type CategoryDayTotal } from './category-day-totals';
export {
  calendarDaySummaries,
  categoryTotalsForDate,
  initialSelectedDate,
  mondayWeekdayIndex,
  type CalendarDaySummary,
  type CategoryDayTotal as CalendarCategoryDayTotal,
} from './calendar';
```

- [ ] **Step 6: Run helper tests and commit**

Run:

```bash
pnpm test tests/reports/category-summary.test.ts tests/reports/category-day-totals.test.ts
```

Expected: both files pass.

Commit:

```bash
git add src/reports/direction.ts src/reports/category-summary.ts src/reports/category-day-totals.ts src/reports/index.ts tests/reports/category-summary.test.ts tests/reports/category-day-totals.test.ts
git commit -m "feat: add direction-aware report helpers"
```

---

### Task 2: Expose Current Transactions From useReports

**Files:**
- Modify: `src/hooks/useReports.ts`
- Modify: `tests/hooks/useReports.test.tsx`
- Modify: `tests/ui/ReportsScreen.test.tsx`

- [ ] **Step 1: Write failing hook assertions**

In `tests/hooks/useReports.test.tsx`, extend the current-month test:

```ts
expect(result.current.transactions).toEqual([]);
```

In the existing `aggregates legacy current month cloud transactions with local budget data` test, add:

```ts
expect(result.current.transactions.map(t => t.id)).toEqual(['curr-food']);
```

In the `returns current month totals split by direction` test, add:

```ts
expect(result.current.transactions.map(t => t.id)).toEqual(['expense', 'income']);
```

In the Supabase-not-configured test, add:

```ts
expect(result.current.transactions).toEqual([]);
```

In the cloud-failure test, add:

```ts
expect(result.current.transactions).toEqual([]);
```

- [ ] **Step 2: Run hook tests and verify failure**

Run:

```bash
pnpm test tests/hooks/useReports.test.tsx
```

Expected: fail because `transactions` is missing from `UseReportsResult`.

- [ ] **Step 3: Implement `transactions` in useReports**

Modify `src/hooks/useReports.ts`:

```ts
export interface UseReportsResult {
  loading: boolean;
  error: string | null;
  transactions: Transaction[];
  sums: Record<Category, number>;
  daily: Array<{ date: string; total: number }>;
  deltas: ReturnType<typeof monthOverMonth>;
  directionTotals: DirectionTotals;
  anomalyHints: ReturnType<typeof hints>;
  bStatus: { overall: BudgetStatus; perCategory: Record<Category, BudgetStatus>; overallSpent: number };
  reload: () => Promise<void>;
}
```

At the end of the hook, return `curr` as `transactions`:

```ts
return {
  loading,
  error,
  transactions: curr,
  sums,
  daily,
  deltas,
  directionTotals,
  anomalyHints,
  bStatus,
  reload,
};
```

- [ ] **Step 4: Update ReportsScreen test factory**

Modify `makeReportState()` in `tests/ui/ReportsScreen.test.tsx` so mocked report state includes transactions:

```ts
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
    },
    directionTotals: {
      expense: 0,
      income: 0,
      net: 0,
    },
    ...overrides,
  };
}
```

- [ ] **Step 5: Run hook and ReportsScreen smoke tests, then commit**

Run:

```bash
pnpm test tests/hooks/useReports.test.tsx tests/ui/ReportsScreen.test.tsx
```

Expected: both files pass.

Commit:

```bash
git add src/hooks/useReports.ts tests/hooks/useReports.test.tsx tests/ui/ReportsScreen.test.tsx
git commit -m "feat: expose report transactions"
```

---

### Task 3: Add Expense/Income Overview To ReportsScreen

**Files:**
- Modify: `src/ui/components/Charts/CategoryPie.tsx`
- Modify: `tests/ui/Charts.test.tsx`
- Modify: `src/ui/ReportsScreen.tsx`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Modify: `tests/ui/ReportsScreen.test.tsx`

- [ ] **Step 1: Write failing chart test for custom empty label**

Add this test to `tests/ui/Charts.test.tsx`:

```ts
it('uses a custom empty label when provided', () => {
  render(<CategoryPie
    data={[{ category: 'salary', total: 0, label: 'Salary', color: '#22c55e' }]}
    emptyLabel="No income this month"
  />);

  expect(screen.getByText('No income this month')).toBeInTheDocument();
});
```

Run:

```bash
pnpm test tests/ui/Charts.test.tsx
```

Expected: fail because `CategoryPie` does not accept `emptyLabel`.

- [ ] **Step 2: Implement custom empty label in CategoryPie**

Modify `src/ui/components/Charts/CategoryPie.tsx`:

```tsx
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';
import type { Category } from '../../../types';

export interface CategoryDatum {
  category: Category;
  total: number;
  label: string;
  color: string;
}

export function CategoryPie({
  data,
  emptyLabel,
}: {
  data: CategoryDatum[];
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const nonZero = data.filter(d => d.total > 0);
  if (nonZero.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-gray-500" role="status">
        {emptyLabel ?? t('reports.noSpending')}
      </div>
    );
  }
  return (
    <div className="w-full h-64">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={nonZero} dataKey="total" nameKey="label" innerRadius={50} outerRadius={90}>
            {nonZero.map(d => <Cell key={d.category} fill={d.color} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Add i18n keys**

Modify `src/i18n/en.json` inside `"reports"`:

```json
"expenseTab": "Expense",
"incomeTab": "Income",
"categoryShare": "{{pct}}%",
"noDirectionData": "No {{direction}} transactions this month",
"categoryDetailTitle": "{{category}} in {{month}}",
"noCategoryTransactions": "No transactions in this category",
"backToReports": "Back to reports"
```

Modify `src/i18n/vi.json` inside `"reports"`:

```json
"expenseTab": "Chi tiêu",
"incomeTab": "Thu nhập",
"categoryShare": "{{pct}}%",
"noDirectionData": "Chưa có giao dịch {{direction}} trong tháng này",
"categoryDetailTitle": "{{category}} trong {{month}}",
"noCategoryTransactions": "Chưa có giao dịch trong danh mục này",
"backToReports": "Quay lại báo cáo"
```

Keep the JSON valid by adding commas around neighboring keys.

- [ ] **Step 4: Write failing ReportsScreen overview tests**

In `tests/ui/ReportsScreen.test.tsx`, update imports:

```ts
import { CATEGORIES, type Category, type Transaction } from '../../src/types';
```

Add a transaction factory above `makeReportState()`:

```ts
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
```

Add tests:

```ts
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
  expect(screen.getByText(/75/)).toBeInTheDocument();
  expect(screen.getByText('Healthcare')).toBeInTheDocument();
  expect(screen.queryByText('Salary')).not.toBeInTheDocument();
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
  expect(screen.getByText('Bonus')).toBeInTheDocument();
  expect(screen.queryByText('Food & Drinks')).not.toBeInTheDocument();
});
```

Run:

```bash
pnpm test tests/ui/ReportsScreen.test.tsx
```

Expected: fail because direction segment and direction-aware rows do not exist yet.

- [ ] **Step 5: Implement overview UI in ReportsScreen**

Modify `src/ui/ReportsScreen.tsx` imports:

```tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useReports } from '../hooks/useReports';
import { categorySummaries } from '../reports';
import { CategoryPie } from './components/Charts/CategoryPie';
import { MonthBar } from './components/Charts/MonthBar';
import { BudgetAlert } from './components/BudgetAlert';
import { monthOfVietnamDate, todayVietnamDate, prevMonth, nextMonth } from '../lib/date';
import type { Category, TransactionDirection } from '../types';
import { formatVND } from '../lib/money';
```

Replace `CHART_COLORS` with all categories:

```ts
const CATEGORY_COLORS: Record<Category, string> = {
  'food-drinks': '#ef4444',
  'coffee-bubble-tea': '#f59e0b',
  transportation: '#3b82f6',
  shopping: '#a855f7',
  'bills-utilities': '#10b981',
  healthcare: '#ec4899',
  entertainment: '#06b6d4',
  'transfers-debt': '#6b7280',
  others: '#9ca3af',
  salary: '#22c55e',
  allowance: '#14b8a6',
  bonus: '#f97316',
  'side-income': '#06b6d4',
  investment: '#8b5cf6',
  'temporary-income': '#f472b6',
};
```

Inside `ReportsScreen`, destructure transactions and add state:

```tsx
const {
  loading,
  error,
  reload,
  transactions,
  daily,
  directionTotals,
  anomalyHints,
  bStatus,
} = useReports(month);
const [direction, setDirection] = useState<TransactionDirection>('expense');
```

Replace the current `pieData` memo with:

```tsx
const categoryRows = useMemo(
  () => categorySummaries(transactions, direction),
  [transactions, direction],
);

const pieData = useMemo(
  () => categoryRows.map(row => ({
    category: row.category,
    total: row.total,
    label: t(`category.${row.category}`),
    color: CATEGORY_COLORS[row.category],
  })),
  [categoryRows, t],
);

const selectedDirectionLabel = t(`direction.${direction}`).toLowerCase();
```

Replace the pie/list portion with this overview structure while keeping the existing `BudgetAlert`, summaries, `MonthBar`, and anomaly section:

```tsx
<section className="mx-4 mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
  {(['expense', 'income'] as const).map(value => (
    <button
      key={value}
      type="button"
      aria-pressed={direction === value}
      className={`rounded-md px-3 py-2 text-sm font-semibold ${
        direction === value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
      }`}
      onClick={() => setDirection(value)}
    >
      {value === 'expense' ? t('reports.expenseTab') : t('reports.incomeTab')}
    </button>
  ))}
</section>

<section className="px-2">
  <CategoryPie
    data={pieData}
    emptyLabel={t('reports.noDirectionData', { direction: selectedDirectionLabel })}
  />
</section>

<section className="px-4 mt-6">
  <h2 className="text-sm uppercase text-gray-500">{t('reports.byCategory')}</h2>
  {categoryRows.length === 0 ? (
    <div className="mt-3 rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">
      {t('reports.noDirectionData', { direction: selectedDirectionLabel })}
    </div>
  ) : (
    <ul className="mt-2 divide-y divide-gray-200">
      {categoryRows.map(row => (
        <li key={row.category}>
          <button
            type="button"
            className="flex w-full items-center gap-3 py-3 text-left"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[row.category] }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{t(`category.${row.category}`)}</span>
              <span className="block text-xs text-gray-500">
                {t('reports.categoryShare', { pct: Math.round(row.percentage * 1000) / 10 })}
              </span>
            </span>
            <span className="text-sm font-semibold">{formatVND(row.total, locale)}</span>
            <span className="text-gray-400" aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ul>
  )}
</section>
```

- [ ] **Step 6: Run overview tests and commit**

Run:

```bash
pnpm test tests/ui/Charts.test.tsx tests/ui/ReportsScreen.test.tsx
```

Expected: both files pass.

Commit:

```bash
git add src/ui/components/Charts/CategoryPie.tsx src/ui/ReportsScreen.tsx src/i18n/vi.json src/i18n/en.json tests/ui/Charts.test.tsx tests/ui/ReportsScreen.test.tsx
git commit -m "feat: add reports direction overview"
```

---

### Task 4: Add Category Drill-Down

**Files:**
- Modify: `src/ui/ReportsScreen.tsx`
- Modify: `tests/ui/ReportsScreen.test.tsx`

- [ ] **Step 1: Write failing drill-down tests**

Add these tests to `tests/ui/ReportsScreen.test.tsx`:

```ts
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
  expect(screen.queryByText('Pharmacy')).not.toBeInTheDocument();
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
```

Run:

```bash
pnpm test tests/ui/ReportsScreen.test.tsx
```

Expected: fail because category rows do not open detail.

- [ ] **Step 2: Implement drill-down state and derived data**

Modify `src/ui/ReportsScreen.tsx` imports:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { categoryDayTotals, categorySummaries, transactionDirection } from '../reports';
import { categoryBelongsToDirection, type Category, type Transaction, type TransactionDirection } from '../types';
```

Add helper functions near `safeMonth()`:

```tsx
function transactionTitle(transaction: Transaction): string {
  return transaction.merchant?.trim() || transaction.note?.trim() || transaction.category;
}

function signedAmount(transaction: Transaction): number {
  return transactionDirection(transaction) === 'income' ? transaction.amount : -transaction.amount;
}
```

Inside `ReportsScreen`, add selected category state:

```tsx
const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
```

Add a direction compatibility reset:

```tsx
useEffect(() => {
  if (selectedCategory && !categoryBelongsToDirection(selectedCategory, direction)) {
    setSelectedCategory(null);
  }
}, [direction, selectedCategory]);
```

Add derived detail data:

```tsx
const selectedSummary = selectedCategory
  ? categoryRows.find(row => row.category === selectedCategory)
  : undefined;

const detailDaily = useMemo(
  () => selectedCategory
    ? categoryDayTotals(transactions, month, direction, selectedCategory)
    : [],
  [transactions, month, direction, selectedCategory],
);

const detailTransactions = useMemo(
  () => selectedCategory
    ? transactions
        .filter(transaction => (
          transactionDirection(transaction) === direction &&
          transaction.category === selectedCategory &&
          monthOfVietnamDate(transaction.occurredAt) === month
        ))
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    : [],
  [transactions, month, direction, selectedCategory],
);
```

- [ ] **Step 3: Wire row clicks and render detail view**

In each category row button, add:

```tsx
onClick={() => setSelectedCategory(row.category)}
```

Before the overview chart/list block, branch on selected category:

```tsx
{selectedCategory ? (
  <section className="px-4">
    <button
      type="button"
      className="mb-4 text-sm font-semibold text-blue-600"
      onClick={() => setSelectedCategory(null)}
    >
      {t('reports.backToReports')}
    </button>

    <div className="mb-4">
      <h2 className="text-lg font-semibold">
        {t('reports.categoryDetailTitle', {
          category: t(`category.${selectedCategory}`),
          month,
        })}
      </h2>
      <div className="mt-1 text-2xl font-bold">
        {formatVND(selectedSummary?.total ?? 0, locale)}
      </div>
    </div>

    <MonthBar data={detailDaily} />

    {detailTransactions.length === 0 ? (
      <div className="mt-4 rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        {t('reports.noCategoryTransactions')}
      </div>
    ) : (
      <ul className="mt-4 divide-y divide-gray-200">
        {detailTransactions.map(transaction => (
          <li key={transaction.id} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {transactionTitle(transaction) === transaction.category
                  ? t(`category.${transaction.category}`)
                  : transactionTitle(transaction)}
              </span>
              <span className="block text-xs text-gray-500">
                {monthOfVietnamDate(transaction.occurredAt)}
                {transaction.bankHint ? ` · ${transaction.bankHint.toUpperCase()}` : ''}
              </span>
            </span>
            <span className="text-sm font-semibold">
              {formatVND(signedAmount(transaction), locale)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
) : (
  <>
    <section className="mx-4 mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
      {(['expense', 'income'] as const).map(value => (
        <button
          key={value}
          type="button"
          aria-pressed={direction === value}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${
            direction === value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
          }`}
          onClick={() => setDirection(value)}
        >
          {value === 'expense' ? t('reports.expenseTab') : t('reports.incomeTab')}
        </button>
      ))}
    </section>

    <section className="px-2">
      <CategoryPie
        data={pieData}
        emptyLabel={t('reports.noDirectionData', { direction: selectedDirectionLabel })}
      />
    </section>

    <section className="px-2 mt-4">
      <MonthBar data={daily} />
    </section>

    {anomalyHints.length > 0 && (
      <section className="px-4 mt-4">
        <h2 className="text-sm uppercase text-gray-500">{t('reports.anomalies')}</h2>
        <ul className="mt-2 space-y-1">
          {anomalyHints.map(h => (
            <li key={h.category} className="text-sm">
              {t('reports.anomalyLine', {
                category: t(`category.${h.category}`),
                pct: Math.min(Math.round(h.deltaPct * 100), 999),
              })}
            </li>
          ))}
        </ul>
      </section>
    )}

    <section className="px-4 mt-6">
      <h2 className="text-sm uppercase text-gray-500">{t('reports.byCategory')}</h2>
      {categoryRows.length === 0 ? (
        <div className="mt-3 rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">
          {t('reports.noDirectionData', { direction: selectedDirectionLabel })}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-gray-200">
          {categoryRows.map(row => (
            <li key={row.category}>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-3 text-left"
                onClick={() => setSelectedCategory(row.category)}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[row.category] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t(`category.${row.category}`)}</span>
                  <span className="block text-xs text-gray-500">
                    {t('reports.categoryShare', { pct: Math.round(row.percentage * 1000) / 10 })}
                  </span>
                </span>
                <span className="text-sm font-semibold">{formatVND(row.total, locale)}</span>
                <span className="text-gray-400" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  </>
)}
```

Keep `BudgetAlert` and summary cards above this branch so they remain visible in both overview and detail.

- [ ] **Step 4: Run drill-down tests and commit**

Run:

```bash
pnpm test tests/ui/ReportsScreen.test.tsx
```

Expected: pass.

Commit:

```bash
git add src/ui/ReportsScreen.tsx tests/ui/ReportsScreen.test.tsx
git commit -m "feat: add reports category drilldown"
```

---

### Task 5: Preserve Existing Report Behaviors

**Files:**
- Modify: `tests/ui/ReportsScreen.test.tsx`
- Modify: `src/ui/ReportsScreen.tsx` only if these regression tests expose a break.

- [ ] **Step 1: Add focused regression tests**

Add these assertions to existing tests or new tests in `tests/ui/ReportsScreen.test.tsx`:

```ts
it('keeps stale report content hidden during loading', () => {
  reportHooks.state = makeUnavailableReportState({ loading: true });

  render(<MemoryRouter><ReportsScreen /></MemoryRouter>);

  expect(screen.getByText('Loading transactions...')).toBeInTheDocument();
  expect(screen.queryByText('Food & Drinks')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /expense/i })).not.toBeInTheDocument();
});

it('keeps stale report content hidden during errors', () => {
  reportHooks.state = makeUnavailableReportState({ error: 'Cloud report failed' });

  render(<MemoryRouter><ReportsScreen /></MemoryRouter>);

  expect(screen.getByRole('alert')).toHaveTextContent('Cloud report failed');
  expect(screen.queryByText('Food & Drinks')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /expense/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused UI tests**

Run:

```bash
pnpm test tests/ui/ReportsScreen.test.tsx
```

Expected: pass. If either regression fails, move the direction segment and category content inside the existing `reportAvailable` branch so loading/error states render no stale report content.

- [ ] **Step 3: Commit regression coverage**

Commit if tests or UI code changed:

```bash
git add tests/ui/ReportsScreen.test.tsx src/ui/ReportsScreen.tsx
git commit -m "test: cover reports unavailable states"
```

---

### Task 6: Full Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Run focused report suite**

Run:

```bash
pnpm test tests/reports/category-summary.test.ts tests/reports/category-day-totals.test.ts tests/hooks/useReports.test.tsx tests/ui/Charts.test.tsx tests/ui/ReportsScreen.test.tsx
```

Expected: all focused report tests pass.

- [ ] **Step 2: Run full tests**

Run:

```bash
pnpm test
```

Expected: full Vitest suite passes.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
pnpm exec tsc -b
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm run lint
```

Expected: exit code 0. Existing extractor regex warnings may still appear.

- [ ] **Step 5: Run production build**

Run:

```bash
pnpm run build
```

Expected: build succeeds. Existing Vite chunk-size warning may still appear.

- [ ] **Step 6: Manual browser smoke**

If a dev server is not running, start it:

```bash
pnpm run dev
```

Open `/reports?month=2026-07` in the browser and verify:

- Expense tab shows expense categories.
- Income tab shows income categories or an empty state.
- Tapping a category opens detail.
- Back action returns to overview.
- Bottom navigation remains visible.

- [ ] **Step 7: Final status**

Run:

```bash
git status --short
```

Expected: only intended tracked changes are committed; pre-existing untracked files may remain.
