# Money Note Home Transaction Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Home toward the approved Faithful Money Note direction and add a full `/transactions/:id` edit screen with source metadata, save, copy, and delete.

**Architecture:** Extend the cloud transaction model to preserve source metadata, add focused Supabase read/update/delete helpers, then build a route-level edit screen that owns form state and calls those helpers. Home becomes a tappable transaction list instead of managing inline category edits.

**Tech Stack:** React, React Router, TypeScript, Tailwind utilities, Supabase JS query builders, Vitest, Testing Library, Postgres RLS migrations.

---

## File Structure

- Modify `src/types.ts`: add optional metadata fields to `Transaction` so UI can display bank/source/type.
- Modify `src/supabase/mapper.ts`: map `bank`, `type`, and `raw_source` into those metadata fields.
- Modify `src/supabase/transactions.ts`: add `getCloudTransaction`, `updateCloudTransaction`, and `deleteCloudTransaction`; expand query-builder interfaces.
- Create `supabase/migrations/20260708010000_allow_transaction_full_edits.sql`: grant safe column updates and delete policy.
- Modify `src/ui/HomeScreen.tsx`: remove inline category mutation state and render Faithful Money Note rows linking to detail.
- Modify `src/ui/components/TransactionRow.tsx`: make rows tappable/link-like and remove inline category select.
- Create `src/ui/TransactionEditScreen.tsx`: full edit UI, metadata display, category grid, save/copy/delete actions.
- Modify `src/App.tsx`: add `/transactions/:id` route.
- Modify `src/i18n/vi.json` and `src/i18n/en.json`: add edit/source labels.
- Modify tests: `tests/supabase/mapper.test.ts`, `tests/supabase/transactions.test.ts`, `tests/ui/HomeScreen.test.tsx`, and create `tests/ui/TransactionEditScreen.test.tsx`.

Do not stage or revert unrelated existing work in `docs/supabase-shortcuts.md`, `supabase/functions/_shared/*`, or `tests/ingest/*` unless the current task explicitly touches those files.

---

### Task 1: Preserve Cloud Transaction Metadata

**Files:**
- Modify: `src/types.ts`
- Modify: `src/supabase/mapper.ts`
- Test: `tests/supabase/mapper.test.ts`

- [ ] **Step 1: Write failing mapper metadata tests**

Add tests to `tests/supabase/mapper.test.ts`:

```ts
it('keeps cloud metadata for MB card email rows', () => {
  const tx = mapTransactionRow(row({
    bank: 'MB',
    type: 'card',
    raw_source: 'email',
  }));

  expect(tx).toMatchObject({
    bank: 'MB',
    transactionType: 'card',
    rawSource: 'email',
    bankHint: 'mb',
    source: 'bank-email',
  });
});

it('keeps cloud metadata for manual rows', () => {
  const tx = mapTransactionRow(row({
    bank: null,
    type: 'manual',
    raw_source: 'manual',
    merchant: 'Coffee',
    category: 'coffee-bubble-tea',
  }));

  expect(tx).toMatchObject({
    bank: undefined,
    transactionType: 'manual',
    rawSource: 'manual',
    source: 'manual',
  });
});
```

- [ ] **Step 2: Run mapper tests and verify failure**

Run:

```bash
pnpm test tests/supabase/mapper.test.ts
```

Expected: FAIL because `bank`, `transactionType`, and `rawSource` are absent from mapped transactions.

- [ ] **Step 3: Add metadata fields to app types**

Update `src/types.ts`:

```ts
export type CloudBank = 'MB' | 'ACB';
export type CloudTransactionType =
  | 'transfer'
  | 'card'
  | 'balance_alert'
  | 'manual'
  | 'receipt'
  | 'bank_screenshot';
export type CloudRawSource = 'email' | 'manual' | 'receipt' | 'bank-screenshot';

interface TransactionBase {
  id: string;
  amount: number;
  currency: 'VND';
  occurredAt: string;
  merchant?: string;
  note?: string;
  source: TransactionSource;
  bankHint?: BankHint;
  bank?: CloudBank;
  transactionType?: CloudTransactionType;
  rawSource?: CloudRawSource;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Map metadata in Supabase mapper**

Update `src/supabase/mapper.ts` so every mapped transaction includes:

```ts
bank: row.bank ?? undefined,
transactionType: row.type,
rawSource: row.raw_source,
```

Keep existing source/category classification behavior unchanged.

- [ ] **Step 5: Run mapper tests and verify pass**

Run:

```bash
pnpm test tests/supabase/mapper.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit task 1**

