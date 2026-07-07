# Money Note-Inspired Calendar Phase 2 Design

## Goal

Add a dedicated `Lịch` tab that makes the app feel closer to Money Note's calendar workflow while preserving the current cloud-first architecture. The screen should help the user answer three questions quickly:

- Which days in the month had spending?
- How much income, expense, and net balance does the month have?
- What categories made up the selected day's transactions?

This phase prioritizes correct data and a clear basic UI over pixel-perfect Money Note styling.

## Current Context

The app already supports:

- Google sign-in through Supabase Auth.
- Supabase as the source of truth for transactions.
- Manual transaction entry.
- Image/OCR transaction entry.
- Bank-email automation inserting expense transactions.
- `direction: 'expense' | 'income'` for separating expense and income.
- Monthly reports that can aggregate income, expense, and net.

Phase 2 builds on that foundation. It does not replace any existing input paths.

## Scope

Phase 2 includes:

- Add a new bottom navigation tab named `Lịch`.
- Place `Lịch` between `Thêm` and `Báo cáo`.
- Keep the existing Home tab and all current add flows.
- Show a month picker with previous/next month controls.
- Show a monthly calendar grid.
- Show each day's expense total in the grid when the day has expenses.
- Show month totals for income, expense, and net.
- Let the user select a date in the calendar.
- Show the selected day's transactions grouped by category.
- Use Supabase transactions from every source: manual, image/OCR, and email automation.
- Use Vietnam-local dates for grouping and display.

Phase 2 does not include:

- Editing transactions from the calendar screen.
- Deleting transactions from the calendar screen.
- Creating transactions directly from the calendar screen.
- Budget setup or budget editing.
- Custom category management.
- Report drilldowns by category over time.
- A highly polished Money Note visual clone.

## Navigation

The bottom navigation becomes:

1. `Home`
2. `Thêm`
3. `Lịch`
4. `Báo cáo`
5. `Cài đặt`

The `Lịch` route should be a first-class screen, not hidden under Reports. Existing routes should keep working.

## Calendar Screen Behavior

The screen contains four main zones:

1. Month header
2. Calendar grid
3. Month summary row
4. Selected-day category list

The month header shows the current month, such as `07/2026`, with previous and next buttons.

The grid shows a normal month calendar. Days outside the selected month can be shown muted or omitted depending on the existing layout patterns. The current day should be visually distinguishable when it appears in the selected month.

Each day cell shows:

- Day number.
- Expense total for that day, if greater than zero.

Income does not need to appear inside each calendar cell in this phase. The monthly summary still includes income.

Selecting a day updates the lower list. The initial selected day is today when viewing the current month. When viewing another month, the initial selected day is the first day in that month that has a transaction; if the month has no transactions, select the first day of the month.

## Selected-Day List

The selected-day list groups transactions by category:

- One row per category used on that day.
- Row shows category label and category subtotal.
- Expense subtotals display as spending.
- Income subtotals display as income.

If a selected day has multiple transactions in the same category, the row shows the combined amount. This matches the basic Money Note calendar-list style without adding a transaction-detail drilldown yet.

If the selected day has no transactions, show a short empty state.

## Data Flow

The calendar screen reads transactions for the selected month from Supabase using the existing authenticated client flow.

Month range should use existing Vietnam date helpers where possible:

- Start date: first day of selected month in Vietnam-local date terms.
- End date: last day of selected month in Vietnam-local date terms.

Transactions are grouped by the Vietnam-local date derived from `occurredAt`.

Aggregation rules:

- Expense total uses transactions where `direction === 'expense'`.
- Income total uses transactions where `direction === 'income'`.
- Net total is `income - expense`.
- Amounts remain positive integers in VND.

The screen should not infer missing transactions. It only displays rows that are already saved in Supabase.

## Component Boundaries

Create small, focused units:

- Calendar page container: owns selected month, selected day, loading/error state.
- Month navigation: displays month label and previous/next controls.
- Calendar grid: receives day summaries and selected date.
- Month summary: receives income, expense, and net totals.
- Selected-day category list: receives grouped category totals for one day.
- Aggregation helpers: turn transactions into day totals, month totals, and selected-day category totals.

Aggregation helpers should be pure functions so they can be tested without rendering the UI.

## Error Handling

If Supabase loading fails, show the existing style of visible error message and keep the screen usable enough to retry by changing month or reloading.

If the month has no transactions, show an empty calendar state without treating it as an error.

If old transactions are missing `direction`, the existing mapper should continue defaulting them to `expense`.

If a transaction has an unknown or missing category, display it as `Khác` or the app's existing fallback category.

## Testing

Add focused tests for:

- Calendar aggregation separates expense, income, and net.
- Day totals use expense only.
- Selected-day grouping combines multiple transactions in the same category.
- Transactions are grouped by Vietnam-local date.
- Calendar route appears in bottom navigation.
- Calendar screen loads current-month transactions from the cloud hook.
- Month previous/next controls request the correct month.
- Empty month renders an empty state.
- Supabase fetch error renders a visible error.

Run the existing focused and full verification commands after implementation:

```bash
pnpm test
pnpm exec tsc -b
pnpm run build
```

## Rollout Notes

No Supabase schema migration is required for this phase because it uses existing transaction fields.

No Edge Function deployment is required unless implementation uncovers a mismatch in existing cloud transaction mapping.

Existing manual, image/OCR, and email automation flows must remain intact after the new tab is added.
