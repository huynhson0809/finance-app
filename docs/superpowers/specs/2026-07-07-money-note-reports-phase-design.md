# Finance PWA — Money Note reports phase design

**Date:** 2026-07-07
**Status:** Approved design brief; awaiting written-spec review
**Branch:** `phase-2`
**Predecessor:** Calendar phase on `phase-2`, latest known commit `75ccb35`

## 1. Scope

This phase upgrades the existing `/reports` screen toward the Money Note reporting flow while keeping implementation compact and preserving all existing transaction entry channels:

1. Manual transaction entry continues to save to Supabase.
2. Image/OCR entry continues to save to Supabase.
3. Bank-email automation entry continues to save to Supabase and category-classifies email content before insert.
4. Reports stay cloud-first and read the selected month's Supabase transactions.

The phase focuses on **monthly reports only**. Yearly reports, budget editing improvements, custom category management, recurring transactions, and theme-level UI polish remain out of scope for this phase.

## 2. User Experience

The upgraded Reports screen keeps the current month selector and budget alert, then reorganizes the report into a Money Note-like flow:

1. Header with previous/next month controls and selected month (`YYYY-MM`).
2. Summary metrics for expense, income, and net cashflow.
3. Segmented control: `Chi tiêu` / `Thu nhập`.
4. Donut chart for the selected direction's category totals.
5. Category rows with color marker, label, amount, percentage, and a chevron-style affordance.
6. Tap a category row to open an in-screen detail view.

The detail view shows:

1. Back action to the main report.
2. Selected category title, selected month, and total amount.
3. Bar chart by day for transactions in that category and direction.
4. Transaction list for that category, sorted newest first.
5. Empty state if the category has no transactions.

The UI should be cleaner than the current Reports screen but still basic. It should avoid a full visual redesign, new theming system, or heavy animation.

## 3. Data Model And Flow

`useReports(monthISO)` will continue to be the single monthly data hook for `/reports`. It will expose the current month transactions in addition to existing aggregate values so the screen can derive drill-down rows without issuing a second query.

Current data flow:

```
ReportsScreen
  -> useReports(monthISO)
    -> listCloudTransactionsForRange(selected month)
    -> listCloudTransactionsForRange(previous month)
    -> getBudgetForMonth(monthISO)
    -> pure report helpers
  -> render overview or selected-category detail
```

Existing monthly helpers remain available:

- `totalsByDirection`
- `sumByCategory`
- `dailyTotals`
- `monthOverMonth`
- `hints`
- `status`

New or extended pure report helpers should derive direction-aware category summaries and category-day totals from plain `Transaction[]`. They should not import React, Supabase, IndexedDB, or i18n.

## 4. Direction-Aware Reporting

The current report pie and category list focus on expense categories. This phase makes Reports direction-aware:

1. In `expense` mode, only expense transactions and expense categories are included.
2. In `income` mode, only income transactions and income categories are included.
3. Percentages are calculated against the selected direction's total.
4. Categories with zero amount are hidden from the report list by default.
5. If all categories are zero for the selected direction, show a compact empty state rather than an empty chart.

Budget status remains expense-only. It continues to render for the monthly report overview and should not apply to income categories.

## 5. Components

Keep the implementation close to the current structure:

```
src/
  hooks/
    useReports.ts
  reports/
    category-summary.ts       - direction-aware category summaries
    category-day-totals.ts    - day buckets for a selected category
  ui/
    ReportsScreen.tsx
    components/
      Charts/
        CategoryPie.tsx
        MonthBar.tsx
```

If `ReportsScreen.tsx` becomes difficult to read, extract small local components in the same file first. Add separate component files only if they create a clear boundary, such as a reusable chart or report row.

`CategoryPie` should support non-expense categories by accepting a generic label/color/total shape rather than relying on `ExpenseCategory`.

`MonthBar` can be reused for daily detail bars as long as the prop shape stays simple (`{ date, total }[]`).

## 6. Interaction Details

### 6.1 Month navigation

Month query-state remains `?month=YYYY-MM`. Previous/next controls update this parameter. Invalid or missing values fall back to the current Vietnam month.

### 6.2 Direction segment

The selected direction can be local component state. It does not need to persist in the URL for this phase. Default direction is `expense`.

Switching direction resets the selected category detail if that category does not belong to the new direction.

### 6.3 Category detail

The selected category can be local component state. When a category row is tapped:

1. Main report area is replaced by the detail view.
2. The bottom navigation remains visible.
3. Month navigation still affects the detail view; changing month recomputes the selected category totals.
4. If the selected category has no transactions in the new month, the detail view shows zero total and an empty list.

### 6.4 Transaction list

Rows in detail view show:

- merchant or note/content fallback
- formatted date
- signed amount according to direction
- source/bank hint if already available on the transaction type

Rows are read-only in this phase. Editing transaction category or amount remains a separate phase.

## 7. Error And Empty States

- Supabase not configured: preserve the existing error path and retry action.
- Loading: preserve existing loading text.
- Monthly report has no transactions: show summary totals as zero and empty chart/list states.
- Selected direction has no transactions: show an empty state scoped to `Chi tiêu` or `Thu nhập`.
- Selected category has no transactions after month change: keep detail shell visible with zero total and an empty list.

## 8. Internationalization

Add Vietnamese and English keys only for new user-facing strings:

- `reports.expenseTab`
- `reports.incomeTab`
- `reports.categoryShare`
- `reports.noDirectionData`
- `reports.categoryDetailTitle`
- `reports.noCategoryTransactions`
- `reports.backToReports`

Existing category translation keys remain the source of truth for labels.

## 9. Testing

### 9.1 Pure report helpers

Add focused Vitest coverage for:

- direction-specific category summaries for expenses and income
- percentage calculations
- zero-total behavior
- category-day totals filtered by direction and category
- legacy transactions without explicit direction defaulting consistently with existing compatibility helpers

### 9.2 Hook tests

Extend `useReports` tests to confirm current-month transactions are exposed without breaking existing loading, error, stale-request, and reload behavior.

### 9.3 UI tests

Extend `ReportsScreen` tests to cover:

- expense tab renders expense category rows and percentages
- income tab renders income category rows and percentages
- tapping a category opens detail view
- detail view lists only transactions for that category
- changing direction resets incompatible selected detail
- existing error, loading, retry, budget alert, and month navigation behaviors still work

## 10. Acceptance Criteria

The phase is complete when:

1. `/reports` supports expense and income monthly views.
2. Category rows show amount and percentage for the selected direction.
3. Tapping a category shows a monthly detail view with day bars and matching transactions.
4. Existing manual, OCR/image, and email-automation transaction flows are not regressed.
5. Focused report/helper/UI tests pass.
6. Full project verification passes: tests, TypeScript, lint, and production build.