```bash
git add src/types.ts src/supabase/mapper.ts tests/supabase/mapper.test.ts
git commit -m "feat: expose transaction source metadata"
```

---

### Task 2: Add Supabase Full Edit Helpers And RLS Migration

**Files:**
- Modify: `src/supabase/transactions.ts`
- Create: `supabase/migrations/20260708010000_allow_transaction_full_edits.sql`
- Test: `tests/supabase/transactions.test.ts`

- [ ] **Step 1: Extend transaction test client with eq/single/delete support**

Update the mock in `tests/supabase/transactions.test.ts` to support:

```ts
let deleted = false;

const query = {
  limit(count: number) { calls.push({ method: 'limit', args: [count] }); return query; },
  order(column: string, opts: { ascending: boolean }) { calls.push({ method: 'order', args: [column, opts] }); return query; },
  gte(column: string, value: string) { calls.push({ method: 'gte', args: [column, value] }); return query; },
  lt(column: string, value: string) { calls.push({ method: 'lt', args: [column, value] }); return query; },
  eq(column: string, value: string) { calls.push({ method: 'eq', args: [column, value] }); return query; },
  single() {
    calls.push({ method: 'single', args: [] });
    return Promise.resolve({
      data: Array.isArray(result.data) ? result.data[0] ?? null : null,
      error: result.error,
    });
  },
  then<TResult1 = MockResult, TResult2 = never>(
    onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(result).then(onfulfilled, onrejected);
  },
};
```

Add `delete()` to `fromStage`:

```ts
delete() {
  deleted = true;
  calls.push({ method: 'delete', args: [] });
  return query;
}
```

Return `get deleted() { return deleted; }` from `createClient`.

- [ ] **Step 2: Write failing Supabase helper tests**

Update imports:

```ts
import {
  addCloudTransaction,
  deleteCloudTransaction,
  getCloudTransaction,
  listCloudTransactions,
  listCloudTransactionsForRange,
  updateCloudTransaction,
  updateCloudTransactionCategory,
  type QueryClient,
} from '../../src/supabase/transactions';
```

Add tests:

```ts
it('gets one cloud transaction by id', async () => {
  const context = createClient({ data: [row({ id: 'tx-42' })], error: null });

  const tx = await getCloudTransaction(context.client, 'tx-42');

  expect(context.calls).toEqual([
    { method: 'from', args: ['transactions'] },
    { method: 'select', args: [SELECT_COLUMNS] },
    { method: 'eq', args: ['id', 'tx-42'] },
    { method: 'single', args: [] },
  ]);
  expect(tx.id).toBe('tx-42');
});

it('updates editable transaction fields only', async () => {
  const context = createClient({ data: [row({
    id: 'tx-42',
    amount: 123000,
    transaction_time: '2026-07-08T05:00:00.000Z',
    content: 'Updated memo',
    category: 'shopping',
  })], error: null });

  const tx = await updateCloudTransaction(context.client, 'tx-42', {
    amount: 123000,
    occurredAt: '2026-07-08T05:00:00.000Z',
    content: 'Updated memo',
    merchant: null,
    note: null,
    category: 'shopping',
  });

  expect(context.updatedRow).toEqual({
    amount: 123000,
    transaction_time: '2026-07-08T05:00:00.000Z',
    content: 'Updated memo',
    merchant: null,
    note: null,
    category: 'shopping',
  });
  expect(tx.amount).toBe(123000);
  expect(tx.category).toBe('shopping');
});

it('deletes one cloud transaction by id', async () => {
  const context = createClient({ data: [], error: null });

  await deleteCloudTransaction(context.client, 'tx-42');

  expect(context.calls).toEqual([
    { method: 'from', args: ['transactions'] },
    { method: 'delete', args: [] },
    { method: 'eq', args: ['id', 'tx-42'] },
  ]);
  expect(context.deleted).toBe(true);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm test tests/supabase/transactions.test.ts
```

Expected: FAIL because the new helpers do not exist.

- [ ] **Step 4: Implement helper types and functions**

Update `src/supabase/transactions.ts` interfaces:

