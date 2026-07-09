# Money Note Phase 2 Budget Savings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a monthly savings target so the app treats spendable budget as monthly budget minus protected savings, while preserving per-category expense caps.

**Architecture:** Extend the local `Budget` model with `savingsTarget`, centralize spendable-budget math in the reports budget helper, then thread that value into Settings and Home. Existing cap autosave must preserve the savings target instead of accidentally resetting it.

**Tech Stack:** React, TypeScript, IndexedDB via `idb`, i18next, Vitest, React Testing Library, Tailwind CSS.

---

## File Structure

- Modify `src/types.ts`: add optional `savingsTarget` to `Budget` for backward-compatible reads of existing IndexedDB rows.
- Modify `src/db/budgets.ts`: persist a `savingsTarget` number and default it to `0` for old callers.
- Modify `src/reports/over-budget.ts`: export `spendableBudget()` and make `status()` compare overall spending against `total - savingsTarget`.
- Modify `src/ui/SettingsScreen.tsx`: add a Savings Target input and spendable summary to the monthly budget section.
- Modify `src/ui/components/CapsEditor.tsx`: keep existing savings target when autosaving category caps.
- Modify `src/ui/components/BudgetBar.tsx`: display spendable budget and protected savings information.
- Modify `src/ui/HomeScreen.tsx`: pass spendable budget data from `status()` into `BudgetBar`.
- Modify `src/i18n/en.json` and `src/i18n/vi.json`: add savings/spendable labels.
- Modify `tests/db/budgets.test.ts`: cover default and persisted savings target.
- Modify `tests/reports/over-budget.test.ts`: cover spendable-budget status thresholds.
- Modify `tests/ui/SettingsScreen.test.tsx`: cover saving savings target and preserving it during cap autosave.
- Modify `tests/ui/HomeScreen.test.tsx`: cover Home remaining budget with protected savings.

## Task 1: Budget Math And Persistence Tests

**Files:**
- Modify: `tests/db/budgets.test.ts`
- Modify: `tests/reports/over-budget.test.ts`

- [ ] **Step 1: Add database tests for savings target**

Append these tests inside `describe('budgets store', ...)` in `tests/db/budgets.test.ts`:

```ts
  it('defaults the savings target to zero for old callers', async () => {
    await upsertBudget('2026-06', 5_000_000);
    const got = await getBudgetForMonth('2026-06');
    expect(got?.savingsTarget).toBe(0);
  });

  it('persists a monthly savings target', async () => {
    await upsertBudget('2026-06', 5_000_000, {}, 1_000_000);
    const got = await getBudgetForMonth('2026-06');
    expect(got?.total).toBe(5_000_000);
    expect(got?.savingsTarget).toBe(1_000_000);
  });
```

- [ ] **Step 2: Add report tests for spendable budget**

Change the import in `tests/reports/over-budget.test.ts` to:

```ts
import { spendableBudget, status } from '../../src/reports/over-budget';
```

Append these tests inside `describe('over-budget status', ...)`:

```ts
  it('calculates spendable budget after protected savings', () => {
    const budget: Budget = {
      id: 'b',
      month: '2026-06',
      total: 10_000_000,
      savingsTarget: 2_000_000,
      caps: {},
    };

    expect(spendableBudget(budget)).toBe(8_000_000);
  });

  it('clamps spendable budget at zero when savings exceed the monthly budget', () => {
    const budget: Budget = {
      id: 'b',
      month: '2026-06',
      total: 1_000_000,
      savingsTarget: 2_000_000,
      caps: {},
    };

    expect(spendableBudget(budget)).toBe(0);
  });

  it('uses spendable budget for the overall budget status', () => {
    const budget: Budget = {
      id: 'b',
      month: '2026-06',
      total: 10_000_000,
      savingsTarget: 2_000_000,
      caps: {},
    };
    const sums = { ...emptySums(), 'food-drinks': 8_500_000 };

    const out = status(budget, sums);

    expect(out.overallLimit).toBe(8_000_000);
    expect(out.overall).toBe('over');
  });
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/db/budgets.test.ts tests/reports/over-budget.test.ts
```

