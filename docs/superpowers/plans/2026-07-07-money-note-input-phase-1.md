# Money Note Input Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Money Note-inspired manual input flow with real expense/income transactions while preserving bank-email automation and image/OCR expense entry.

**Architecture:** Introduce `direction: 'expense' | 'income'` as a first-class transaction field, keep amounts positive, and filter behavior by direction at the data/report/UI boundaries. Supabase stores direction and direction-compatible categories; email and OCR paths remain expense-only, while manual input can create income rows.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, Supabase Postgres migrations, Supabase Edge Functions, Tailwind CSS.

---

## File Structure

- Modify `src/types.ts`
  - Owns `TransactionDirection`, expense/income category unions, category arrays, category direction helpers, and `Transaction.direction`.
- Modify `src/lib/date.ts`
  - Adds helpers for date input values and Vietnam-local date persistence.
- Modify `supabase/migrations/20260707010000_add_transaction_direction_and_income_categories.sql`
  - Adds `direction`, a direction check, and a direction-compatible category check.
- Modify `supabase/functions/_shared/ingest.ts`
  - Adds `direction: 'expense'` to normalized bank-email rows.
- Modify `src/supabase/mapper.ts`
  - Reads `direction` from cloud rows and defaults old rows to `expense`.
- Modify `src/supabase/transactions.ts`
  - Selects and inserts `direction` for user-entered rows.
- Modify `src/reports/*.ts`
  - Keeps budget/category spending expense-only and adds income/expense/net totals.
- Modify `src/hooks/useReports.ts`
  - Exposes direction totals to Reports.
- Modify `src/ui/AddScreen.tsx`
  - Replaces the current manual add UI with a basic Money Note-inspired expense/income input.
- Modify `src/ui/components/CategoryChips.tsx`
  - Accepts a direction-specific category list.
- Modify `src/ui/components/CapsEditor.tsx`
  - Uses only expense categories for budget caps.
- Modify `src/ui/components/TransactionRow.tsx`
  - Displays signed income/expense amounts and direction-specific category edit options.
- Modify `src/ui/HomeScreen.tsx`
  - Shows expense today and basic income today, keeps category editing direction-aware.
- Modify `src/ui/ReportsScreen.tsx`
  - Shows expense, income, and net totals; category/budget sections remain expense-focused.
- Modify `src/ui/ConfirmScreen.tsx`
  - Sends OCR/image transactions as `direction: 'expense'`.
- Modify `src/i18n/en.json` and `src/i18n/vi.json`
  - Adds direction labels, income category labels, and new input/report text.
- Modify tests under `tests/`
  - Add/update focused unit and UI coverage for direction, income categories, reports, and input.
- Modify `docs/supabase-shortcuts.md`
  - Notes the new migration and Edge Function redeploy requirement.

---

### Task 1: Direction Types, Category Sets, and Date Helpers

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/date.ts`
- Test: `tests/lib/date.test.ts`

- [ ] **Step 1: Write failing date helper tests**

Add these tests to `tests/lib/date.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  dateInputValueForVietnam,
  vietnamDateInputToNoonISO,
} from '../../src/lib/date';

