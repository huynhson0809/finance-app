# Money Note Phase 4 Custom Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add and edit custom income/expense categories from the manual add flow while keeping built-in categories and existing automation behavior stable.

**Architecture:** Custom categories are stored in the existing `settings` IndexedDB store and merged with built-in categories through a small catalog layer. UI rendering must use safe label/meta helpers so transactions with custom category ids never crash home, calendar, reports, or edit screens.

**Tech Stack:** React, TypeScript, IndexedDB via `idb`, Vitest, Testing Library, existing i18n JSON resources.

---

### Task 1: Category Data Model And Catalog

**Files:**
- Modify: `src/types.ts`
- Create: `src/db/custom-categories.ts`
- Create: `src/hooks/useCustomCategories.ts`
- Create: `src/categories/catalog.ts`
- Test: `tests/db/custom-categories.test.ts`
- Test: `tests/categories/catalog.test.ts`

- [ ] Add custom category id template types:
  - `CustomExpenseCategory = \`custom-expense-${string}\``
  - `CustomIncomeCategory = \`custom-income-${string}\``
  - Include them in `ExpenseCategory` and `IncomeCategory`.
- [ ] Add `UserCategory` with `id`, `direction`, `name`, `createdAt`, `updatedAt`.
- [ ] Update `categoryBelongsToDirection()` to accept custom id prefixes.
- [ ] Implement settings-backed CRUD:
  - `getCustomCategories()`
  - `createCustomCategory(direction, name)`
  - `renameCustomCategory(id, name)`
  - `deleteCustomCategory(id)`
- [ ] Add `useCustomCategories()` to load categories and expose add/rename/delete/reload helpers.
- [ ] Add catalog helpers that merge built-ins with custom categories for a direction.
- [ ] Tests must prove custom expense/income ids belong to the correct direction and custom categories persist.

### Task 2: Safe Category Labels And Visual Fallbacks

**Files:**
- Modify: `src/ui/theme/categoryMeta.tsx`
- Modify: `src/ui/components/CategoryChips.tsx`
- Modify: `src/ui/components/TransactionRow.tsx`
- Modify: `src/ui/CalendarScreen.tsx`
- Modify: `src/ui/ReportsScreen.tsx`
- Test: `tests/ui/categoryMeta.test.tsx`
- Test: `tests/ui/Charts.test.tsx`
- Test: `tests/ui/ReportsScreen.test.tsx`

- [ ] Add `getCategoryMeta(category)` returning built-in meta or expense/income fallback.
- [ ] Add `categoryLabel(category, customCategories, t)` returning custom name or built-in translation.
- [ ] Update all UI category rendering from direct `CATEGORY_META[category]` and `t(category...)` to helpers where custom ids can appear.
- [ ] Update report pie color fallback for custom ids.
- [ ] Tests must prove unknown/custom categories render with fallback icons/labels and reports do not crash.

### Task 3: Manual Add Category Manager

**Files:**
- Modify: `src/ui/AddScreen.tsx`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Test: `tests/ui/AddScreen.test.tsx`

- [ ] Replace the "coming soon" alert with an inline/overlay category manager.
- [ ] Manager must work for current direction and switch naturally with the existing income/expense segmented control.
- [ ] User can add a custom category name, rename a custom category, and delete a custom category.
- [ ] Built-in categories remain selectable but are not deleted.
- [ ] Newly added custom category appears in the grid and can be selected for save.
- [ ] Keep add screen compact enough for mobile: no large explanatory text, no extra email setup tile.

### Task 4: Transaction Edit Uses Dynamic Categories

**Files:**
- Modify: `src/ui/TransactionEditScreen.tsx`
- Test: `tests/ui/TransactionEditScreen.test.tsx`

- [ ] Load custom categories and merge them with built-ins for the transaction direction.
- [ ] Render custom names and fallback icons.
- [ ] Allow changing an existing transaction to a custom category.
- [ ] Preserve current edit/copy/delete behavior.

### Task 5: Verification And Commit

**Files:**
- No production files unless fixes are required.

- [ ] Run focused tests for custom categories and affected UI.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm exec tsc -b`.
- [ ] Run `pnpm run lint`.
- [ ] Run `pnpm run build`.
- [ ] Commit Phase 4 changes.
