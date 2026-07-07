# Dark Glass UI Redesign Design

## Status

Approved for planning on 2026-07-07.

## Context

The finance PWA already has the core product flows:

- Google sign-in through Supabase Auth.
- Cloud transactions through Supabase.
- Manual transaction entry.
- Image/OCR transaction entry and confirmation.
- Bank email ingestion through the `ingest-transaction` Edge Function.
- Category suggestion and category editing.
- Calendar, reports, budgets, and settings.

The current UI is functional but visually plain. The new direction should make the app feel closer to a native iPhone finance app while preserving every existing capability.

## Decisions

- Redesign the whole app, not only one or two screens.
- Use a dark practical glass style inspired by the provided references.
- Keep the style readable and usable rather than maximizing blur, glow, or decoration.
- Treat the app as mobile-first and nearly iPhone-only. Desktop may show the mobile app centered rather than expanding into a dashboard.
- Keep the in-app numeric keypad for transaction amount entry.
- Make the floating center `+` button open the Add Transaction screen directly.
- Build a reusable component system first, then apply it across screens.

## Goals

- Establish a consistent visual system for all current screens.
- Improve perceived polish without changing backend behavior.
- Preserve all existing add paths: manual, image/OCR, and email automation.
- Preserve existing reporting, budget, settings, and category edit behavior.
- Make iPhone viewport layout the primary design target.
- Keep text, money values, controls, charts, and bottom navigation readable and tappable.

## Non-Goals

- No database schema changes.
- No Supabase Auth changes.
- No Edge Function behavior changes.
- No new paid integration or banking API work.
- No desktop-specific dashboard redesign.
- No redesign of the email Shortcut setup itself, except links or settings UI already in the app.

## Visual Direction

The app should use a restrained dark glassmorphism language:

- Background: deep charcoal/navy surface with subtle depth.
- Panels: translucent dark glass with thin light borders.
- Accent colors: blue for primary navigation/actions, mint/green for positive or balance-adjacent values, red/coral for expense emphasis, plus category-specific icon colors.
- Glow: used sparingly around primary cards, selected calendar dates, and the floating add button.
- Typography: large, readable money values; compact labels; no viewport-scaled font sizes.
- Shape language: rounded iOS-style cards and grouped lists, but no nested card stacks.

The result should feel premium but still fast to scan.

## Component System

Create shared UI primitives before rewriting screens:

- `AppShell`: full-height mobile shell, dark background, safe bottom padding, centered max-width on larger screens.
- `BottomNav`: fixed dark glass bottom navigation with Home, Calendar, Add, Reports, Settings.
- `FloatingAddButton`: centered glowing `+` button that links to `/add`.
- `GlassPanel`: reusable panel for dashboard cards, charts, calendars, settings groups, and OCR preview containers.
- `MetricCard`: money/status summary block for income, expense, net, budget, and balance-like summaries.
- `MoneyRow`: transaction/category row with icon, title, subtitle, amount, direction color, and optional category editor area.
- `CategoryIconTile`: tappable category selection tile with icon/color/selected state.
- `DarkField`: dark input/select/date field style for manual and OCR flows.
- `SegmentedControl`: expense/income and reports direction controls.
- `KeypadButton`: stable in-app keypad button with fixed dimensions.

These primitives should keep the existing hooks and business logic isolated from presentation.

## Screen Design

### Layout

`Layout` becomes the app shell. It owns the dark background, mobile viewport constraints, bottom nav, and floating add button. Main content gets enough bottom padding so fixed navigation never covers save buttons or transaction lists.

The Add route remains a normal page, and the center `+` opens `/add` directly.

### Home

Home becomes the primary dashboard:

- Header shows current month and page title.
- Top glass summary panel shows monthly income, monthly expense, and net/balance-like value using existing month transactions.
- Today's spend and today's income remain available, either inside the summary panel or as compact metric chips.
- Budget state remains visible through a dark adapted budget bar/alert.
- Recent transactions use `MoneyRow`, keep category editing, and still reload after edits.
- Manual/image add entry points remain accessible, with image add either as an action tile or secondary action near the transaction list.

