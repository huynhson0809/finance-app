# Email Category Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email-ingested transactions get a stored category from their transfer/card content, and users can correct a transaction category from the Home transaction list.

**Architecture:** Add a Deno-safe email categorizer for the Supabase Edge Function, store `category` on ingest, add a Supabase update helper for category edits, and wire a compact category control into each transaction row. Category edits update the row in Supabase and reload both the recent list and current-month totals so reports stay consistent.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, Supabase Edge Functions, Supabase Postgres migrations.

---

## File Structure

- Create `supabase/functions/_shared/category.ts`
  - Owns Edge Function compatible category enums, normalization, seed keyword matching, and email-specific classification.
- Modify `supabase/functions/_shared/ingest.ts`
  - Adds `category` to normalized email payloads before insert.
- Modify `supabase/functions/_shared/ingest-handler.ts`
  - Inserts the category already present on normalized payloads.
- Create `supabase/migrations/20260706020000_allow_transaction_category_updates.sql`
  - Adds RLS policy for authenticated users to update their own transaction rows.
- Modify `src/supabase/transactions.ts`
  - Adds `updateCloudTransactionCategory(client, id, category)`.
- Modify `src/ui/components/TransactionRow.tsx`
  - Adds a compact category selector and save-disabled state.
- Modify `src/ui/HomeScreen.tsx`
  - Handles category changes, calls Supabase update helper, reloads cloud queries, and shows edit errors.
- Modify `src/i18n/en.json` and `src/i18n/vi.json`
  - Adds category edit labels and error text.
- Add or modify tests:
  - `tests/ingest/category.test.ts`
  - `tests/ingest/ingest.test.ts`
  - `tests/ingest/ingest-handler.test.ts`
  - `tests/supabase/transactions.test.ts`
  - `tests/ui/TransactionRow.test.tsx`
  - `tests/ui/HomeScreen.test.tsx`

---

### Task 1: Edge Email Categorizer

**Files:**
- Create: `supabase/functions/_shared/category.ts`
- Test: `tests/ingest/category.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ingest/category.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyEmailContent } from '../../supabase/functions/_shared/category';

describe('classifyEmailContent', () => {
  it('classifies known merchant content from bank emails', () => {
    expect(classifyEmailContent('Grab* BWCFLJMBDWRJ-G-1')).toBe('transportation');
    expect(classifyEmailContent('Thanh toan Shopee 12345')).toBe('shopping');
    expect(classifyEmailContent('Highlands Coffee Pasteur')).toBe('coffee-bubble-tea');
  });

  it('does not classify generic bank transfer wording as debt', () => {
    expect(classifyEmailContent('HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA')).toBe('others');
    expect(classifyEmailContent('MB transfer ref 159287 1PEV8')).toBe('others');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/ingest/category.test.ts
```

Expected: FAIL because `../../supabase/functions/_shared/category` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/category.ts`:

```ts
export type Category =
  | 'food-drinks'
  | 'coffee-bubble-tea'
  | 'transportation'
  | 'shopping'
  | 'bills-utilities'
  | 'healthcare'
  | 'entertainment'
  | 'transfers-debt'
  | 'others';

interface CategoryRule {
  id: string;
  pattern: string;
  category: Category;
  weight: number;
  learned: boolean;
  createdAt: string;
}

const FIXED_DATE = '1970-01-01T00:00:00.000Z';

function seed(pattern: string, category: Category): Omit<CategoryRule, 'id'> {
  return { pattern, category, weight: 1, learned: false, createdAt: FIXED_DATE };
}