```ts
export interface QueryBuilder extends PromiseLike<QueryResult> {
  limit(count: number): QueryBuilder;
  order(column: string, opts: { ascending: boolean }): QueryBuilder;
  gte(column: string, value: string): QueryBuilder;
  lt(column: string, value: string): QueryBuilder;
  eq(column: string, value: string): QueryBuilder;
  single(): PromiseLike<MutationResult>;
}

export interface QuerySelectBuilder {
  select(columns: string): QueryBuilder;
  insert(row: CloudTransactionInsert): InsertSelectBuilder;
  update(row: CloudTransactionUpdate): UpdateFilterBuilder;
  delete(): DeleteFilterBuilder;
}

export interface DeleteFilterBuilder {
  eq(column: string, value: string): PromiseLike<{ error: QueryError | null }>;
}

export interface CloudTransactionFullUpdate {
  amount: number;
  occurredAt: string;
  content: string;
  merchant: string | null;
  note: string | null;
  category: Category;
}
```

Add functions:

```ts
export async function getCloudTransaction(
  client: QueryClient,
  id: string,
): Promise<Transaction> {
  const result = await client
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('id', id)
    .single();

  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error('No transaction returned');
  return mapTransactionRow(result.data);
}

export async function updateCloudTransaction(
  client: QueryClient,
  id: string,
  input: CloudTransactionFullUpdate,
): Promise<Transaction> {
  const result = await client
    .from('transactions')
    .update({
      amount: input.amount,
      transaction_time: input.occurredAt,
      content: input.content,
      merchant: input.merchant,
      note: input.note,
      category: input.category,
    })
    .eq('id', id)
    .select(TRANSACTION_COLUMNS)
    .single();

  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error('No updated transaction returned');
  return mapTransactionRow(result.data);
}

export async function deleteCloudTransaction(
  client: QueryClient,
  id: string,
): Promise<void> {
  const result = await client
    .from('transactions')
    .delete()
    .eq('id', id);

  if (result.error) throw new Error(result.error.message);
}
```

Leave the existing `updateCloudTransactionCategory` implementation unchanged so current category-only flows keep their exact query shape and behavior.

- [ ] **Step 5: Add RLS migration**

Create `supabase/migrations/20260708010000_allow_transaction_full_edits.sql`:

```sql
revoke update on table public.transactions from anon, authenticated;
grant update (
  amount,
  transaction_time,
  content,
  merchant,
  note,
  category
) on table public.transactions to authenticated;

grant delete on table public.transactions to authenticated;

drop policy if exists "Users can update own transaction categories" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
  on public.transactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "Users can delete own transactions"
  on public.transactions
  for delete
  to authenticated
  using (user_id = auth.uid());
```

- [ ] **Step 6: Run Supabase helper tests and verify pass**

Run:

```bash
pnpm test tests/supabase/transactions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit task 2**

```bash
git add src/supabase/transactions.ts tests/supabase/transactions.test.ts supabase/migrations/20260708010000_allow_transaction_full_edits.sql
git commit -m "feat: add cloud transaction edit helpers"
```

---

### Task 3: Build Transaction Edit Screen

**Files:**
- Create: `src/ui/TransactionEditScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Test: `tests/ui/TransactionEditScreen.test.tsx`

- [ ] **Step 1: Write failing edit screen tests**

Create `tests/ui/TransactionEditScreen.test.tsx`:

```tsx
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import type { Transaction } from '../../src/types';

const transactionMocks = vi.hoisted(() => ({
  supabase: {},
  getCloudTransaction: vi.fn(),
  updateCloudTransaction: vi.fn(),
  deleteCloudTransaction: vi.fn(),
  addCloudTransaction: vi.fn(),
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return transactionMocks.supabase;
  },
}));

vi.mock('../../src/supabase/transactions', () => ({
  getCloudTransaction: transactionMocks.getCloudTransaction,
  updateCloudTransaction: transactionMocks.updateCloudTransaction,
  deleteCloudTransaction: transactionMocks.deleteCloudTransaction,
  addCloudTransaction: transactionMocks.addCloudTransaction,
}));

import { TransactionEditScreen } from '../../src/ui/TransactionEditScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('vi');
  transactionMocks.supabase = {};
  transactionMocks.getCloudTransaction.mockReset();
  transactionMocks.updateCloudTransaction.mockReset();
  transactionMocks.deleteCloudTransaction.mockReset();
  transactionMocks.addCloudTransaction.mockReset();
});

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    amount: 38560,
    currency: 'VND',
    occurredAt: '2026-07-08T04:14:42.000Z',
    merchant: 'Giao dịch chi tiêu tại Grab* BXTTDKA62JSE-G-3',
    category: 'transportation',
    direction: 'expense',
    source: 'bank-email',
    bankHint: 'mb',
    bank: 'MB',
    transactionType: 'card',
    rawSource: 'email',
    createdAt: '2026-07-08T04:14:45.000Z',
    updatedAt: '2026-07-08T04:14:45.000Z',
    ...overrides,
  } as Transaction;
}

function renderEdit(path = '/transactions/tx-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/transactions/:id" element={<TransactionEditScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransactionEditScreen', () => {
  it('renders editable fields, metadata, and direction-specific categories', async () => {
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());

    renderEdit();

    expect(await screen.findByRole('heading', { name: /chỉnh sửa/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ngày/i)).toHaveValue('2026-07-08T11:14');
    expect(screen.getByLabelText(/ghi chú/i)).toHaveValue('Giao dịch chi tiêu tại Grab* BXTTDKA62JSE-G-3');
    expect(screen.getByLabelText(/tiền chi/i)).toHaveValue(38560);
    expect(screen.getByText('Email ngân hàng')).toBeInTheDocument();
    expect(screen.getByText('MB')).toBeInTheDocument();
    expect(screen.getByText('MB Card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đi lại/i, pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lương/i })).not.toBeInTheDocument();
  });

  it('saves edited amount, date, text, and category', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    transactionMocks.updateCloudTransaction.mockResolvedValue(tx({ amount: 45000, category: 'food-drinks' }));

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.clear(screen.getByLabelText(/tiền chi/i));
    await user.type(screen.getByLabelText(/tiền chi/i), '45000');
    await user.clear(screen.getByLabelText(/ghi chú/i));
    await user.type(screen.getByLabelText(/ghi chú/i), 'Updated memo');
    await user.click(screen.getByRole('button', { name: /ăn uống/i }));
    await user.click(screen.getByRole('button', { name: /lưu thay đổi/i }));

    await waitFor(() => {
      expect(transactionMocks.updateCloudTransaction).toHaveBeenCalledWith(
        expect.anything(),
        'tx-1',
        expect.objectContaining({
          amount: 45000,
          content: 'Updated memo',
          merchant: 'Updated memo',
          note: null,
          category: 'food-drinks',
        }),
      );
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('confirms before deleting a transaction', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    transactionMocks.deleteCloudTransaction.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.click(screen.getByRole('button', { name: /xóa/i }));

    await waitFor(() => {
      expect(transactionMocks.deleteCloudTransaction).toHaveBeenCalledWith(expect.anything(), 'tx-1');
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('copies the visible transaction as a manual transaction', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    transactionMocks.addCloudTransaction.mockResolvedValue(tx({ source: 'manual', bank: undefined }));

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => {
      expect(transactionMocks.addCloudTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          amount: 38560,
          direction: 'expense',
          category: 'transportation',
          source: 'manual',
          merchant: 'Giao dịch chi tiêu tại Grab* BXTTDKA62JSE-G-3',
        }),
      );
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run edit screen tests and verify failure**

Run:

```bash
pnpm test tests/ui/TransactionEditScreen.test.tsx
```

Expected: FAIL because `TransactionEditScreen` does not exist.

- [ ] **Step 3: Add i18n labels**

Add to `src/i18n/vi.json`:

```json
"transactionEdit": {
  "title": "Chỉnh sửa",
  "date": "Ngày",
  "note": "Ghi chú",
  "expenseAmount": "Tiền chi",
  "incomeAmount": "Tiền thu",
  "category": "Danh mục",
  "source": "Nguồn",
  "bank": "Ngân hàng",
  "type": "Loại",
  "save": "Lưu thay đổi",
  "copy": "Copy",
  "delete": "Xóa",
  "deleteConfirm": "Xóa giao dịch này?",
  "loading": "Đang tải giao dịch...",
  "notFound": "Không tìm thấy giao dịch",
  "saveFailed": "Không thể lưu giao dịch",
  "deleteFailed": "Không thể xóa giao dịch",
  "copyFailed": "Không thể copy giao dịch",
  "sourceEmail": "Email ngân hàng",
  "sourceManual": "Thủ công",
  "sourceReceipt": "Ảnh hóa đơn",
  "sourceBankScreenshot": "Ảnh ngân hàng",
  "typeMbCard": "MB Card",
  "typeMbTransfer": "MB eBanking",
  "typeAcbBalance": "ACB biến động số dư",
  "typeManual": "Manual",
  "typeReceipt": "Receipt",
  "typeBankScreenshot": "Bank Screenshot"
}
```

Add equivalent English labels to `src/i18n/en.json`.

- [ ] **Step 4: Implement `TransactionEditScreen`**

Create `src/ui/TransactionEditScreen.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../lib/error';
import { supabase } from '../supabase/client';
import {
  addCloudTransaction,
  deleteCloudTransaction,
  getCloudTransaction,
  updateCloudTransaction,
} from '../supabase/transactions';
import {
  categoriesForDirection,
  categoryBelongsToDirection,
  type Category,
  type ExpenseCategory,
  type IncomeCategory,
  type Transaction,
} from '../types';
import { CATEGORY_META } from './theme/categoryMeta';