### Add Transaction

Add keeps the existing fast-entry behavior:

- Expense/income segmented control.
- Large amount display.
- In-app numeric keypad.
- Date and note/merchant fields using `DarkField`.
- Manual, Scan Receipt, and Link Email/automation helper actions are visible as compact tiles.
- Category selection uses `CategoryIconTile` in a grid.
- Save button remains prominent and never sits under the bottom nav.

The manual save path continues to call the existing `saveUserTransaction` flow and learned category logic.

### Confirm/OCR

Confirm keeps image/OCR behavior:

- Dark header and amount display.
- Image preview inside a glass panel.
- OCR loading/progress and retry states remain visible.
- Extracted amount, merchant, date, and category fields use the same Add screen primitives.
- Save continues to preserve `receipt` or `bank-screenshot` source and bank hints.

### Calendar

Calendar becomes a compact glass month grid:

- Month navigation stays at the top.
- Calendar cells use fixed dimensions and cannot stretch from long money values.
- Each day shows date and compact net/expense hints.
- Selected day uses blue accent ring/glow.
- Selected-day category totals use `MoneyRow` or grouped list rows.
- Month totals remain visible as compact metric chips.

### Reports

Reports keep the existing report helpers and charts:

- Month navigation stays.
- Expense, income, and net totals use `MetricCard`.
- Expense/income segmented control uses the shared control.
- Pie/bar charts sit inside dark chart panels.
- Category rows use `MoneyRow` with percentage and amount.
- Category detail view keeps daily bars and transaction list.
- Empty, loading, and error states stay explicit and readable.

### Settings

Settings becomes grouped iOS-style dark list sections:

- Account/sign-out.
- Language.
- Monthly budget and category caps.
- Any helper links for email automation or setup docs.

Settings should be quieter than dashboard/report screens, with less glow and more grouped-list clarity.

## Data Flow

No product data flow changes are required.

- Supabase hooks continue to fetch cloud transactions.
- Existing report helpers continue to aggregate transactions.
- Existing OCR extraction and save functions continue to run.
- Existing category update helper continues to update Supabase and reload lists.
- Existing local budget storage remains unchanged.

UI components receive already-derived values via props and avoid embedding report or Supabase query logic.

## Error Handling

The redesign must preserve all current error states:

- Supabase not configured.
- Cloud transaction fetch failures with retry.
- Category update failure.
- Manual save failure.
- OCR failure and retry.
- Report/calendar loading and empty states.
- Sign-out failure.

Error banners should use dark-compatible surfaces with red/coral accents and must be readable on iPhone.

## Accessibility and Mobile Constraints

- Primary touch targets should be at least 44px high/wide.
- Bottom nav and floating add button must respect safe-area and content padding.
- Money text must not overflow cards or buttons.
- Calendar cells must use fixed stable dimensions.
- Buttons and icon-only actions need accessible labels.
- Color cannot be the only indicator for selected category, selected tab, or selected day.
- The UI should remain usable without relying on heavy blur support.

## Testing and Verification

Implementation should include:

- Existing unit and component tests staying green.
- Focused tests for any new reusable components where behavior matters, especially navigation and category controls.
- Route smoke checks for `/`, `/add`, `/calendar`, `/reports`, `/settings`, and `/confirm` fallback behavior.
- Browser visual checks at iPhone-sized viewport.
- Checks that bottom nav does not cover save actions, lists, charts, or error banners.
- Checks that loading, empty, and error states remain visible in dark mode.

## Rollout Plan

1. Add the global dark theme and shared primitives.
2. Convert `Layout` to the dark mobile app shell.
3. Apply primitives to Home and shared transaction rows.
4. Apply primitives to Add and Confirm/OCR flows.
5. Apply primitives to Calendar.
6. Apply primitives to Reports.
7. Apply primitives to Settings and budget controls.
8. Run full test/build verification and browser smoke checks.

This order makes the component system useful immediately while keeping existing functionality intact through each step.