const ENTRIES: Array<Omit<CategoryRule, 'id'>> = [
  seed('coffee', 'coffee-bubble-tea'),
  seed('cafe', 'coffee-bubble-tea'),
  seed('ca phe', 'coffee-bubble-tea'),
  seed('highlands', 'coffee-bubble-tea'),
  seed('starbucks', 'coffee-bubble-tea'),
  seed('phuc long', 'coffee-bubble-tea'),
  seed('trung nguyen', 'coffee-bubble-tea'),
  seed('the coffee house', 'coffee-bubble-tea'),
  seed('tocotoco', 'coffee-bubble-tea'),
  seed('gong cha', 'coffee-bubble-tea'),
  seed('koi', 'coffee-bubble-tea'),
  seed('grab', 'transportation'),
  seed('gojek', 'transportation'),
  seed('xanh sm', 'transportation'),
  seed('be ', 'transportation'),
  seed('taxi', 'transportation'),
  seed('xe om', 'transportation'),
  seed('petrolimex', 'transportation'),
  seed('circle k', 'food-drinks'),
  seed('family mart', 'food-drinks'),
  seed('winmart', 'food-drinks'),
  seed('vinmart', 'food-drinks'),
  seed('co.opmart', 'food-drinks'),
  seed('bach hoa xanh', 'food-drinks'),
  seed('lotteria', 'food-drinks'),
  seed('kfc', 'food-drinks'),
  seed('pho ', 'food-drinks'),
  seed('dien', 'bills-utilities'),
  seed('nuoc', 'bills-utilities'),
  seed('internet', 'bills-utilities'),
  seed('evn', 'bills-utilities'),
  seed('vnpt', 'bills-utilities'),
  seed('viettel', 'bills-utilities'),
  seed('fpt', 'bills-utilities'),
  seed('momo', 'transfers-debt'),
  seed('zalopay', 'transfers-debt'),
  seed('chuyen khoan', 'transfers-debt'),
  seed('transfer', 'transfers-debt'),
  seed('vietcombank', 'transfers-debt'),
  seed('techcombank', 'transfers-debt'),
  seed('shopee', 'shopping'),
  seed('lazada', 'shopping'),
  seed('tiki', 'shopping'),
  seed('sendo', 'shopping'),
  seed('netflix', 'entertainment'),
  seed('spotify', 'entertainment'),
  seed('cgv', 'entertainment'),
  seed('lotte cinema', 'entertainment'),
  seed('galaxy cinema', 'entertainment'),
  seed('pharmacity', 'healthcare'),
  seed('long chau', 'healthcare'),
  seed('medicare', 'healthcare'),
];

const SEED_RULES: CategoryRule[] = ENTRIES.map((entry, index) => ({
  ...entry,
  id: `seed-${index}`,
}));

const EMAIL_RULES = SEED_RULES.filter(rule =>
  rule.pattern !== 'transfer' && rule.pattern !== 'chuyen khoan',
);

export function classifyEmailContent(content: string): Category {
  return classify(content, EMAIL_RULES)?.category ?? 'others';
}

function classify(
  merchant: string,
  rules: CategoryRule[],
): { category: Category; ruleId: string } | null {
  if (!merchant.trim()) return null;
  const norm = normalizeMerchant(merchant);
  const candidates = rules.filter(rule => norm.includes(rule.pattern));
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const rule of candidates.slice(1)) {
    if (compare(rule, best) > 0) best = rule;
  }
  return { category: best.category, ruleId: best.id };
}

function compare(a: CategoryRule, b: CategoryRule): number {
  const scoreA = a.weight + (a.learned ? 100 : 0);
  const scoreB = b.weight + (b.learned ? 100 : 0);
  if (scoreA !== scoreB) return scoreA - scoreB;
  if (a.learned && b.learned) return a.createdAt.localeCompare(b.createdAt);
  return 0;
}

function normalizeMerchant(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s.*-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run tests/ingest/category.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/category.ts tests/ingest/category.test.ts
git commit -m "feat: add email content categorizer"
```

---

### Task 2: Store Email Category During Ingest

**Files:**
- Modify: `supabase/functions/_shared/ingest.ts`
- Modify: `tests/ingest/ingest.test.ts`
- Modify: `tests/ingest/ingest-handler.test.ts`

- [ ] **Step 1: Write the failing ingest tests**

In `tests/ingest/ingest.test.ts`, add this test inside `describe('normalizeIngestPayload', ...)`:

```ts
  it('adds a category based on email content', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'card',
      amount: '-52,043',
      datetime: '2026-07-06 11:19:20',
      content: 'Grab* BWCFLJMBDWRJ-G-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.category).toBe('transportation');
  });

  it('uses others for generic transfer memo content', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '-10,000.00',
      datetime: '060726-14:47:32',
      content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.category).toBe('others');
  });