describe('Vietnam date input helpers', () => {
  it('formats an instant as a Vietnam date input value', () => {
    expect(dateInputValueForVietnam(new Date('2026-07-06T18:00:00.000Z'))).toBe('2026-07-07');
  });

  it('stores a date input as Vietnam local noon', () => {
    expect(vietnamDateInputToNoonISO('2026-07-07')).toBe('2026-07-07T05:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/lib/date.test.ts
```

Expected: FAIL because `dateInputValueForVietnam` and `vietnamDateInputToNoonISO` are not exported.

- [ ] **Step 3: Add direction/category types**

Update `src/types.ts`:

```ts
export type ExpenseCategory =
  | 'food-drinks'
  | 'coffee-bubble-tea'
  | 'transportation'
  | 'shopping'
  | 'bills-utilities'
  | 'healthcare'
  | 'entertainment'
  | 'transfers-debt'
  | 'others';

export type IncomeCategory =
  | 'salary'
  | 'allowance'
  | 'bonus'
  | 'side-income'
  | 'investment'
  | 'temporary-income';

export type Category = ExpenseCategory | IncomeCategory;

export type TransactionDirection = 'expense' | 'income';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'food-drinks',
  'coffee-bubble-tea',
  'transportation',
  'shopping',
  'bills-utilities',
  'healthcare',
  'entertainment',
  'transfers-debt',
  'others',
];

export const INCOME_CATEGORIES: readonly IncomeCategory[] = [
  'salary',
  'allowance',
  'bonus',
  'side-income',
  'investment',
  'temporary-income',
];

export const CATEGORIES: readonly Category[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
];

export function categoriesForDirection(direction: TransactionDirection): readonly Category[] {
  return direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function categoryBelongsToDirection(
  category: Category,
  direction: TransactionDirection,
): boolean {
  return categoriesForDirection(direction).includes(category);
}
```

Add `direction` to `Transaction`:

```ts
export interface Transaction {
  id: string;
  amount: number;
  currency: 'VND';
  occurredAt: string;
  merchant?: string;
  category: Category;
  direction: TransactionDirection;
  note?: string;
  source: TransactionSource;
  bankHint?: BankHint;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Add date helper implementation**

Add to `src/lib/date.ts`:

```ts
export function dateInputValueForVietnam(now = new Date()): string {
  return vietnamDateString(now);
}

export function vietnamDateInputToNoonISO(dateInput: string): string {
  const [year, month, day] = dateInput.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day, 12, 0, 0, 0) - VIETNAM_UTC_OFFSET_MS;
  return new Date(utc).toISOString();
}
```

- [ ] **Step 5: Run tests and TypeScript**

Run:

```bash
pnpm exec vitest run tests/lib/date.test.ts
pnpm exec tsc -b --pretty false
```

Expected:

- Date tests pass.
- TypeScript may fail because existing transaction fixtures now need `direction`. Add `direction: 'expense'` to `Transaction` fixtures in test helper functions first. For direct `addTransaction` inputs, add `direction: 'expense'`.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/date.ts tests/lib/date.test.ts tests
git commit -m "feat: add transaction direction types"
```

---

### Task 2: Supabase Direction Schema and Cloud Mapping

**Files:**
- Create: `supabase/migrations/20260707010000_add_transaction_direction_and_income_categories.sql`
- Modify: `src/supabase/mapper.ts`
- Modify: `tests/supabase/mapper.test.ts`

- [ ] **Step 1: Write failing mapper tests**

Add tests to `tests/supabase/mapper.test.ts`:

```ts
it('defaults old cloud rows without direction to expense', () => {
  const legacy = row({ direction: undefined });

  expect(mapTransactionRow(legacy).direction).toBe('expense');
});

it('maps income cloud rows with their stored category', () => {
  const tx = mapTransactionRow(row({
    raw_source: 'manual',
    type: 'manual',
    direction: 'income',
    category: 'salary',
    content: 'Monthly salary',
    merchant: null,
    note: 'Monthly salary',
  }));

  expect(tx).toMatchObject({
    direction: 'income',
    category: 'salary',
    note: 'Monthly salary',
    source: 'manual',
  });
});
```

Update the `row` helper type in the test only after the failing run if TypeScript requires it.

- [ ] **Step 2: Run mapper test to verify failure**

Run:

```bash
pnpm exec vitest run tests/supabase/mapper.test.ts
```

Expected: FAIL because `CloudTransactionRow` has no `direction` and mapped transactions do not expose direction.

- [ ] **Step 3: Add migration**

Create `supabase/migrations/20260707010000_add_transaction_direction_and_income_categories.sql`:

```sql
alter table public.transactions
  add column if not exists direction text not null default 'expense';

alter table public.transactions
  drop constraint if exists transactions_direction_check;

alter table public.transactions
  add constraint transactions_direction_check
  check (direction in ('expense', 'income'));

alter table public.transactions
  drop constraint if exists transactions_category_check;

alter table public.transactions
  add constraint transactions_category_check
  check (
    category is null or (
      direction = 'expense' and category in (
        'food-drinks',
        'coffee-bubble-tea',
        'transportation',
        'shopping',
        'bills-utilities',
        'healthcare',
        'entertainment',
        'transfers-debt',
        'others'
      )
    ) or (
      direction = 'income' and category in (
        'salary',
        'allowance',
        'bonus',
        'side-income',
        'investment',
        'temporary-income'
      )
    )
  );
```

- [ ] **Step 4: Update mapper**

In `src/supabase/mapper.ts`:

```ts
import type {
  BankHint,
  Category,
  Transaction,
  TransactionDirection,
  TransactionSource,
} from '../types';
```

Add `direction` to `CloudTransactionRow`:

```ts
  direction?: TransactionDirection | null;
```

Add helper:

```ts
function direction(row: CloudTransactionRow): TransactionDirection {
  return row.direction ?? 'expense';
}
```

Add `direction: direction(row)` to both returned transaction objects in `mapTransactionRow`.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm exec vitest run tests/supabase/mapper.test.ts
pnpm exec tsc -b --pretty false
```

Expected: mapper tests pass. TypeScript may expose more fixtures that need `direction: 'expense'`; update only test fixtures and row builders, not production behavior.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260707010000_add_transaction_direction_and_income_categories.sql src/supabase/mapper.ts tests/supabase/mapper.test.ts tests
git commit -m "feat: map transaction direction from Supabase"
```

---

### Task 3: Direction in Supabase Insert and Edge Ingest

**Files:**
- Modify: `src/supabase/transactions.ts`
- Modify: `tests/supabase/transactions.test.ts`
- Modify: `supabase/functions/_shared/ingest.ts`
- Modify: `tests/ingest/ingest.test.ts`
- Modify: `tests/ingest/ingest-handler.test.ts`

- [ ] **Step 1: Write failing Supabase insert tests**

In `tests/supabase/transactions.test.ts`, add to the manual insert test input:

```ts
      direction: 'expense',
```

Add a new test:

```ts
  it('inserts income cloud transactions with income direction', async () => {
    const context = createClientContext({
      data: [row({
        id: 'income-1',
        bank: null,
        type: 'manual',
        amount: 15_000_000,
        content: 'Salary',
        raw_source: 'manual',
        merchant: null,
        category: 'salary',
        note: 'Salary',
        direction: 'income',
      })],
      error: null,
    });

    const tx = await addCloudTransaction(context.client, {
      amount: 15_000_000,
      currency: 'VND',
      occurredAt: '2026-07-07T05:00:00.000Z',
      category: 'salary',
      note: 'Salary',
      source: 'manual',
      direction: 'income',
    });

    expect(context.insertedRow).toMatchObject({
      type: 'manual',
      amount: 15_000_000,
      category: 'salary',
      direction: 'income',
      raw_source: 'manual',
    });
    expect(tx.direction).toBe('income');
  });
```

- [ ] **Step 2: Write failing Edge ingest tests**

In `tests/ingest/ingest.test.ts`, extend a successful normalized payload expectation:

```ts
    expect(result.value.direction).toBe('expense');
```

In `tests/ingest/ingest-handler.test.ts`, extend inserted row expectation:

```ts
        direction: 'expense',
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm exec vitest run tests/supabase/transactions.test.ts tests/ingest/ingest.test.ts tests/ingest/ingest-handler.test.ts
```

Expected: FAIL because direction is not selected, inserted, or normalized.

- [ ] **Step 4: Update Supabase transaction helper**

In `src/supabase/transactions.ts`:

```ts
import type {
  BankHint,
  Category,
  Transaction,
  TransactionDirection,
  TransactionSource,
} from '../types';
```

Update columns:

```ts
const TRANSACTION_COLUMNS = 'id,bank,type,amount,currency,transaction_time,content,raw_source,merchant,category,direction,note,bank_hint,created_at';
```

Update `UserTransactionInput`:

```ts
  direction: TransactionDirection;
```

Update `CloudTransactionInsert`:

```ts
  direction: TransactionDirection;
```

In `toInsertRow`, add:

```ts
    direction: input.direction,
```

- [ ] **Step 5: Update Edge ingest**

In `supabase/functions/_shared/ingest.ts`, add to `NormalizedIngestPayload`:

```ts
  direction: 'expense';
```

Add to returned value:

```ts
      direction: 'expense',
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm exec vitest run tests/supabase/transactions.test.ts tests/supabase/mapper.test.ts tests/ingest/ingest.test.ts tests/ingest/ingest-handler.test.ts
pnpm exec tsc -b --pretty false
```

Expected: all listed tests pass. TypeScript will identify `saveUserTransaction` call sites missing direction; leave UI call-site updates for Task 6 and Task 7, but update test fixtures needed by this task.

- [ ] **Step 7: Commit**

```bash
git add src/supabase/transactions.ts tests/supabase/transactions.test.ts supabase/functions/_shared/ingest.ts tests/ingest/ingest.test.ts tests/ingest/ingest-handler.test.ts tests
git commit -m "feat: persist transaction direction"
```

---

### Task 4: Expense-Only Budget Reports and Direction Totals

**Files:**
- Create: `src/reports/totals.ts`
- Modify: `src/reports/index.ts`
- Modify: `src/reports/by-category.ts`
- Modify: `src/reports/by-day.ts`
- Modify: `src/reports/over-budget.ts`
- Modify: `src/reports/deltas.ts`
- Modify: `tests/reports/by-category.test.ts`
- Modify: `tests/reports/by-day.test.ts`
- Modify: `tests/reports/over-budget.test.ts`
- Modify: `tests/reports/deltas.test.ts`
- Create: `tests/reports/totals.test.ts`

- [ ] **Step 1: Write failing report tests**

Create `tests/reports/totals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { totalsByDirection } from '../../src/reports/totals';
import type { Transaction } from '../../src/types';

function tx(amount: number, direction: 'expense' | 'income'): Transaction {
  return {
    id: crypto.randomUUID(),
    amount,
    currency: 'VND',
    occurredAt: '2026-07-07T05:00:00.000Z',
    category: direction === 'income' ? 'salary' : 'food-drinks',
    direction,
    source: 'manual',
    createdAt: '2026-07-07T05:00:00.000Z',
    updatedAt: '2026-07-07T05:00:00.000Z',
  };
}

describe('totalsByDirection', () => {
  it('separates expense, income, and net', () => {
    expect(totalsByDirection([
      tx(10_000, 'expense'),
      tx(50_000, 'income'),
      tx(5_000, 'expense'),
    ])).toEqual({ expense: 15_000, income: 50_000, net: 35_000 });
  });
});
```

Add to `tests/reports/by-category.test.ts`:

```ts
  it('ignores income rows for expense category spending', () => {
    const out = sumByCategory([
      tx(10_000, 'food-drinks'),
      { ...tx(50_000, 'salary'), direction: 'income' as const },
    ]);

    expect(out['food-drinks']).toBe(10_000);
    expect(out.salary).toBe(0);
  });
```

Add to `tests/reports/by-day.test.ts`:

```ts
  it('ignores income rows in expense daily totals', () => {
    const out = dailyTotals([
      tx(10_000, '2026-07-07T05:00:00.000Z'),
      { ...tx(50_000, '2026-07-07T06:00:00.000Z'), direction: 'income' as const, category: 'salary' as const },
    ], '2026-07');

    expect(out[6].total).toBe(10_000);
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm exec vitest run tests/reports/totals.test.ts tests/reports/by-category.test.ts tests/reports/by-day.test.ts tests/reports/over-budget.test.ts tests/reports/deltas.test.ts
```

Expected: FAIL because `totalsByDirection` does not exist and income rows are counted by existing report helpers.

- [ ] **Step 3: Implement totals and expense filters**

Create `src/reports/totals.ts`:

```ts
import type { Transaction } from '../types';

export interface DirectionTotals {
  expense: number;
  income: number;
  net: number;
}

export function totalsByDirection(transactions: Transaction[]): DirectionTotals {
  let expense = 0;
  let income = 0;
  for (const tx of transactions) {
    if (tx.direction === 'income') income += tx.amount;
    else expense += tx.amount;
  }
  return { expense, income, net: income - expense };
}
```

Update `src/reports/index.ts`:

```ts
export { totalsByDirection } from './totals';
export type { DirectionTotals } from './totals';
```

In `src/reports/by-category.ts`, initialize all categories but only add expense rows:

```ts
for (const t of tx) {
  if (t.direction === 'income') continue;
  out[t.category] += t.amount;
}
```

In `src/reports/by-day.ts`, skip income rows:

```ts
for (const t of tx) {
  if (t.direction === 'income') continue;
  const date = todayVietnamDate(new Date(t.occurredAt));
```

In `src/reports/over-budget.ts`, iterate over `EXPENSE_CATEGORIES` instead of `CATEGORIES`.

In `src/reports/deltas.ts`, iterate over `EXPENSE_CATEGORIES` for anomaly/budget-facing deltas.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm exec vitest run tests/reports/totals.test.ts tests/reports/by-category.test.ts tests/reports/by-day.test.ts tests/reports/over-budget.test.ts tests/reports/deltas.test.ts
pnpm exec tsc -b --pretty false
```

Expected: report tests pass. If `BudgetStatus` record types require all categories, keep returned records typed as `Record<Category, ...>` and initialize income categories to zero/`ok`, but only expense categories should contribute to spending.

- [ ] **Step 5: Commit**

```bash
git add src/reports tests/reports
git commit -m "feat: separate income and expense totals"
```

---

### Task 5: Direction-Aware Hooks, Home, Reports, and Budget Controls

**Files:**
- Modify: `src/hooks/useReports.ts`
- Modify: `src/ui/HomeScreen.tsx`
- Modify: `src/ui/ReportsScreen.tsx`
- Modify: `src/ui/components/CapsEditor.tsx`
- Modify: `src/ui/components/TransactionRow.tsx`
- Modify: `tests/hooks/useReports.test.tsx`
- Modify: `tests/ui/HomeScreen.test.tsx`
- Modify: `tests/ui/ReportsScreen.test.tsx`
- Modify: `tests/ui/SettingsScreen.test.tsx`
- Modify: `tests/ui/TransactionRow.test.tsx`

- [ ] **Step 1: Write failing UI/hook tests**

In `tests/hooks/useReports.test.tsx`, add:

```tsx
it('returns separate direction totals for the current month', async () => {
  mocks.listCloudTransactionsForRange.mockResolvedValueOnce([
    tx({ amount: 100_000, direction: 'expense', category: 'food-drinks' }),
    tx({ amount: 300_000, direction: 'income', category: 'salary' }),
  ]).mockResolvedValueOnce([]);

  const { result } = renderHook(() => useReports('2026-07'));

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.directionTotals).toEqual({
    expense: 100_000,
    income: 300_000,
    net: 200_000,
  });
});
```

In `tests/ui/HomeScreen.test.tsx`, add a test that month transactions include one expense today and one income today:

```tsx
it('shows today income separately from today expense', async () => {
  recentMock.mockResolvedValue([]);
  monthMock.mockResolvedValue([
    tx({ amount: 10_000, direction: 'expense', category: 'food-drinks', occurredAt: '2026-07-07T05:00:00.000Z' }),
    tx({ amount: 50_000, direction: 'income', category: 'salary', occurredAt: '2026-07-07T06:00:00.000Z' }),
  ]);

  renderHome();

  expect(await screen.findByText(/Chi hôm nay|Today spend/)).toBeInTheDocument();
  expect(await screen.findByText(/Thu hôm nay|Today income/)).toBeInTheDocument();
});
```

In `tests/ui/TransactionRow.test.tsx`, add:

```tsx
it('shows income amounts with a plus sign', () => {
  render(<TransactionRow t={tx({ direction: 'income', amount: 50000, category: 'salary' })} locale="vi" />);

  expect(screen.getByText(/\+50\.000|50,000/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm exec vitest run tests/hooks/useReports.test.tsx tests/ui/HomeScreen.test.tsx tests/ui/ReportsScreen.test.tsx tests/ui/SettingsScreen.test.tsx tests/ui/TransactionRow.test.tsx
```

Expected: FAIL because hooks and UI do not expose or render direction totals.

- [ ] **Step 3: Update `useReports`**

In `src/hooks/useReports.ts`, import `totalsByDirection` and extend `UseReportsResult`:

```ts
import {
  sumByCategory, dailyTotals, monthOverMonth, hints, status, totalsByDirection,
  type BudgetStatus,
  type DirectionTotals,
} from '../reports';

  directionTotals: DirectionTotals;
```

Add memo:

```ts
  const directionTotals = useMemo(() => totalsByDirection(curr), [curr]);
```

Return it:

```ts
  return { loading, error, sums, daily, deltas, anomalyHints, bStatus, directionTotals, reload };
```

- [ ] **Step 4: Update Home**

In `src/ui/HomeScreen.tsx`, compute income:

```ts
  const todayIncome = useMemo(
    () => monthTx
      .filter(tx => tx.direction === 'income' && isSameVietnamDay(tx.occurredAt, today))
      .reduce((sum, tx) => sum + tx.amount, 0),
    [monthTx, today],
  );
```

Update today expense filter:

```ts
      .filter(tx => tx.direction !== 'income' && isSameVietnamDay(tx.occurredAt, today))
```

Render a compact second summary under or next to today's spend:

```tsx
        <div className="mt-2 text-sm text-gray-500">{t('home.todayIncome')}</div>
        <div className="text-xl font-semibold text-emerald-600">
          {monthLoading ? t('cloud.loading') : monthError ? '-' : formatVND(todayIncome, locale)}
        </div>
```

Update category edit row category list in `TransactionRow` through Task 6 behavior if needed.

- [ ] **Step 5: Update Reports and budget controls**

In `src/ui/ReportsScreen.tsx`, read `directionTotals`:

```ts
const { loading, error, reload, sums, daily, anomalyHints, bStatus, directionTotals } = useReports(month);
```

Render a simple summary before charts:

```tsx
          <section className="grid grid-cols-3 gap-2 px-4 text-sm">
            <div>
              <div className="text-gray-500">{t('reports.expenseTotal')}</div>
              <div className="font-semibold text-red-600">{formatVND(directionTotals.expense, locale)}</div>
            </div>
            <div>
              <div className="text-gray-500">{t('reports.incomeTotal')}</div>
              <div className="font-semibold text-emerald-600">{formatVND(directionTotals.income, locale)}</div>
            </div>
            <div>
              <div className="text-gray-500">{t('reports.netTotal')}</div>
              <div className="font-semibold">{formatVND(directionTotals.net, locale)}</div>
            </div>
          </section>
```

In `src/ui/components/CapsEditor.tsx`, import and use `EXPENSE_CATEGORIES` for state initialization, commit, and rendering:

```ts
import { EXPENSE_CATEGORIES, type Category } from '../../types';
```

Replace `CATEGORIES` loops with `EXPENSE_CATEGORIES`.

In `ReportsScreen`, iterate category list sections over `EXPENSE_CATEGORIES` so income categories do not appear in budget/spending breakdown.

- [ ] **Step 6: Update i18n**

In `src/i18n/vi.json`:

```json
"todayIncome": "Thu hôm nay"
```

under `reports`:

```json
"expenseTotal": "Chi tiêu",
"incomeTotal": "Thu nhập",
"netTotal": "Thu chi"
```

In `src/i18n/en.json`:

```json
"todayIncome": "Today income"
```

under `reports`:

```json
"expenseTotal": "Expense",
"incomeTotal": "Income",
"netTotal": "Net"
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm exec vitest run tests/hooks/useReports.test.tsx tests/ui/HomeScreen.test.tsx tests/ui/ReportsScreen.test.tsx tests/ui/SettingsScreen.test.tsx tests/ui/TransactionRow.test.tsx
pnpm exec tsc -b --pretty false
```

Expected: listed tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useReports.ts src/ui/HomeScreen.tsx src/ui/ReportsScreen.tsx src/ui/components/CapsEditor.tsx src/ui/components/TransactionRow.tsx src/i18n/en.json src/i18n/vi.json tests/hooks/useReports.test.tsx tests/ui/HomeScreen.test.tsx tests/ui/ReportsScreen.test.tsx tests/ui/SettingsScreen.test.tsx tests/ui/TransactionRow.test.tsx
git commit -m "feat: show income and expense totals"
```

---

### Task 6: Direction-Specific Categories and Add Screen Input Flow

**Files:**
- Modify: `src/ui/components/CategoryChips.tsx`
- Modify: `src/ui/AddScreen.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/vi.json`
- Modify: `tests/ui/AddScreen.test.tsx`

- [ ] **Step 1: Write failing Add screen tests**

In `tests/ui/AddScreen.test.tsx`, add:

```tsx
it('saves a manual income transaction with an income category', async () => {
  const user = userEvent.setup();

  render(<MemoryRouter><AddScreen /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /tiền thu|income/i }));
  await user.click(screen.getByRole('button', { name: '5' }));
  await user.click(screen.getByRole('button', { name: '000' }));
  await user.click(screen.getByRole('button', { name: /tiền lương|salary/i }));
  await user.click(screen.getByRole('button', { name: /nhập khoản thu|add income/i }));

  expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
    amount: 5000,
    direction: 'income',
    category: 'salary',
    source: 'manual',
  }));
});

it('filters category options when switching direction', async () => {
  const user = userEvent.setup();

  render(<MemoryRouter><AddScreen /></MemoryRouter>);

  expect(screen.getByRole('button', { name: /ăn uống|food/i })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /tiền thu|income/i }));

  expect(screen.queryByRole('button', { name: /ăn uống|food/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /tiền lương|salary/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm exec vitest run tests/ui/AddScreen.test.tsx
```

Expected: FAIL because AddScreen has no direction segment and no income categories.

- [ ] **Step 3: Update CategoryChips**

Change `src/ui/components/CategoryChips.tsx` props:

```tsx
export function CategoryChips({
  value,
  onSelect,
  categories = CATEGORIES,
}: {
  value: Category | null;
  onSelect: (c: Category) => void;
  categories?: readonly Category[];
}) {
```

Map `categories` instead of `CATEGORIES`.

- [ ] **Step 4: Update AddScreen state and save**

In `src/ui/AddScreen.tsx`, import:

```ts
import {
  categoriesForDirection,
  categoryBelongsToDirection,
  type Category,
  type TransactionDirection,
} from '../types';
import { dateInputValueForVietnam, vietnamDateInputToNoonISO } from '../lib/date';
```

Add state:

```ts
  const [direction, setDirection] = useState<TransactionDirection>('expense');
  const [date, setDate] = useState(() => dateInputValueForVietnam());
```

Add handler:

```ts
  function handleDirection(next: TransactionDirection) {
    setDirection(next);
    setUserPickedChip(false);
    setChosen(prev => prev && categoryBelongsToDirection(prev, next) ? prev : null);
  }
```

Limit suggestions to expense:

```ts
  useEffect(() => {
    if (direction === 'income') {
      if (!chosen || !categoryBelongsToDirection(chosen, 'income')) setChosen(null);
      return;
    }
    if (!userPickedChip) setChosen(suggestion);
  }, [direction, suggestion, userPickedChip, chosen]);
```

Update save input:

```ts
      await saveUserTransaction({
        amount,
        currency: 'VND',
        occurredAt: vietnamDateInputToNoonISO(date),
        merchant: direction === 'expense' ? merchant.trim() || undefined : undefined,
        note: direction === 'income' ? merchant.trim() || undefined : undefined,
        category: chosen,
        source: 'manual',
        direction,
      });
```

Only learn rules for expenses:

```ts
      const learned = direction === 'expense' ? shouldLearn(suggestion, chosen, merchant) : null;
```

Render:

```tsx
      <div className="mx-4 mt-4 grid grid-cols-2 rounded bg-gray-900 p-1 text-sm">
        <button
          type="button"
          onClick={() => handleDirection('expense')}
          className={`rounded py-2 ${direction === 'expense' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
        >
          {t('add.expense')}
        </button>
        <button
          type="button"
          onClick={() => handleDirection('income')}
          className={`rounded py-2 ${direction === 'income' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
        >
          {t('add.income')}
        </button>
      </div>
```

Add a date input:

```tsx
      <label className="px-4 mt-2 block text-sm text-gray-600">
        {t('confirm.date')}
        <input
          type="date"
          value={date}
          onChange={event => setDate(event.target.value)}
          className="mt-1 w-full p-2 border rounded"
        />
      </label>
```

Pass category list:

```tsx
      <CategoryChips
        value={chosen}
        onSelect={handleChip}
        categories={categoriesForDirection(direction)}
      />
```

Update button label:

```tsx
      >{saving ? t('add.saving') : direction === 'income' ? t('add.submitIncome') : t('add.submitExpense')}</button>
```

- [ ] **Step 5: Update i18n**

In `src/i18n/vi.json` under `add`:

```json
"expense": "Tiền chi",
"income": "Tiền thu",
"submitExpense": "Nhập khoản chi",
"submitIncome": "Nhập khoản thu"
```

In `src/i18n/en.json`:

```json
"expense": "Expense",
"income": "Income",
"submitExpense": "Add expense",
"submitIncome": "Add income"
```

Add income category labels in both locales.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm exec vitest run tests/ui/AddScreen.test.tsx tests/ui/TransactionRow.test.tsx
pnpm exec tsc -b --pretty false
```

Expected: Add screen tests pass and TypeScript confirms all manual save calls include `direction`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/CategoryChips.tsx src/ui/AddScreen.tsx src/i18n/en.json src/i18n/vi.json tests/ui/AddScreen.test.tsx
git commit -m "feat: add income manual entry flow"
```

---

### Task 7: Preserve OCR/Image Expense Entry and Local Fallbacks

**Files:**
- Modify: `src/ui/ConfirmScreen.tsx`
- Modify: `src/db/transactions.ts`
- Modify: `tests/ui/ConfirmScreen.test.tsx`
- Modify: `tests/db/transactions.test.ts`
- Modify: `tests/transactions/save.test.ts`
- Modify: `tests/backup/export.test.ts`
- Modify: `tests/backup/import.test.ts`

- [ ] **Step 1: Write failing OCR direction test**

In `tests/ui/ConfirmScreen.test.tsx`, extend the existing save expectation:

```tsx
      expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
        source: 'bank-screenshot',
        direction: 'expense',
      }));
```

In `tests/transactions/save.test.ts`, add `direction: 'expense'` to `input` and `saved`.

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
pnpm exec vitest run tests/ui/ConfirmScreen.test.tsx tests/transactions/save.test.ts tests/db/transactions.test.ts
```

Expected: FAIL where direction is missing from OCR/local fallback inputs.

- [ ] **Step 3: Update ConfirmScreen**

In `src/ui/ConfirmScreen.tsx`, add direction to save input:

```ts
        direction: 'expense',
```

- [ ] **Step 4: Update local DB fallback defaults**

In `src/db/transactions.ts`, keep input requiring direction via TypeScript. For compatibility with older backup imports that may not have direction, normalize in `addTransaction`:

```ts
  const t: Transaction = {
    ...input,
    direction: input.direction ?? 'expense',
    id: newId(),
    createdAt: now(),
    updatedAt: now(),
  };
```

If TypeScript rejects `input.direction ??` because direction is required, change the input type:

```ts
  input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & { direction?: Transaction['direction'] },
```

Update test fixture literals in db/backup tests with `direction: 'expense'`.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm exec vitest run tests/ui/ConfirmScreen.test.tsx tests/transactions/save.test.ts tests/db/transactions.test.ts tests/backup/export.test.ts tests/backup/import.test.ts
pnpm exec tsc -b --pretty false
```

Expected: listed tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ConfirmScreen.tsx src/db/transactions.ts tests/ui/ConfirmScreen.test.tsx tests/transactions/save.test.ts tests/db/transactions.test.ts tests/backup/export.test.ts tests/backup/import.test.ts
git commit -m "fix: keep image transactions as expenses"
```

---

### Task 8: Rollout Docs and Final Verification

**Files:**
- Modify: `docs/supabase-shortcuts.md`

- [ ] **Step 1: Update rollout docs**

In `docs/supabase-shortcuts.md`, update the migration/deploy note to include direction:

```md
The latest migrations add manual income support through `transactions.direction` and expand category constraints. After pulling updates, run `npx supabase db push`. Redeploy `ingest-transaction` with `--no-verify-jwt` so bank-email rows include `direction: "expense"`.
```

- [ ] **Step 2: Run focused feature tests**

Run:

```bash
pnpm exec vitest run tests/lib/date.test.ts tests/supabase/mapper.test.ts tests/supabase/transactions.test.ts tests/ingest/ingest.test.ts tests/ingest/ingest-handler.test.ts tests/reports/totals.test.ts tests/reports/by-category.test.ts tests/reports/by-day.test.ts tests/reports/over-budget.test.ts tests/hooks/useReports.test.tsx tests/ui/AddScreen.test.tsx tests/ui/ConfirmScreen.test.tsx tests/ui/HomeScreen.test.tsx tests/ui/ReportsScreen.test.tsx tests/ui/SettingsScreen.test.tsx tests/ui/TransactionRow.test.tsx
```

Expected: all listed tests pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm exec tsc -b
pnpm test
pnpm run build
```

Expected:

- TypeScript exits 0.
- Vitest exits 0.
- Build exits 0. Existing Vite chunk-size warning is acceptable if it remains the only warning.

- [ ] **Step 4: Check git state**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` exits 0.
- `git status --short` shows only intended docs changes plus known pre-existing untracked paths.

- [ ] **Step 5: Commit docs**

```bash
git add docs/supabase-shortcuts.md
git commit -m "docs: note income direction rollout"
```

---

## Self-Review

Spec coverage:

- Direction model and positive amounts: Task 1.
- Supabase migration and row mapping: Task 2.
- Email automation remains expense-only: Task 3.
- Manual expense/income entry: Task 6.
- Image/OCR remains expense-only: Task 7.
- Home/Reports distinguish expense, income, net: Task 4 and Task 5.
- Budget uses only expenses: Task 4 and Task 5.
- Rollout commands: Task 8.

Placeholder scan:

- No placeholder markers or vague future-work instructions remain.

Type consistency:

- `TransactionDirection` is introduced before it is used by mapper, Supabase helpers, reports, or UI.
- `EXPENSE_CATEGORIES`, `INCOME_CATEGORIES`, and `CATEGORIES` are introduced before direction-specific UI and reports use them.
- `UserTransactionInput.direction` is introduced before AddScreen and ConfirmScreen are updated to send it.
