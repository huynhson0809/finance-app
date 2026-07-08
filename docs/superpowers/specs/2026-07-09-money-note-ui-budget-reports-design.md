# Money Note UI, Budget, Reports, And Category Design

## Goal

Upgrade the finance PWA toward the Money Note interaction model while keeping the current core flows intact:

- Manual transaction entry.
- Image/OCR transaction entry.
- Bank email automation for MB and ACB.
- Transaction editing, category correction, and cloud-backed reporting.

This design is intentionally phased. The requested feature set touches UI, reports, budget rules, and category data modeling; shipping it as separate phases keeps each change usable and testable.

## Product Direction

Use the existing approved Money Note-inspired direction:

- True black app background.
- Compact iOS-like headers.
- Flat dark rows and section bands instead of large dashboard cards.
- Category icons and colors as the main visual affordance.
- Bottom navigation remains, with the centered add button.
- Avoid explanatory marketing text in the main app surface.

The app should feel clean and native enough for daily iPhone use, while still staying simple for the current PWA codebase.

## Phase 1: Add Screen And Email Setup Cleanup

### Add Screen

The Add screen becomes a compact Money Note-style entry surface that fits on one normal iPhone viewport without requiring scroll for the common path.

It shows:

- Direction segmented control: expense/income.
- Date row.
- Note/merchant row.
- Amount row.
- Category grid for the selected direction.
- Image entry affordance.
- Primary save button.

The old `Link Email` tile is removed from the Add tab. Email automation is not a transaction input method the user can complete inside this screen, so keeping it next to Manual and Scan Receipt creates false affordance.

The first version keeps the existing static categories, but adds a visible "Manage categories" entry point from the category section. The full custom category system is Phase 4.

### Settings Email Setup

Settings gains an "Email automation" section.

It explains:

- Setup is manual and requires admin/support help.
- Current support is iPhone only.
- Current supported banks are MB and ACB.
- The setup uses iOS Shortcuts + Mail/Gmail forwarding depending on the user's device configuration.

This section is informational for now. It does not create automations from inside the PWA.

## Phase 2: Monthly Budget And Savings Target

The budget model gains a protected savings target.

```text
spendableBudget = max(monthlyBudget - savingsTarget, 0)
```

Example:

```text
monthlyBudget = 10,000,000
savingsTarget = 2,000,000
spendableBudget = 8,000,000
```

The app treats spending above `8,000,000` as risky because it starts consuming the protected savings amount.

### Budget Data

Extend `Budget` with:

- `total`: gross monthly budget.
- `savingsTarget`: protected amount for the month.
- `caps`: per-expense-category monthly caps.

Existing budget rows without `savingsTarget` default to `0`.

### Budget UI

Budget UI should show:

- Gross budget.
- Savings target.
- Spendable budget.
- Spent amount.
- Remaining spendable amount.
- Per-category cap rows for expense categories.

Overall budget status uses `spendableBudget`, not gross `total`.

Per-category caps remain expense-only. Income categories do not get budget caps in this phase.

## Phase 3: Reports And Report Menu

### Interactive Donut Chart

The category donut chart becomes directly interactive:

- Tap/click a slice to select it.
- Selected slice shows a small Money Note-style tooltip near the chart center.
- Tooltip includes category name, amount, and percentage.
- A small pointer/marker visually connects the selected slice to the tooltip when practical.
- Tapping a category row selects the same slice.
- Tapping the selected slice/row again clears the selection.

The chart remains direction-aware: expense and income are separate views.

### Report Types In Settings

Settings gains report menu entries inspired by Money Note:

- Report in year.
- Category report in year.
- All-time report.
- All-time category report.
- Balance change report.
- Transaction search.

Each report route should reuse existing transaction aggregation helpers where possible. The first implementation can be simple but functional: header, period controls where relevant, chart/list summary, and empty states.

## Phase 4: Custom Categories

Custom categories are a separate phase because the current app models categories as TypeScript union values in `src/types.ts`.

Adding true user-defined categories requires changing the data model so categories can be runtime data instead of only static code constants.

### Requirements

Users can:

- Add expense categories.
- Add income categories.
- Rename categories.
- Choose icon/color from a supported set.
- Reorder categories.
- Hide or archive categories that are no longer used.

Existing transactions must keep rendering correctly even if a category is renamed or archived.

### Compatibility

The existing built-in categories remain seeded defaults. Old transactions keep their category ids. Custom categories get stable ids and metadata.

Reports, Add, Edit, Budget, and email categorization must all read category metadata from the same category source.

## Data Flow

Manual and image transactions continue to go through existing save flows. Bank email transactions continue to enter through Supabase Edge Function ingestion.

Budget and category changes are local-first in IndexedDB unless the project later decides to sync these settings to Supabase. Transaction rows remain Supabase-backed where they already are.

## Error Handling

- Add screen disables save until amount, date, and category are valid.
- Budget screen accepts empty category caps and treats them as unset.
- Savings target larger than monthly budget is allowed but results in `spendableBudget = 0`; UI should clearly show no spendable amount remains.
- Reports show empty states when no data exists.
- Email setup section is informational and should not imply automatic setup from the PWA.

## Testing

Add focused coverage per phase:

- Add screen layout/flow tests: direction switch, image entry preserved, Link Email removed, save still works.
- Settings tests: email setup section, report menu entries, budget/savings inputs.
- Budget helper tests: spendable budget, savings target default, over-budget status against spendable amount.
- Reports tests: donut selection, row selection, empty state, direction switching.
- Category tests in Phase 4: seeded categories, custom categories, rename/archive compatibility.

Run before handoff:

```text
pnpm test
pnpm exec tsc -b
pnpm run lint
pnpm run build
```

## Implementation Order

1. Phase 1: Add screen compact redesign and Email setup moved to Settings.
2. Phase 2: Budget savings target and clearer monthly budget screen.
3. Phase 3: Interactive report chart and report menu/routes.
4. Phase 4: Runtime custom category system.

This order gives the user immediate UI improvement first, then adds the budget behavior that changes financial meaning, then expands analysis features, then handles the deeper category data-model migration.