Expected: FAIL because `savingsTarget`, `spendableBudget`, and `overallLimit` do not exist yet.

## Task 2: Budget Model, Persistence, And Math

**Files:**
- Modify: `src/types.ts`
- Modify: `src/db/budgets.ts`
- Modify: `src/reports/over-budget.ts`
- Test: `tests/db/budgets.test.ts`
- Test: `tests/reports/over-budget.test.ts`

- [ ] **Step 1: Add optional `savingsTarget` to `Budget`**

In `src/types.ts`, change `Budget` to:

```ts
export interface Budget {
  id: string;
  month: string;          // 'YYYY-MM'
  total: number;          // integer VND
  savingsTarget?: number; // integer VND protected from spending; optional for old IndexedDB rows
  caps: Partial<Record<ExpenseCategory, number>>;
}
```

- [ ] **Step 2: Persist savings target in `upsertBudget`**

In `src/db/budgets.ts`, change the import to:

```ts
import type { Budget, ExpenseCategory } from '../types';
```

Change the function signature and budget construction to:

```ts
export async function upsertBudget(
  month: string,
  total: number,
  caps: Partial<Record<ExpenseCategory, number>> = {},
  savingsTarget = 0,
): Promise<Budget> {
  const db = await openFinanceDB();
  const existing = await db.getFromIndex('budgets', 'byMonth', month);
  const budget: Budget = {
    id: existing?.id ?? crypto.randomUUID(),
    month,
    total,
    savingsTarget: Math.max(0, Math.round(savingsTarget)),
    caps,
  };
  await db.put('budgets', budget);
  return budget;
}
```

- [ ] **Step 3: Centralize spendable-budget math**

In `src/reports/over-budget.ts`, add this exported helper above `status()`:

```ts
export function spendableBudget(budget: Budget | undefined): number {
  if (!budget || budget.total <= 0) return 0;
  return Math.max(0, budget.total - (budget.savingsTarget ?? 0));
}
```

Change the `status()` return type to include `overallLimit`:

```ts
): {
  overall: BudgetStatus;
  perCategory: Record<Category, BudgetStatus>;
  overallSpent: number;
  overallLimit: number;
} {
```

Replace the `overall` calculation and return with:

```ts
  const overallLimit = spendableBudget(budget);
  const overall: BudgetStatus = budget && overallLimit > 0
    ? statusFor(overallSpent, overallLimit)
    : 'ok';
  return { overall, perCategory, overallSpent, overallLimit };
```

- [ ] **Step 4: Run focused budget tests**

Run:

```bash
pnpm exec vitest run tests/db/budgets.test.ts tests/reports/over-budget.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit budget model and math**

```bash
git add src/types.ts src/db/budgets.ts src/reports/over-budget.ts tests/db/budgets.test.ts tests/reports/over-budget.test.ts
git commit -m "feat: add spendable budget math"
```

## Task 3: Settings Savings Target UI

**Files:**
- Modify: `src/ui/SettingsScreen.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/vi.json`
- Modify: `tests/ui/SettingsScreen.test.tsx`

- [ ] **Step 1: Add translation keys**

In both locale files, under `settings.monthlyBudget`, add:

```json
"savingsTarget": "Savings target",
"spendableBudget": "Spendable budget",
```

Use Vietnamese values:

```json
"savingsTarget": "Mục tiêu tiết kiệm",
"spendableBudget": "Ngân sách có thể chi",
```

- [ ] **Step 2: Add Settings tests for savings target**

Append this test inside `describe('SettingsScreen caps editor', ...)`:

```tsx
  it('saves the monthly savings target with the budget', async () => {
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/monthly budget|ngân sách hàng tháng/i, { selector: 'input' }), '10000000');
    await user.type(screen.getByLabelText(/savings target|mục tiêu tiết kiệm/i, { selector: 'input' }), '2000000');
    await user.click(screen.getByRole('button', { name: /save|lưu/i }));

    await waitFor(async () => {
      const budget = await getBudgetForMonth(currentVietnamMonth());
      expect(budget?.total).toBe(10_000_000);
      expect(budget?.savingsTarget).toBe(2_000_000);
    });
    expect(await screen.findByText(/8[.,]000[.,]000/)).toBeInTheDocument();
  });