function toLocalDatetimeInput(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return parts.replace(' ', 'T');
}

function vietnamDatetimeInputToISO(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

function editableText(tx: Transaction): string {
  return tx.merchant ?? tx.note ?? '';
}

function sourceLabelKey(tx: Transaction): string {
  if (tx.source === 'bank-email') return 'transactionEdit.sourceEmail';
  if (tx.source === 'receipt') return 'transactionEdit.sourceReceipt';
  if (tx.source === 'bank-screenshot') return 'transactionEdit.sourceBankScreenshot';
  return 'transactionEdit.sourceManual';
}

function typeLabelKey(tx: Transaction): string {
  if (tx.bank === 'MB' && tx.transactionType === 'card') return 'transactionEdit.typeMbCard';
  if (tx.bank === 'MB' && tx.transactionType === 'transfer') return 'transactionEdit.typeMbTransfer';
  if (tx.bank === 'ACB' && tx.transactionType === 'balance_alert') return 'transactionEdit.typeAcbBalance';
  if (tx.transactionType === 'receipt') return 'transactionEdit.typeReceipt';
  if (tx.transactionType === 'bank_screenshot') return 'transactionEdit.typeBankScreenshot';
  return 'transactionEdit.typeManual';
}

export function TransactionEditScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [category, setCategory] = useState<Category | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !id) {
        setError(t('auth.setupError'));
        setLoading(false);
        return;
      }
      try {
        const loaded = await getCloudTransaction(supabase, id);
        if (cancelled) return;
        setTx(loaded);
        setAmount(String(loaded.amount));
        setDate(toLocalDatetimeInput(loaded.occurredAt));
        setText(editableText(loaded));
        setCategory(loaded.category);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [id, t]);

  const parsedAmount = Number.parseInt(amount || '0', 10);
  const categoryOptions = useMemo(
    () => tx ? categoriesForDirection(tx.direction) : [],
    [tx],
  );
  const canSave = Boolean(
    tx &&
    supabase &&
    id &&
    parsedAmount > 0 &&
    date &&
    category &&
    categoryBelongsToDirection(category, tx.direction) &&
    !saving,
  );

  async function handleSave() {
    if (!canSave || !tx || !category || !supabase || !id) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = text.trim();
      await updateCloudTransaction(supabase, id, {
        amount: parsedAmount,
        occurredAt: vietnamDatetimeInputToISO(date),
        content: trimmed || category,
        merchant: tx.merchant !== undefined ? trimmed || null : null,
        note: tx.note !== undefined ? trimmed || null : null,
        category,
      });
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!tx || !category || !supabase) return;
    setSaving(true);
    setError(null);
    try {
      const fieldText = text.trim() || undefined;
      if (tx.direction === 'income') {
        await addCloudTransaction(supabase, {
          amount: parsedAmount,
          currency: 'VND',
          occurredAt: vietnamDatetimeInputToISO(date),
          direction: 'income',
          category: category as IncomeCategory,
          source: 'manual',
          note: fieldText,
        });
      } else {
        await addCloudTransaction(supabase, {
          amount: parsedAmount,
          currency: 'VND',
          occurredAt: vietnamDatetimeInputToISO(date),
          direction: 'expense',
          category: category as ExpenseCategory,
          source: 'manual',
          merchant: fieldText,
        });
      }
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!supabase || !id || !window.confirm(t('transactionEdit.deleteConfirm'))) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCloudTransaction(supabase, id);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="px-4 py-6 text-sm text-slate-400">{t('transactionEdit.loading')}</div>;
  if (!tx) {
    return (
      <div className="px-4 py-6 text-slate-100">
        <Link to="/" className="text-sky-300">{t('reports.backToReports')}</Link>
        <div className="mt-4">{error ?? t('transactionEdit.notFound')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-24 text-slate-50">
      <header className="grid h-16 grid-cols-[5rem_1fr_5rem] items-center border-b border-white/10 px-3">
        <Link to="/" className="text-base font-semibold text-sky-400"><ChevronLeft className="inline h-5 w-5" /> Home</Link>
        <h1 className="text-center text-xl font-bold">{t('transactionEdit.title')}</h1>
        <div className="text-right text-slate-300"><Pencil className="ml-auto h-5 w-5" /></div>
      </header>
      <section className="bg-[#151617]">
        <label className="grid min-h-14 grid-cols-[6rem_1fr] items-center border-b border-white/10 px-3">
          <span className="font-bold">{t('transactionEdit.date')}</span>
          <input className="rounded-lg bg-[#333335] px-3 py-2 font-semibold" type="datetime-local" value={date} onChange={event => setDate(event.target.value)} aria-label={t('transactionEdit.date')} />
        </label>
        <label className="grid min-h-14 grid-cols-[6rem_1fr] items-center border-b border-white/10 px-3">
          <span className="font-bold">{t('transactionEdit.note')}</span>
          <input className="rounded-lg bg-[#333335] px-3 py-2 font-semibold" value={text} onChange={event => setText(event.target.value)} aria-label={t('transactionEdit.note')} />
        </label>
        <label className="grid min-h-14 grid-cols-[6rem_1fr] items-center border-b border-white/10 px-3">
          <span className="font-bold">{t(tx.direction === 'income' ? 'transactionEdit.incomeAmount' : 'transactionEdit.expenseAmount')}</span>
          <input className="rounded-lg bg-[#333335] px-3 py-2 text-2xl font-bold" type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} aria-label={t(tx.direction === 'income' ? 'transactionEdit.incomeAmount' : 'transactionEdit.expenseAmount')} />
        </label>
      </section>
      <section className="mt-3 bg-[#151617] px-3 py-3 text-sm">
        <dl className="grid gap-2">
          <div className="grid grid-cols-[6rem_1fr]"><dt className="text-slate-400">{t('transactionEdit.source')}</dt><dd>{t(sourceLabelKey(tx))}</dd></div>
          <div className="grid grid-cols-[6rem_1fr]"><dt className="text-slate-400">{t('transactionEdit.bank')}</dt><dd>{tx.bank ?? '-'}</dd></div>
          <div className="grid grid-cols-[6rem_1fr]"><dt className="text-slate-400">{t('transactionEdit.type')}</dt><dd>{t(typeLabelKey(tx))}</dd></div>
        </dl>
      </section>
      <section className="mt-3 bg-[#151617] px-3 pb-5">
        <h2 className="py-4 text-lg font-bold">{t('transactionEdit.category')}</h2>
        <div className="grid grid-cols-3 gap-2">
          {categoryOptions.map(option => {
            const meta = CATEGORY_META[option];
            const Icon = meta.Icon;
            return (
              <button key={option} type="button" aria-pressed={category === option} onClick={() => setCategory(option)} className="min-h-20 rounded-lg border border-white/10 bg-[#171819] text-sm aria-pressed:border-sky-300 aria-pressed:ring-1 aria-pressed:ring-sky-300">
                <Icon aria-hidden="true" className={`mx-auto mb-1 h-7 w-7 ${meta.accentClass}`} />
                {t(`category.${option}`)}
              </button>
            );
          })}
        </div>
      </section>
      {error && <div role="alert" className="mx-3 mt-3 rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[460px] bg-black/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
        <button type="button" disabled={!canSave} onClick={handleSave} className="min-h-13 w-full rounded-full bg-[#636366] font-bold text-white disabled:opacity-50">{saving ? t('add.saving') : t('transactionEdit.save')}</button>
        <div className="mt-3 flex justify-between">
          <button type="button" disabled={saving} onClick={handleCopy} className="text-sky-400">{t('transactionEdit.copy')}</button>
          <button type="button" disabled={saving} onClick={handleDelete} className="text-sky-400">{t('transactionEdit.delete')}</button>
        </div>
      </div>
    </div>
  );
}
```

This implementation intentionally uses the approved Money Note black/gray form structure and keeps the manual copy path explicit for income versus expense transactions.

- [ ] **Step 5: Add route**

Update `src/App.tsx`:

```tsx
import { TransactionEditScreen } from './ui/TransactionEditScreen';
```

Add route inside the layout:

```tsx
<Route path="transactions/:id" element={<TransactionEditScreen />} />
```

- [ ] **Step 6: Run edit screen tests and verify pass**

Run:

```bash
pnpm test tests/ui/TransactionEditScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit task 3**

```bash
git add src/ui/TransactionEditScreen.tsx src/App.tsx src/i18n/vi.json src/i18n/en.json tests/ui/TransactionEditScreen.test.tsx
git commit -m "feat: add money note transaction editor"
```

---

### Task 4: Redesign Home And Transaction Rows

**Files:**
- Modify: `src/ui/HomeScreen.tsx`
- Modify: `src/ui/components/TransactionRow.tsx`
- Modify: `src/ui/components/primitives/BottomNav.tsx`
- Test: `tests/ui/HomeScreen.test.tsx`

- [ ] **Step 1: Rewrite failing Home tests for row links**

In `tests/ui/HomeScreen.test.tsx`, remove tests that assert inline combobox category updates. Replace with:

```tsx
it('renders recent transaction rows as links to detail screens', () => {
  cloudHooks.recentState.data = [
    tx({ id: 'email-1', merchant: 'Grab* BXTTDKA62JSE', amount: 38_560, category: 'transportation' }),
    tx({ id: 'income-1', amount: 6_666, direction: 'income', category: 'temporary-income', note: 'ACB Ghi có' }),
  ];

  render(<MemoryRouter><HomeScreen /></MemoryRouter>);

  expect(screen.getByRole('link', { name: /Grab.*38/i })).toHaveAttribute('href', '/transactions/email-1');
  expect(screen.getByRole('link', { name: /ACB Ghi có.*6/i })).toHaveAttribute('href', '/transactions/income-1');
  expect(screen.queryByRole('combobox', { name: /Transaction category/ })).not.toBeInTheDocument();
});
```

Update the first Home test so it checks links/list rows rather than comboboxes:

```ts
const rows = screen.getAllByRole('listitem');
expect(rows).toHaveLength(3);
expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/transactions/recent-1');
expect(within(rows[2]).getByRole('link')).toHaveAttribute('href', '/transactions/recent-3');
```

- [ ] **Step 2: Run Home tests and verify failure**

Run:

```bash
pnpm test tests/ui/HomeScreen.test.tsx
```

Expected: FAIL because Home still renders inline category selects.

- [ ] **Step 3: Make `TransactionRow` a tappable Money Note row**

Update `src/ui/components/TransactionRow.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import type { Transaction } from '../../types';
import { CATEGORY_META } from '../theme/categoryMeta';

interface TransactionRowProps {
  t: Transaction;
  locale: 'vi' | 'en';
}

export function TransactionRow({ t: tx, locale }: TransactionRowProps) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[tx.category];
  const Icon = meta.Icon;
  const signedAmount = tx.direction === 'income'
    ? `+${formatVND(tx.amount, locale)}`
    : formatVND(tx.amount, locale);
  const title = tx.merchant?.trim() || tx.note?.trim() || t(`category.${tx.category}`);
  const subtitle = `${t(`category.${tx.category}`)} · ${formatTransactionDate(tx.occurredAt, locale)}`;

  return (
    <li>
      <Link
        to={`/transactions/${tx.id}`}
        className="grid min-h-[4.25rem] grid-cols-[2.75rem_1fr_auto_1.25rem] items-center gap-2 border-b border-white/10 bg-black px-3 py-2 text-slate-50"
        aria-label={`${title} ${subtitle} ${signedAmount}`}
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg">
          <Icon aria-hidden="true" className={`h-7 w-7 ${meta.accentClass}`} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-bold">{title}</span>
          <span className="block truncate text-xs text-zinc-400">{subtitle}</span>
        </span>
        <span className={tx.direction === 'income' ? 'text-base font-bold text-emerald-400' : 'text-base font-bold text-zinc-50'}>
          {signedAmount}
        </span>
        <ChevronRight aria-hidden="true" className="h-5 w-5 text-zinc-500" />
      </Link>
    </li>
  );
}
```

Keep `formatTransactionDate` at the bottom.

- [ ] **Step 4: Redesign Home layout**

Update `src/ui/HomeScreen.tsx` to:

- Remove `supabase`, `updateCloudTransactionCategory`, `categoryEditError`, `editingCategoryId`, `transactionCategoryLabel`, and `handleCategoryChange`.
- Keep budget/cloud error handling.
- Replace glass overview with black/gray Money Note summary bands:

```tsx
<div className="min-h-screen bg-black text-zinc-50">
  <header className="border-b border-white/10 px-4 pb-3 pt-5 text-center">
    <h1 className="text-xl font-bold">{t('nav.home')}</h1>
  </header>
  <div className="mx-4 mt-3 grid min-h-11 grid-cols-[2.5rem_1fr_2.5rem] items-center rounded-lg bg-zinc-800 text-center">
    <span className="text-2xl text-zinc-300">‹</span>
    <span className="text-lg font-bold">{formatMonthLabel(month)}</span>
    <span className="text-2xl text-zinc-300">›</span>
  </div>
  <section className="grid grid-cols-3 gap-2 px-3 py-3">
    ...
  </section>
  ...
</div>
```

Use compact summary cells:

```tsx
function SummaryCell({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' | 'neutral' }) {
  const toneClass = tone === 'income' ? 'text-sky-400' : tone === 'expense' ? 'text-red-400' : 'text-zinc-50';
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black px-2 py-2">
      <div className="truncate text-xs font-semibold text-zinc-300">{label}</div>
      <div className={`mt-1 truncate text-sm font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
```

Add a small month helper in `HomeScreen.tsx` so `2026-07` displays as `07/2026`:

```ts
function formatMonthLabel(month: string): string {
  const [year, value] = month.split('-');
  return `${value}/${year}`;
}
```

Render recent transactions:

```tsx
<section>
  <div className="flex h-7 items-center justify-between bg-zinc-700 px-3 text-xs font-bold text-zinc-100">
    <span>{t('home.lastTransactions')}</span>
    <span>{monthValue(monthTotals.net)}</span>
  </div>
  {recentLoading ? ... : (
    <ul className="bg-black">
      {recent.map(tx => (
        <TransactionRow key={tx.id} t={tx} locale={locale} />
      ))}
    </ul>
  )}
</section>
```

- [ ] **Step 5: Align BottomNav flatter**

Update `src/ui/components/primitives/BottomNav.tsx` to reduce glass styling:

```tsx
className={`fixed inset-x-0 bottom-0 z-30 mx-auto ${APP_SHELL_MAX_WIDTH_CLASS} border-t border-white/10 bg-black px-3 pb-[calc(env(safe-area-inset-bottom)+0.25rem)]`}
```

Keep the center plus button, but use a flatter gray/blue style:

```tsx
<span className="absolute -top-7 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-white shadow-[0_0_18px_rgba(10,132,255,0.22)]">
```

- [ ] **Step 6: Run Home tests and verify pass**

Run:

```bash
pnpm test tests/ui/HomeScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit task 4**

```bash
git add src/ui/HomeScreen.tsx src/ui/components/TransactionRow.tsx src/ui/components/primitives/BottomNav.tsx tests/ui/HomeScreen.test.tsx
git commit -m "feat: redesign home as money note list"
```

---

### Task 5: Full Verification And Browser QA

**Files:**
- No new source files expected.
- Possible minor fixes in files from Tasks 1-4.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
pnpm test
pnpm exec tsc -b
pnpm run lint
pnpm run build
```

Expected:

- Tests pass.
- TypeScript passes.
- Lint passes with only the known existing warnings in extractor regex files and `categoryMeta`.
- Build passes; existing chunk-size warning is acceptable.

- [ ] **Step 2: Apply Supabase migration locally/remotely**

For local or linked Supabase project, run:

```bash
npx supabase db push
```

Expected: migration `20260708010000_allow_transaction_full_edits.sql` is applied. If network/auth blocks this in Codex, report that the user must run it locally before testing edit/delete on the real Supabase database.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: Vite serves the app on an available localhost URL.

- [ ] **Step 4: Browser smoke test**

Using the in-app browser:

- Open Home.
- Confirm Home uses the black Money Note-like layout.
- Confirm no inline category select appears in transaction rows.
- Click a recent transaction row.
- Confirm `/transactions/:id` opens.
- Confirm source/bank/type metadata is visible.
- Edit category, amount, and note, then save.
- Reopen the row and confirm the saved values remain.
- Test delete on a disposable transaction.

- [ ] **Step 5: Final status**

Summarize:

- Changed files.
- Tests and build run.
- Whether Supabase migration was applied or still needs user action.
- Local dev URL for iPhone/browser testing.