```

In `tests/ingest/ingest-handler.test.ts`, extend the existing `inserts normalized rows for the configured default user` expectation:

```ts
    expect(inserts[0]).toMatchObject({
      table: 'transactions',
      row: {
        bank: 'MB',
        type: 'transfer',
        amount: 297000,
        transaction_time: '2026-07-04T14:48:49.000Z',
        content: '159287 1PEV8',
        raw_source: 'email',
        category: 'others',
        user_id: 'user-1',
      },
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/ingest/ingest.test.ts tests/ingest/ingest-handler.test.ts
```

Expected: FAIL because `NormalizedIngestPayload` has no `category` property.

- [ ] **Step 3: Implement category in normalized payload**

Modify the top of `supabase/functions/_shared/ingest.ts`:

```ts
import { classifyEmailContent, type Category } from './category.ts';
```

Update `NormalizedIngestPayload`:

```ts
export interface NormalizedIngestPayload {
  bank: Bank;
  type: TransactionKind;
  amount: number;
  transaction_time: string;
  content: string;
  raw_source: 'email';
  category: Category;
}
```

Update the returned `value` in `normalizeIngestPayload`:

```ts
    value: {
      bank: input.bank as Bank,
      type: input.type as TransactionKind,
      amount,
      transaction_time: transactionTime,
      content: input.content.trim(),
      raw_source: 'email',
      category: classifyEmailContent(input.content.trim()),
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm exec vitest run tests/ingest/category.test.ts tests/ingest/ingest.test.ts tests/ingest/ingest-handler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ingest.ts tests/ingest/ingest.test.ts tests/ingest/ingest-handler.test.ts
git commit -m "feat: categorize email transactions on ingest"
```

---

### Task 3: Supabase Policy for Category Updates

**Files:**
- Create: `supabase/migrations/20260706020000_allow_transaction_category_updates.sql`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/20260706020000_allow_transaction_category_updates.sql`:

```sql
drop policy if exists "Users can update own transaction categories" on public.transactions;

create policy "Users can update own transaction categories"
  on public.transactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 2: Verify migration file content**

Run:

```bash
sed -n '1,120p' supabase/migrations/20260706020000_allow_transaction_category_updates.sql
```

Expected output includes:

```sql
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid())
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706020000_allow_transaction_category_updates.sql
git commit -m "feat: allow users to update transaction categories"
```

---

### Task 4: Supabase Category Update Helper

**Files:**
- Modify: `src/supabase/transactions.ts`
- Modify: `tests/supabase/transactions.test.ts`

- [ ] **Step 1: Write failing Supabase helper test**

In `tests/supabase/transactions.test.ts`, update the fake client builder so the `fromStage` supports `update`. Add this behavior next to the existing `insert` behavior:

```ts
  let updatedRow: unknown;

  const fromStage = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] });
      return queryStage;
    },
    insert(row: unknown) {
      insertedRow = row;
      calls.push({ method: 'insert', args: [row] });
      return insertStage;
    },
    update(row: unknown) {
      updatedRow = row;
      calls.push({ method: 'update', args: [row] });
      return updateStage;
    },
  };
```

Add update stages in the same helper:

```ts
  const updateStage = {
    eq(column: string, value: string) {
      calls.push({ method: 'eq', args: [column, value] });
      return updateSelectStage;
    },
  };

  const updateSelectStage = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] });
      return updateSingleStage;
    },
  };

  const updateSingleStage = {
    async single() {
      calls.push({ method: 'single', args: [] });
      return {
        data: result.data?.[0] ?? null,
        error: result.error,
      };
    },
  };
```

Return `updatedRow` from the helper:

```ts
  return {
    client,
    calls,
    fromStage,
    get insertedRow() { return insertedRow; },
    get updatedRow() { return updatedRow; },
  };