```

- [ ] **Step 3: Add Settings state and load logic**

In `src/ui/SettingsScreen.tsx`, add:

```ts
const [savingsRaw, setSavingsRaw] = useState('');
const [savingsTarget, setSavingsTarget] = useState(0);
```

When a budget loads, set:

```ts
setSavingsRaw(b.savingsTarget ? String(b.savingsTarget) : '');
setSavingsTarget(b.savingsTarget ?? 0);
```

Inside `handleSaveBudget()`, parse and save:

```ts
const parsedSavings = savingsRaw.trim() === '' ? 0 : parseVNDInput(savingsRaw);
if (Number.isNaN(parsedSavings) || parsedSavings < 0) return;
await upsertBudget(month, parsed, caps, parsedSavings);
setSavingsTarget(parsedSavings);
```

- [ ] **Step 4: Render the savings target input and spendable summary**

Add a second `DarkField` below the monthly budget input:

```tsx
<DarkField label={t('settings.savingsTarget')}>
  <input
    inputMode="numeric"
    value={savingsRaw}
    onChange={e => setSavingsRaw(e.target.value)}
  />
</DarkField>
```

Below the Save button, render:

```tsx
{total > 0 && (
  <p className="mt-3 text-sm font-semibold text-emerald-300">
    {t('settings.spendableBudget')}: {formatVND(Math.max(0, total - savingsTarget), i18n.language === 'en' ? 'en' : 'vi')}
  </p>
)}
```

Import `formatVND` from `../lib/money`.

- [ ] **Step 5: Run focused Settings tests**

Run:

```bash
pnpm exec vitest run tests/ui/SettingsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Settings savings UI**

```bash
git add src/ui/SettingsScreen.tsx src/i18n/en.json src/i18n/vi.json tests/ui/SettingsScreen.test.tsx
git commit -m "feat: add savings target setting"
```

## Task 4: Preserve Savings During Cap Autosave

**Files:**
- Modify: `src/ui/components/CapsEditor.tsx`
- Modify: `tests/ui/SettingsScreen.test.tsx`

- [ ] **Step 1: Add a regression test**

Append this test inside `describe('SettingsScreen caps editor', ...)`:

```tsx
  it('keeps the monthly savings target when a cap autosave finishes later', async () => {
    await upsertBudget(currentVietnamMonth(), 10_000_000, {}, 2_000_000);
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: /caps|hạng mục/i }));
    fireEvent.change(await screen.findByLabelText(/coffee|cà phê/i), {
      target: { value: '500000' },
    });

    await waitFor(async () => {
      const budget = await getBudgetForMonth(currentVietnamMonth());
      expect(budget?.caps?.['coffee-bubble-tea']).toBe(500_000);
      expect(budget?.savingsTarget).toBe(2_000_000);
    }, { timeout: 1500 });
  });
```

- [ ] **Step 2: Preserve savings in `CapsEditor`**

In `src/ui/components/CapsEditor.tsx`, change the autosave call to:

```ts
await upsertBudget(
  month,
  latestBudget?.total ?? total,
  finalCaps,
  latestBudget?.savingsTarget ?? 0,
);
```

- [ ] **Step 3: Run focused Settings tests**

Run:

```bash
pnpm exec vitest run tests/ui/SettingsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit cap autosave preservation**

```bash
git add src/ui/components/CapsEditor.tsx tests/ui/SettingsScreen.test.tsx
git commit -m "fix: preserve savings target when saving caps"
```

## Task 5: Home Budget Display Uses Spendable Budget

**Files:**
- Modify: `src/ui/components/BudgetBar.tsx`
- Modify: `src/ui/HomeScreen.tsx`
- Modify: `tests/ui/HomeScreen.test.tsx`

- [ ] **Step 1: Add Home regression test**

Append this test inside `describe('HomeScreen', ...)`:

```tsx
  it('shows remaining budget after protected savings', async () => {
    await upsertBudget(currentVietnamMonth(), 5_000_000, {}, 1_000_000);
    cloudHooks.monthState.data = [
      tx({ id: 'month-1', amount: 2_000_000, category: 'food-drinks' }),
    ];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    expect(screen.getByText(/2[.,]000[.,]000.*4[.,]000[.,]000/)).toBeInTheDocument();
    expect(screen.getByText(/protected|tiết kiệm/i)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]000[.,]000/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Extend `BudgetBar` props and copy**

In `src/ui/components/BudgetBar.tsx`, change props to:

```ts
export function BudgetBar({ spent, total, savingsTarget = 0, locale, status = 'ok' }: {
  spent: number;
  total: number;
  savingsTarget?: number;
  locale: 'vi' | 'en';
  status?: BudgetStatus;
}) {
```

Keep the existing ratio math using `total`. Below the first text row, render protected savings when it is greater than zero:

```tsx
{savingsTarget > 0 && (
  <div className="mt-1 text-xs font-semibold text-emerald-300">
    {t('home.protectedSavings')}: {formatVND(savingsTarget, locale)}
  </div>
)}
```

- [ ] **Step 3: Add Home translation key**

In both locale files, under `home.budgetUsed`, add:

```json
"protectedSavings": "Protected savings",
```

Use Vietnamese value:

```json
"protectedSavings": "Tiết kiệm giữ lại",
```

- [ ] **Step 4: Pass spendable limit from Home**

In `src/ui/HomeScreen.tsx`, replace:

```tsx
<BudgetBar spent={monthSpent} total={budget.total} locale={locale} status={bStatus.overall} />
```

with:

```tsx
<BudgetBar
  spent={monthSpent}
  total={bStatus.overallLimit}
  savingsTarget={budget.savingsTarget ?? 0}
  locale={locale}
  status={bStatus.overall}
/>
```

- [ ] **Step 5: Run focused Home tests**

Run:

```bash
pnpm exec vitest run tests/ui/HomeScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Home budget display**

```bash
git add src/ui/components/BudgetBar.tsx src/ui/HomeScreen.tsx src/i18n/en.json src/i18n/vi.json tests/ui/HomeScreen.test.tsx
git commit -m "feat: show spendable budget on home"
```

## Task 6: Phase Verification

**Files:** no source changes expected.

- [ ] **Step 1: Run focused budget-related tests**

Run:

```bash
pnpm exec vitest run tests/db/budgets.test.ts tests/reports/over-budget.test.ts tests/ui/SettingsScreen.test.tsx tests/ui/HomeScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript, lint, and build**

Run:

```bash
pnpm exec tsc -b
pnpm run lint
pnpm run build
```

Expected: all commands exit 0. Existing lint warnings unrelated to this phase may remain, but no new errors should be introduced.

- [ ] **Step 4: Commit this plan document if not already committed**

```bash
git add docs/superpowers/plans/2026-07-09-money-note-phase-2-budget-savings.md
git commit -m "docs: add money note phase 2 plan"
```

## Self-Review

- Spec coverage: This plan covers monthly savings target, spendable budget math, Settings editing, Home display, and cap autosave preservation.
- Placeholder scan: No placeholders or TBD steps remain.
- Type consistency: `Budget.savingsTarget`, `spendableBudget()`, and `overallLimit` are used consistently across model, reports, Settings, and Home.
