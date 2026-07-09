# Money Note Phase 3 Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Reports feel closer to Money Note by adding tappable donut callouts and report entry points from Settings.

**Architecture:** Keep the existing monthly report data hook and add lightweight report modes through query parameters. Settings exposes report links, Reports displays the active mode title and adds a working search mode over the currently loaded report transactions. The category donut owns its selected slice callout so the interaction is reusable.

**Tech Stack:** React, TypeScript, React Router, Recharts, i18next, Vitest, React Testing Library, Tailwind CSS, lucide-react.

---

## File Structure

- Modify `src/ui/components/Charts/CategoryPie.tsx`: add tap/click selected-slice callout with a small arrow.
- Modify `tests/ui/Charts.test.tsx`: cover the selected-slice callout.
- Modify `src/ui/ReportsScreen.tsx`: pass locale into the donut and add report mode/search UI driven by query params.
- Modify `tests/ui/ReportsScreen.test.tsx`: cover report mode title/search behavior.
- Modify `src/ui/SettingsScreen.tsx`: add a Reports section with Money Note-style report links.
- Modify `src/i18n/en.json` and `src/i18n/vi.json`: add report/settings labels.
- Modify `tests/ui/SettingsScreen.test.tsx`: cover Settings report links.

## Task 1: Donut Slice Callout

**Files:**
- Modify: `src/ui/components/Charts/CategoryPie.tsx`
- Modify: `tests/ui/Charts.test.tsx`

- [ ] **Step 1: Add test for the callout**

Add a test that renders `CategoryPie` with Food and Shopping rows, clicks the Food slice/selector, and expects a visible callout containing `Food`, a formatted amount, and a percent.

- [ ] **Step 2: Implement selected slice state**

In `CategoryPie`, add local `selectedCategory` state. Use the first non-zero datum as the default selected row. Clicking a pie slice or its matching accessible selector updates selected row.

- [ ] **Step 3: Render the callout with a small arrow**

Overlay a centered callout over the chart:

- category label
- formatted amount
- percentage
- a small downward triangle/pointer using CSS borders or a rotated square

- [ ] **Step 4: Run focused chart tests**

Run:

```bash
pnpm exec vitest run tests/ui/Charts.test.tsx
```

Expected: PASS.

## Task 2: Settings Report Entries

**Files:**
- Modify: `src/ui/SettingsScreen.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/vi.json`
- Modify: `tests/ui/SettingsScreen.test.tsx`

- [ ] **Step 1: Add translation keys**

Add settings report labels for:

- Reports
- Yearly report
- Yearly category report
- All-time report
- All-time category report
- Balance change report
- Search transactions

- [ ] **Step 2: Add Settings section**

Add a `GlassPanel` below Email Automation and above Monthly Budget with six `Link` rows:

- `/reports?mode=year-summary`
- `/reports?mode=year-category`
- `/reports?mode=all-summary`
- `/reports?mode=all-category`
- `/reports?mode=balance-change`
- `/reports?mode=search`

Use `BarChart3`, `PieChart`, `LineChart`, and `Search` icons from `lucide-react`.

- [ ] **Step 3: Add Settings test**

Assert the report section exists and the six links have the expected `href` values.

- [ ] **Step 4: Run focused Settings tests**

Run:

```bash
pnpm exec vitest run tests/ui/SettingsScreen.test.tsx
```

Expected: PASS.

## Task 3: Report Mode Title And Search

**Files:**
- Modify: `src/ui/ReportsScreen.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/vi.json`
- Modify: `tests/ui/ReportsScreen.test.tsx`

- [ ] **Step 1: Add report mode translations**

Add labels for each report mode and a search placeholder.

- [ ] **Step 2: Read `mode` query param**

In `ReportsScreen`, read `mode` from `searchParams`. Default is monthly/category mode. Show a heading/pill for known report modes.

- [ ] **Step 3: Add search mode**

When `mode=search`, render a search input above the normal content. Filter the visible by-category transaction rows in the category detail/search result list by merchant, note, bank, amount, or category label. If no query is entered, show recent current report transactions. This can be a lightweight current-report search, not an all-time backend search yet.

- [ ] **Step 4: Pass locale into CategoryPie**

Pass locale to `CategoryPie` so the donut callout formats money correctly.

- [ ] **Step 5: Add tests**

Add tests for:

- `mode=year-summary` showing the yearly report label.
- `mode=search` showing search input and filtering current report transactions.

- [ ] **Step 6: Run focused report tests**

Run:

```bash
pnpm exec vitest run tests/ui/ReportsScreen.test.tsx tests/ui/Charts.test.tsx
```

Expected: PASS.

## Task 4: Phase Verification

**Files:** no source changes expected.

- [ ] **Step 1: Run focused report/settings tests**

Run:

```bash
pnpm exec vitest run tests/ui/Charts.test.tsx tests/ui/ReportsScreen.test.tsx tests/ui/SettingsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full test/static/build checks**

Run:

```bash
pnpm test
pnpm exec tsc -b
pnpm run lint
pnpm run build
```

Expected: all commands exit 0. Existing lint warnings may remain.

- [ ] **Step 3: Commit plan**

```bash
git add docs/superpowers/plans/2026-07-09-money-note-phase-3-reports.md
git commit -m "docs: add money note phase 3 plan"
```

## Self-Review

- Spec coverage: Covers report entries in Settings, tappable donut callout, and a useful search report mode.
- Placeholder scan: No placeholders or TBD steps remain.
- Scope: Year/all-time modes are entry points with mode labels using current report data; full backend aggregation can be a later dedicated phase if needed.