```

Import the new helper:

```ts
import {
  addCloudTransaction,
  listCloudTransactions,
  listCloudTransactionsForRange,
  updateCloudTransactionCategory,
} from '../../src/supabase/transactions';
```

Add this test:

```ts
  it('updates a transaction category and maps the returned row', async () => {
    const context = createClientContext({
      data: [{
        ...row,
        id: 'email-1',
        content: 'Grab* BWCFLJMBDWRJ-G-1',
        raw_source: 'email',
        category: 'shopping',
      }],
      error: null,
    });

    const tx = await updateCloudTransactionCategory(context.client, 'email-1', 'shopping');

    expect(context.calls.map(call => call.method)).toEqual(['from', 'update', 'eq', 'select', 'single']);
    expect(context.updatedRow).toEqual({ category: 'shopping' });
    expect(tx.id).toBe('email-1');
    expect(tx.category).toBe('shopping');
  });

  it('throws the Supabase message when category update fails', async () => {
    const context = createClientContext({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    await expect(updateCloudTransactionCategory(context.client, 'email-1', 'shopping')).rejects.toThrow(
      'new row violates row-level security policy',
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/supabase/transactions.test.ts
```

Expected: FAIL because `updateCloudTransactionCategory` is not exported and the query interfaces do not support `update`.

- [ ] **Step 3: Implement update helper**

Modify `src/supabase/transactions.ts` interfaces:

```ts
export interface QuerySelectBuilder {
  select(columns: string): QueryBuilder;
  insert(row: CloudTransactionInsert): InsertSelectBuilder;
  update(row: CloudTransactionUpdate): UpdateEqBuilder;
}

export interface UpdateEqBuilder {
  eq(column: 'id', value: string): UpdateSelectBuilder;
}

export interface UpdateSelectBuilder {
  select(columns: string): InsertSingleBuilder;
}
```

Add update row type:

```ts
interface CloudTransactionUpdate {
  category: Category;
}
```

Add function:

```ts
export async function updateCloudTransactionCategory(
  client: QueryClient,
  id: string,
  category: Category,
): Promise<Transaction> {
  const result = await client
    .from('transactions')
    .update({ category })
    .eq('id', id)
    .select(TRANSACTION_COLUMNS)
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data) {
    throw new Error('No updated transaction returned');
  }

  return mapTransactionRow(result.data);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm exec vitest run tests/supabase/transactions.test.ts tests/supabase/mapper.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/supabase/transactions.ts tests/supabase/transactions.test.ts
git commit -m "feat: update cloud transaction categories"
```

---

### Task 5: Editable Transaction Row

**Files:**
- Modify: `src/ui/components/TransactionRow.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/vi.json`
- Modify: `tests/ui/TransactionRow.test.tsx`

- [ ] **Step 1: Write failing UI tests**

In `tests/ui/TransactionRow.test.tsx`, add:

```tsx
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
```

Add these tests inside `describe('TransactionRow', ...)`:

```tsx
  it('lets the user choose a new category', async () => {
    const user = userEvent.setup();
    const onCategoryChange = vi.fn();

    render(
      <TransactionRow
        t={tx({ category: 'others' })}
        locale="vi"
        onCategoryChange={onCategoryChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/category|danh mục/i), 'shopping');

    expect(onCategoryChange).toHaveBeenCalledWith('tx-1', 'shopping');
  });

  it('disables category editing while the row is saving', () => {
    render(
      <TransactionRow
        t={tx({ category: 'others' })}
        locale="vi"
        onCategoryChange={vi.fn()}
        categorySaving
      />,
    );

    expect(screen.getByLabelText(/category|danh mục/i)).toBeDisabled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/ui/TransactionRow.test.tsx
```

Expected: FAIL because `TransactionRow` does not accept category edit props and has no category select.

- [ ] **Step 3: Add i18n labels**

In `src/i18n/en.json`, add under a top-level `transactions` object:

```json
  "transactions": {
    "categoryLabel": "Transaction category"
  }
```

In `src/i18n/vi.json`, add:

```json
  "transactions": {
    "categoryLabel": "Danh mục giao dịch"
  }
```

If the files already have a `transactions` object, add only `categoryLabel` inside it.

- [ ] **Step 4: Implement editable row**

Modify `src/ui/components/TransactionRow.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import { CATEGORIES, type Category, type Transaction } from '../../types';

interface TransactionRowProps {
  t: Transaction;
  locale: 'vi' | 'en';
  onCategoryChange?: (id: string, category: Category) => void;
  categorySaving?: boolean;
}

export function TransactionRow({
  t: tx,
  locale,
  onCategoryChange,
  categorySaving = false,
}: TransactionRowProps) {
  const { t } = useTranslation();
  return (
    <li className="flex justify-between gap-3 px-4 py-2 border-b">
      <span className="min-w-0">
        {onCategoryChange ? (
          <select
            aria-label={t('transactions.categoryLabel')}
            className="block max-w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            value={tx.category}
            disabled={categorySaving}
            onChange={event => onCategoryChange(tx.id, event.target.value as Category)}
          >
            {CATEGORIES.map(category => (
              <option key={category} value={category}>
                {t(`category.${category}`)}
              </option>
            ))}
          </select>
        ) : (
          <span className="block">{t(`category.${tx.category}`)}</span>
        )}
        <span className="block text-xs text-gray-500">{formatTransactionDate(tx.occurredAt, locale)}</span>
      </span>
      <span className="shrink-0">{formatVND(tx.amount, locale)}</span>
    </li>
  );
}

function formatTransactionDate(iso: string, locale: 'vi' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm exec vitest run tests/ui/TransactionRow.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/TransactionRow.tsx src/i18n/en.json src/i18n/vi.json tests/ui/TransactionRow.test.tsx
git commit -m "feat: make transaction categories editable"
```

---

### Task 6: Home Category Edit Flow

**Files:**
- Modify: `src/ui/HomeScreen.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/vi.json`
- Modify: `tests/ui/HomeScreen.test.tsx`

- [ ] **Step 1: Write failing Home tests**

In `tests/ui/HomeScreen.test.tsx`, extend the Supabase transactions mock import to include `updateCloudTransactionCategory`.

Use this mock shape near the existing mocks:

```tsx
vi.mock('../../src/supabase/transactions', () => ({
  listCloudTransactions: vi.fn(),
  listCloudTransactionsForRange: vi.fn(),
  updateCloudTransactionCategory: vi.fn(),
}));
```

Import the mocked function:

```tsx
import {
  listCloudTransactions,
  listCloudTransactionsForRange,
  updateCloudTransactionCategory,
} from '../../src/supabase/transactions';
```

Add this helper if the file does not already have it:

```tsx
const updateCategoryMock = vi.mocked(updateCloudTransactionCategory);
```

Add these tests:

```tsx
  it('updates a transaction category and reloads cloud data', async () => {
    const user = userEvent.setup();
    recentMock
      .mockResolvedValueOnce([
        tx({ id: 'email-1', amount: 297000, category: 'others', source: 'bank-email' }),
      ])
      .mockResolvedValueOnce([
        tx({ id: 'email-1', amount: 297000, category: 'shopping', source: 'bank-email' }),
      ]);
    monthMock
      .mockResolvedValueOnce([
        tx({ id: 'email-1', amount: 297000, category: 'others', source: 'bank-email' }),
      ])
      .mockResolvedValueOnce([
        tx({ id: 'email-1', amount: 297000, category: 'shopping', source: 'bank-email' }),
      ]);
    updateCategoryMock.mockResolvedValue(
      tx({ id: 'email-1', amount: 297000, category: 'shopping', source: 'bank-email' }),
    );

    renderHome();

    const select = await screen.findByLabelText(/category|danh mục/i);
    await user.selectOptions(select, 'shopping');

    expect(updateCategoryMock).toHaveBeenCalledWith(expect.anything(), 'email-1', 'shopping');
    await waitFor(() => expect(recentMock).toHaveBeenCalledTimes(2));
    expect(monthMock).toHaveBeenCalledTimes(2);
  });

  it('shows an error when category update fails', async () => {
    const user = userEvent.setup();
    recentMock.mockResolvedValue([
      tx({ id: 'email-1', amount: 297000, category: 'others', source: 'bank-email' }),
    ]);
    monthMock.mockResolvedValue([
      tx({ id: 'email-1', amount: 297000, category: 'others', source: 'bank-email' }),
    ]);
    updateCategoryMock.mockRejectedValue(new Error('permission denied for table transactions'));

    renderHome();

    const select = await screen.findByLabelText(/category|danh mục/i);
    await user.selectOptions(select, 'shopping');

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied for table transactions');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/ui/HomeScreen.test.tsx
```

Expected: FAIL because Home does not call `updateCloudTransactionCategory` and the row is not wired with edit props.

- [ ] **Step 3: Add i18n error text**

In `src/i18n/en.json`, add inside the existing `transactions` object:

```json
    "categoryUpdateFailed": "Could not update category"
```

In `src/i18n/vi.json`, add:

```json
    "categoryUpdateFailed": "Không thể cập nhật danh mục"
```

- [ ] **Step 4: Implement Home edit handler**

Modify imports in `src/ui/HomeScreen.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { supabase } from '../supabase/client';
import { updateCloudTransactionCategory } from '../supabase/transactions';
import { errorMessage } from '../lib/error';
```

Keep the existing imports that are still used.

Add state after the cloud query hooks:

```tsx
  const [categoryEditError, setCategoryEditError] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
```

Add handler before `return`:

```tsx
  const handleCategoryChange = async (id: string, category: Category) => {
    if (!supabase) {
      setCategoryEditError(t('cloud.notConfigured'));
      return;
    }

    setCategoryEditError(null);
    setEditingCategoryId(id);
    try {
      await updateCloudTransactionCategory(supabase, id, category);
      await Promise.all([reloadRecent(), reloadMonth()]);
    } catch (error) {
      setCategoryEditError(errorMessage(error));
    } finally {
      setEditingCategoryId(null);
    }
  };
```

If `cloud.notConfigured` does not exist in i18n, use the literal fallback:

```tsx
      setCategoryEditError('Supabase is not configured');
```

Render an alert near the existing cloud error alert:

```tsx
      {categoryEditError && (
        <div role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div>{t('transactions.categoryUpdateFailed')}</div>
          <div>{categoryEditError}</div>
        </div>
      )}
```

Update the transaction row map:

```tsx
        : (
          <ul>
            {recent.map(tx => (
              <TransactionRow
                key={tx.id}
                t={tx}
                locale={locale}
                onCategoryChange={handleCategoryChange}
                categorySaving={editingCategoryId === tx.id}
              />
            ))}
          </ul>
        )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm exec vitest run tests/ui/HomeScreen.test.tsx tests/ui/TransactionRow.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/HomeScreen.tsx src/i18n/en.json src/i18n/vi.json tests/ui/HomeScreen.test.tsx
git commit -m "feat: edit transaction categories from home"
```

---

### Task 7: Verification and Rollout Notes

**Files:**
- Modify: `docs/supabase-shortcuts.md`

- [ ] **Step 1: Update setup docs**

In `docs/supabase-shortcuts.md`, add a note near the migration instructions:

```md
After pulling updates, run `npx supabase db push` so Supabase has the latest transaction columns and the category update RLS policy. Without the latest migrations, manual/image saves or category edits may fail with a schema or row-level security error.
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/ingest/category.test.ts tests/ingest/ingest.test.ts tests/ingest/ingest-handler.test.ts tests/supabase/transactions.test.ts tests/ui/TransactionRow.test.tsx tests/ui/HomeScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm exec tsc -b
pnpm test
pnpm run build
```

Expected:

- TypeScript exits with code 0.
- Vitest passes all test files.
- Production build exits with code 0. The existing Vite chunk-size warning is acceptable if it remains the only warning.

- [ ] **Step 4: Check git diff**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` exits with code 0.
- `git status --short` shows only intended tracked changes plus the known pre-existing untracked plan/spec files and `supabase/.temp/`.

- [ ] **Step 5: Commit docs and any verification-only changes**

```bash
git add docs/supabase-shortcuts.md
git commit -m "docs: note category edit migration rollout"
```

---

## Self-Review

Spec coverage:

- Email ingest category assignment: Task 1 and Task 2.
- Generic transfer wording exclusion: Task 1.
- Editable transaction category UI: Task 5 and Task 6.
- Supabase persistence: Task 3 and Task 4.
- Reload recent and month totals: Task 6.
- Visible save error: Task 6.
- Rollout migration reminder: Task 7.

Placeholder scan:

- No placeholder markers, vague edge-case instructions, or out-of-order references remain.

Type consistency:

- The plan uses the app's existing `Category` enum values.
- The Edge Function category type matches the database constraint values from `20260706010000_allow_user_entered_transactions.sql`.
- `updateCloudTransactionCategory(client, id, category)` is introduced in Task 4 before Home imports it in Task 6.
