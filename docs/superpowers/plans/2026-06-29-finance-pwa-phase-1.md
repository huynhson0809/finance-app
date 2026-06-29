# Finance PWA — Phase 1 Implementation Plan (Skeleton + Manual Entry)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, installable React PWA that lets the user manually enter VND transactions and view today's spend, a budget bar, and the last 5 transactions — all stored in IndexedDB, with `vi`/`en` UI toggling.

**Architecture:** Pure client-side SPA. Vite builds a static bundle; React + Tailwind render the UI; `idb` wraps IndexedDB for typed CRUD; `react-i18next` handles locale; React Router v6 powers the 3 screens. No backend. Phase 1 deliberately omits categorization, charts, OCR, and the service worker — those land in later phases. The IndexedDB schema is the full schema from the spec so later phases don't need a migration.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, `idb`, `react-i18next`, `react-router-dom`, Vitest, `@testing-library/react`, `fake-indexeddb`.

## Global Constraints

- All amounts stored as **integer VND** (no floats anywhere).
- All dates stored as **ISO 8601 strings**.
- `Category` is a closed string-literal union — never widen it ad hoc; only the values in `src/types.ts`.
- IndexedDB access goes through `src/db/*` only. No other module imports `idb` directly.
- UI strings live in `src/i18n/{vi,en}.json`. No literal user-facing strings in components.
- TDD: every task writes the failing test first, watches it fail, then implements.
- Commit at the end of every task. Conventional Commits style.
- Node ≥ 20, package manager = `pnpm`.

---

## File Structure

```
finance-app/
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types.ts
│   ├── styles.css
│   ├── db/
│   │   ├── index.ts
│   │   ├── transactions.ts
│   │   ├── budgets.ts
│   │   └── settings.ts
│   ├── lib/
│   │   ├── money.ts
│   │   └── date.ts
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── vi.json
│   │   └── en.json
│   ├── hooks/
│   │   ├── useTransactions.ts
│   │   └── useBudget.ts
│   └── ui/
│       ├── Layout.tsx
│       ├── HomeScreen.tsx
│       ├── AddScreen.tsx
│       ├── SettingsScreen.tsx
│       └── components/
│           ├── Keypad.tsx
│           ├── CategoryChips.tsx
│           ├── BudgetBar.tsx
│           └── TransactionRow.tsx
└── tests/
    ├── setup.ts
    ├── db/
    │   ├── transactions.test.ts
    │   ├── budgets.test.ts
    │   └── settings.test.ts
    ├── lib/
    │   ├── money.test.ts
    │   └── date.test.ts
    └── ui/
        ├── AddScreen.test.tsx
        └── HomeScreen.test.tsx
```

---

## Task 1: Project bootstrap

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `tests/setup.ts`, `.gitignore`

**Interfaces:**
- Produces: a runnable `pnpm dev` server showing "Hello finance-app" and a green `pnpm test` baseline.

- [ ] **Step 1: Scaffold with Vite**

```bash
pnpm create vite@latest . --template react-ts
```
When prompted to overwrite the non-empty directory, choose **Ignore files and continue**.

- [ ] **Step 2: Install runtime + dev dependencies**

```bash
pnpm add react-router-dom@6 idb react-i18next i18next
pnpm add -D tailwindcss@3 postcss autoprefixer vitest @vitest/ui \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  jsdom fake-indexeddb
pnpm exec tailwindcss init -p
```

- [ ] **Step 3: Configure Tailwind**

Replace `tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

Replace `src/styles.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

In `src/main.tsx`, import `./styles.css` (and delete `src/index.css` if Vite created one).

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

Create `tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

In `tsconfig.json`, add `"types": ["vitest/globals", "@testing-library/jest-dom"]` to `compilerOptions`.

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Replace App.tsx with a minimal placeholder**

```tsx
export default function App() {
  return <div className="p-4 text-xl">Hello finance-app</div>;
}
```

- [ ] **Step 6: Verify dev and test run**

```bash
pnpm dev      # visit http://localhost:5173, see "Hello finance-app"; ctrl-c
pnpm test     # no tests found is OK; should exit 0
pnpm build    # should succeed
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + react + tailwind + vitest"
```

---

## Task 2: Domain types and constants

**Files:**
- Create: `src/types.ts`

**Interfaces:**
- Produces:
  - `Category` (string-literal union): `'food-drinks' | 'coffee-bubble-tea' | 'transportation' | 'shopping' | 'bills-utilities' | 'healthcare' | 'entertainment' | 'transfers-debt' | 'others'`
  - `CATEGORIES: readonly Category[]` (declaration order is display order)
  - `Transaction`, `Budget`, `CategoryRule`, `Setting` interfaces exactly as in the spec § 6
  - `TransactionSource = 'manual' | 'receipt' | 'bank-screenshot'`

- [ ] **Step 1: Write `src/types.ts`**

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

export const CATEGORIES: readonly Category[] = [
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

export type TransactionSource = 'manual' | 'receipt' | 'bank-screenshot';
export type BankHint = 'vietcombank' | 'techcombank' | 'momo' | 'zalopay';

export interface Transaction {
  id: string;
  amount: number;         // integer VND
  currency: 'VND';
  occurredAt: string;     // ISO 8601
  merchant?: string;
  category: Category;
  note?: string;
  source: TransactionSource;
  bankHint?: BankHint;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  month: string;          // 'YYYY-MM'
  total: number;          // integer VND
  caps: Partial<Record<Category, number>>;
}

export interface CategoryRule {
  id: string;
  pattern: string;
  category: Category;
  weight: number;
  learned: boolean;
}

export interface Setting<T = unknown> {
  key: string;
  value: T;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: define core domain types"
```

---

## Task 3: Money + date utilities (TDD)

**Files:**
- Create: `src/lib/money.ts`, `src/lib/date.ts`, `tests/lib/money.test.ts`, `tests/lib/date.test.ts`

**Interfaces:**
- Produces:
  - `formatVND(amount: number, locale: 'vi' | 'en'): string` — e.g. `45000` → `'45.000 ₫'` (vi) or `'₫45,000'` (en).
  - `parseVNDInput(raw: string): number` — accepts `'45.000'`, `'45,000'`, `'45000'` → `45000`. Returns `NaN` for unparseable input.
  - `todayISO(): string` — ISO date for *today's local midnight*.
  - `monthOf(iso: string): string` — `'2026-06-29...'` → `'2026-06'`.
  - `isSameDay(a: string, b: string): boolean`.

- [ ] **Step 1: Write `tests/lib/money.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { formatVND, parseVNDInput } from '../../src/lib/money';

describe('formatVND', () => {
  it('formats vi locale with dot thousands and trailing đ', () => {
    expect(formatVND(45000, 'vi')).toBe('45.000 ₫');
  });
  it('formats en locale with comma thousands and leading ₫', () => {
    expect(formatVND(45000, 'en')).toBe('₫45,000');
  });
  it('handles zero', () => {
    expect(formatVND(0, 'vi')).toBe('0 ₫');
  });
});

describe('parseVNDInput', () => {
  it.each([
    ['45000', 45000],
    ['45.000', 45000],
    ['45,000', 45000],
    ['1.234.567', 1234567],
    ['', NaN],
    ['abc', NaN],
  ])('parses %s → %s', (input, expected) => {
    const got = parseVNDInput(input);
    if (Number.isNaN(expected)) expect(Number.isNaN(got)).toBe(true);
    else expect(got).toBe(expected);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test tests/lib/money.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/money.ts`**

```ts
const VI = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const EN = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND', currencyDisplay: 'narrowSymbol' });

export function formatVND(amount: number, locale: 'vi' | 'en'): string {
  return (locale === 'vi' ? VI : EN).format(Math.round(amount));
}

export function parseVNDInput(raw: string): number {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return NaN;
  return parseInt(cleaned, 10);
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test tests/lib/money.test.ts
```
Expected: PASS. If the vi formatter outputs a slightly different glyph than `₫` (Intl differences across Node versions), update the test fixture to whatever `formatVND` actually returns and re-run.

- [ ] **Step 5: Write `tests/lib/date.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { todayISO, monthOf, isSameDay } from '../../src/lib/date';

describe('date helpers', () => {
  it('monthOf extracts YYYY-MM', () => {
    expect(monthOf('2026-06-29T10:00:00.000Z')).toBe('2026-06');
  });
  it('todayISO is parseable', () => {
    expect(() => new Date(todayISO()).toISOString()).not.toThrow();
  });
  it('isSameDay compares calendar days in local time', () => {
    const a = new Date(2026, 5, 29, 1, 0).toISOString();
    const b = new Date(2026, 5, 29, 23, 0).toISOString();
    const c = new Date(2026, 5, 30, 1, 0).toISOString();
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });
});
```

- [ ] **Step 6: Implement `src/lib/date.ts`**

```ts
export function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
```

- [ ] **Step 7: Run all lib tests, expect pass**

```bash
pnpm test tests/lib
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib tests/lib
git commit -m "feat: add money + date utilities with tests"
```

---

## Task 4: IndexedDB schema + transactions store

**Files:**
- Create: `src/db/index.ts`, `src/db/transactions.ts`, `tests/db/transactions.test.ts`

**Interfaces:**
- Produces:
  - `openFinanceDB(): Promise<IDBPDatabase<FinanceSchema>>` — opens v1 with stores `transactions`, `budgets`, `categoryRules`, `settings` (full spec schema; later stores stay empty in Phase 1).
  - `addTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction>`
  - `listTransactions(opts?: { sinceISO?: string; limit?: number }): Promise<Transaction[]>` — newest first by `occurredAt`.
  - `getTodayTotal(): Promise<number>` — sum of `amount` for transactions whose `occurredAt` is today.

- [ ] **Step 1: Write `tests/db/transactions.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { addTransaction, listTransactions, getTodayTotal } from '../../src/db/transactions';
import { openFinanceDB } from '../../src/db';

beforeEach(async () => {
  indexedDB.deleteDatabase('finance-app');
  await openFinanceDB();
});

describe('transactions store', () => {
  it('adds a transaction and returns it with id + timestamps', async () => {
    const t = await addTransaction({
      amount: 45000, currency: 'VND',
      occurredAt: new Date().toISOString(),
      category: 'food-drinks', source: 'manual',
    });
    expect(t.id).toMatch(/.+/);
    expect(t.createdAt).toMatch(/.+/);
    expect(t.amount).toBe(45000);
  });

  it('lists transactions newest first', async () => {
    const earlier = new Date(2026, 0, 1).toISOString();
    const later = new Date(2026, 5, 1).toISOString();
    await addTransaction({ amount: 1, currency: 'VND', occurredAt: earlier, category: 'others', source: 'manual' });
    await addTransaction({ amount: 2, currency: 'VND', occurredAt: later, category: 'others', source: 'manual' });
    const got = await listTransactions();
    expect(got.map(t => t.amount)).toEqual([2, 1]);
  });

  it('limit returns at most N', async () => {
    for (let i = 0; i < 7; i++) {
      await addTransaction({
        amount: i + 1, currency: 'VND',
        occurredAt: new Date(2026, 0, i + 1).toISOString(),
        category: 'others', source: 'manual',
      });
    }
    const got = await listTransactions({ limit: 5 });
    expect(got).toHaveLength(5);
  });

  it('getTodayTotal sums today only', async () => {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    await addTransaction({ amount: 10000, currency: 'VND', occurredAt: today.toISOString(), category: 'others', source: 'manual' });
    await addTransaction({ amount: 99999, currency: 'VND', occurredAt: yesterday.toISOString(), category: 'others', source: 'manual' });
    expect(await getTodayTotal()).toBe(10000);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test tests/db/transactions.test.ts
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/db/index.ts`**

```ts
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { Transaction, Budget, CategoryRule, Setting } from '../types';

export interface FinanceSchema extends DBSchema {
  transactions: { key: string; value: Transaction; indexes: { byOccurredAt: string } };
  budgets:      { key: string; value: Budget;      indexes: { byMonth: string } };
  categoryRules:{ key: string; value: CategoryRule };
  settings:     { key: string; value: Setting };
}

let dbPromise: Promise<IDBPDatabase<FinanceSchema>> | null = null;

export function openFinanceDB(): Promise<IDBPDatabase<FinanceSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<FinanceSchema>('finance-app', 1, {
      upgrade(db) {
        const tx = db.createObjectStore('transactions', { keyPath: 'id' });
        tx.createIndex('byOccurredAt', 'occurredAt');
        const bg = db.createObjectStore('budgets', { keyPath: 'id' });
        bg.createIndex('byMonth', 'month', { unique: true });
        db.createObjectStore('categoryRules', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export function __resetDBForTests() { dbPromise = null; }
```

- [ ] **Step 4: Implement `src/db/transactions.ts`**

```ts
import { openFinanceDB } from './index';
import { isSameDay } from '../lib/date';
import type { Transaction } from '../types';

function newId() { return crypto.randomUUID(); }
function now()   { return new Date().toISOString(); }

export async function addTransaction(
  input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Transaction> {
  const db = await openFinanceDB();
  const t: Transaction = { ...input, id: newId(), createdAt: now(), updatedAt: now() };
  await db.put('transactions', t);
  return t;
}

export async function listTransactions(
  opts: { sinceISO?: string; limit?: number } = {},
): Promise<Transaction[]> {
  const db = await openFinanceDB();
  const all = await db.getAllFromIndex('transactions', 'byOccurredAt');
  let out = all.reverse(); // newest first
  if (opts.sinceISO) out = out.filter(t => t.occurredAt >= opts.sinceISO!);
  if (opts.limit != null) out = out.slice(0, opts.limit);
  return out;
}

export async function getTodayTotal(): Promise<number> {
  const today = new Date().toISOString();
  const all = await listTransactions();
  return all.filter(t => isSameDay(t.occurredAt, today)).reduce((s, t) => s + t.amount, 0);
}
```

Update `tests/setup.ts` to reset the cached db between tests:
```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { __resetDBForTests } from '../src/db';
beforeEach(() => { __resetDBForTests(); });
```

- [ ] **Step 5: Run, expect pass**

```bash
pnpm test tests/db/transactions.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db tests/db tests/setup.ts
git commit -m "feat: indexeddb schema + transactions store"
```

---

## Task 5: Budgets store

**Files:**
- Create: `src/db/budgets.ts`, `tests/db/budgets.test.ts`

**Interfaces:**
- Consumes: `openFinanceDB` from `src/db/index.ts`.
- Produces:
  - `upsertBudget(month: string, total: number, caps?: Partial<Record<Category, number>>): Promise<Budget>`
  - `getBudgetForMonth(month: string): Promise<Budget | undefined>`

- [ ] **Step 1: Write `tests/db/budgets.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { upsertBudget, getBudgetForMonth } from '../../src/db/budgets';

describe('budgets store', () => {
  it('upserts and reads back by month', async () => {
    await upsertBudget('2026-06', 5_000_000);
    const got = await getBudgetForMonth('2026-06');
    expect(got?.total).toBe(5_000_000);
    expect(got?.caps).toEqual({});
  });

  it('overwrites existing budget for the same month', async () => {
    await upsertBudget('2026-06', 5_000_000);
    await upsertBudget('2026-06', 6_000_000, { 'coffee-bubble-tea': 200_000 });
    const got = await getBudgetForMonth('2026-06');
    expect(got?.total).toBe(6_000_000);
    expect(got?.caps).toEqual({ 'coffee-bubble-tea': 200_000 });
  });

  it('returns undefined when no budget exists', async () => {
    expect(await getBudgetForMonth('2030-01')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test tests/db/budgets.test.ts
```

- [ ] **Step 3: Implement `src/db/budgets.ts`**

```ts
import { openFinanceDB } from './index';
import type { Budget, Category } from '../types';

export async function upsertBudget(
  month: string,
  total: number,
  caps: Partial<Record<Category, number>> = {},
): Promise<Budget> {
  const db = await openFinanceDB();
  const existing = await db.getFromIndex('budgets', 'byMonth', month);
  const budget: Budget = {
    id: existing?.id ?? crypto.randomUUID(),
    month, total, caps,
  };
  await db.put('budgets', budget);
  return budget;
}

export async function getBudgetForMonth(month: string): Promise<Budget | undefined> {
  const db = await openFinanceDB();
  return db.getFromIndex('budgets', 'byMonth', month);
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test tests/db/budgets.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/db/budgets.ts tests/db/budgets.test.ts
git commit -m "feat: budgets store"
```

---

## Task 6: Settings store

**Files:**
- Create: `src/db/settings.ts`, `tests/db/settings.test.ts`

**Interfaces:**
- Consumes: `openFinanceDB`.
- Produces:
  - `getSetting<T>(key: string): Promise<T | undefined>`
  - `setSetting<T>(key: string, value: T): Promise<void>`

- [ ] **Step 1: Test**

```ts
// tests/db/settings.test.ts
import { describe, it, expect } from 'vitest';
import { getSetting, setSetting } from '../../src/db/settings';

describe('settings store', () => {
  it('returns undefined for missing keys', async () => {
    expect(await getSetting('locale')).toBeUndefined();
  });
  it('round-trips string values', async () => {
    await setSetting('locale', 'vi');
    expect(await getSetting<string>('locale')).toBe('vi');
  });
  it('round-trips object values', async () => {
    await setSetting('flags', { foo: true });
    expect(await getSetting('flags')).toEqual({ foo: true });
  });
});
```

- [ ] **Step 2: Run, expect failure**
```bash
pnpm test tests/db/settings.test.ts
```

- [ ] **Step 3: Implement `src/db/settings.ts`**

```ts
import { openFinanceDB } from './index';

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const db = await openFinanceDB();
  const row = await db.get('settings', key);
  return row?.value as T | undefined;
}

export async function setSetting<T = unknown>(key: string, value: T): Promise<void> {
  const db = await openFinanceDB();
  await db.put('settings', { key, value });
}
```

- [ ] **Step 4: Run, expect pass**
```bash
pnpm test tests/db/settings.test.ts
```

- [ ] **Step 5: Commit**
```bash
git add src/db/settings.ts tests/db/settings.test.ts
git commit -m "feat: settings store"
```

---

## Task 7: i18n setup (vi + en)

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/vi.json`, `src/i18n/en.json`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: `initI18n(initialLocale?: 'vi' | 'en'): Promise<void>` initializes `react-i18next` with the locale persisted in settings (key `locale`); defaults to `vi`. Components use `useTranslation()` from `react-i18next`.

- [ ] **Step 1: Create `src/i18n/vi.json`**

```json
{
  "app": { "title": "Quản lý chi tiêu" },
  "nav": { "home": "Trang chủ", "add": "Thêm", "settings": "Cài đặt" },
  "home": {
    "todaySpend": "Chi hôm nay",
    "remaining": "Còn lại trong tháng",
    "lastTransactions": "Giao dịch gần đây",
    "noBudget": "Chưa đặt ngân sách",
    "empty": "Chưa có giao dịch nào"
  },
  "add": {
    "title": "Thêm giao dịch",
    "amount": "Số tiền",
    "category": "Danh mục",
    "note": "Ghi chú (tuỳ chọn)",
    "save": "Lưu",
    "cancel": "Huỷ"
  },
  "settings": {
    "title": "Cài đặt",
    "language": "Ngôn ngữ",
    "monthlyBudget": "Ngân sách hàng tháng",
    "save": "Lưu"
  },
  "category": {
    "food-drinks": "Ăn uống",
    "coffee-bubble-tea": "Cà phê & Trà sữa",
    "transportation": "Đi lại",
    "shopping": "Mua sắm",
    "bills-utilities": "Hoá đơn & Tiện ích",
    "healthcare": "Sức khoẻ",
    "entertainment": "Giải trí",
    "transfers-debt": "Chuyển khoản & Trả nợ",
    "others": "Khác"
  }
}
```

- [ ] **Step 2: Create `src/i18n/en.json`** (mirror keys, English strings)

```json
{
  "app": { "title": "Finance" },
  "nav": { "home": "Home", "add": "Add", "settings": "Settings" },
  "home": {
    "todaySpend": "Today's spend",
    "remaining": "Remaining this month",
    "lastTransactions": "Recent transactions",
    "noBudget": "No budget set",
    "empty": "No transactions yet"
  },
  "add": {
    "title": "Add transaction",
    "amount": "Amount",
    "category": "Category",
    "note": "Note (optional)",
    "save": "Save",
    "cancel": "Cancel"
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "monthlyBudget": "Monthly budget",
    "save": "Save"
  },
  "category": {
    "food-drinks": "Food & Drinks",
    "coffee-bubble-tea": "Coffee & Bubble Tea",
    "transportation": "Transportation",
    "shopping": "Shopping",
    "bills-utilities": "Bills & Utilities",
    "healthcare": "Healthcare",
    "entertainment": "Entertainment",
    "transfers-debt": "Transfers & Debt Repayment",
    "others": "Others"
  }
}
```

- [ ] **Step 3: Create `src/i18n/index.ts`**

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './vi.json';
import en from './en.json';
import { getSetting, setSetting } from '../db/settings';

export type Locale = 'vi' | 'en';

export async function initI18n(): Promise<void> {
  const stored = (await getSetting<Locale>('locale')) ?? 'vi';
  await i18n.use(initReactI18next).init({
    resources: { vi: { translation: vi }, en: { translation: en } },
    lng: stored,
    fallbackLng: 'vi',
    interpolation: { escapeValue: false },
  });
}

export async function setLocale(locale: Locale): Promise<void> {
  await setSetting('locale', locale);
  await i18n.changeLanguage(locale);
}

export { i18n };
```

- [ ] **Step 4: Wire into `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { initI18n } from './i18n';

initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
```

- [ ] **Step 5: Update `App.tsx` to verify translation works**

```tsx
import { useTranslation } from 'react-i18next';
export default function App() {
  const { t } = useTranslation();
  return <div className="p-4 text-xl">{t('app.title')}</div>;
}
```

- [ ] **Step 6: Verify**

```bash
pnpm dev   # see "Quản lý chi tiêu"; ctrl-c
pnpm test  # all green
pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/i18n src/main.tsx src/App.tsx
git commit -m "feat: i18n with vi + en locales"
```

---

## Task 8: Layout + tab navigation

**Files:**
- Create: `src/ui/Layout.tsx`, `src/ui/HomeScreen.tsx`, `src/ui/AddScreen.tsx`, `src/ui/SettingsScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: routes `/` (home), `/add`, `/settings`. Layout renders a fixed bottom tab bar with three icons + i18n labels.

- [ ] **Step 1: Stub screens**

```tsx
// src/ui/HomeScreen.tsx
import { useTranslation } from 'react-i18next';
export function HomeScreen() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-2xl">{t('home.todaySpend')}</h1>;
}
```
Similarly stub `AddScreen.tsx` (`add.title`) and `SettingsScreen.tsx` (`settings.title`).

- [ ] **Step 2: Implement `src/ui/Layout.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function Layout() {
  const { t } = useTranslation();
  const tab = 'flex-1 py-3 text-center text-sm';
  const active = ({ isActive }: { isActive: boolean }) =>
    `${tab} ${isActive ? 'font-bold text-blue-600' : 'text-gray-600'}`;
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 pb-16"><Outlet /></main>
      <nav className="fixed bottom-0 inset-x-0 flex bg-white border-t">
        <NavLink to="/" end className={active}>{t('nav.home')}</NavLink>
        <NavLink to="/add" className={active}>{t('nav.add')}</NavLink>
        <NavLink to="/settings" className={active}>{t('nav.settings')}</NavLink>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Wire routes in `src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { HomeScreen } from './ui/HomeScreen';
import { AddScreen } from './ui/AddScreen';
import { SettingsScreen } from './ui/SettingsScreen';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeScreen />} />
        <Route path="add" element={<AddScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 4: Verify dev**

```bash
pnpm dev   # tap each tab, see screen title change; ctrl-c
pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/ui
git commit -m "feat: layout + bottom tab navigation"
```

---

## Task 9: Manual-entry screen (Keypad + CategoryChips)

**Files:**
- Create: `src/ui/components/Keypad.tsx`, `src/ui/components/CategoryChips.tsx`, `tests/ui/AddScreen.test.tsx`
- Modify: `src/ui/AddScreen.tsx`

**Interfaces:**
- Consumes: `addTransaction`, `CATEGORIES`, `formatVND`, `parseVNDInput`, `t('category.*')`.
- Produces: an `AddScreen` that lets a user enter an amount via numeric keypad, pick a category chip, and save in ≤3 taps. On save it calls `addTransaction({ amount, currency: 'VND', occurredAt: new Date().toISOString(), category, source: 'manual' })` and navigates to `/`.

- [ ] **Step 1: Write `tests/ui/AddScreen.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AddScreen } from '../../src/ui/AddScreen';
import { HomeScreen } from '../../src/ui/HomeScreen';
import { initI18n } from '../../src/i18n';
import { listTransactions } from '../../src/db/transactions';

beforeAll(async () => { await initI18n(); });

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/add" element={<AddScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddScreen manual entry', () => {
  it('saves a transaction with the entered amount and selected category', async () => {
    const user = userEvent.setup();
    renderAt('/add');
    // Three taps: digit 4, digit 5, then three zeros via the "000" key, pick chip, save
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '000' }));
    await user.click(screen.getByRole('button', { name: /Cà phê|Coffee/ }));
    await user.click(screen.getByRole('button', { name: /Lưu|Save/ }));
    const all = await listTransactions();
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBe(45000);
    expect(all[0].category).toBe('coffee-bubble-tea');
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test tests/ui/AddScreen.test.tsx
```

- [ ] **Step 3: Implement `Keypad.tsx`**

```tsx
const KEYS = ['1','2','3','4','5','6','7','8','9','000','0','⌫'];
export function Keypad({ onChange }: { onChange: (next: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {KEYS.map(k => (
        <button key={k}
          type="button"
          className="py-4 text-xl bg-gray-100 rounded"
          onClick={() => onChange(k)}
        >{k}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `CategoryChips.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category } from '../../types';

export function CategoryChips({
  value, onSelect,
}: { value: Category | null; onSelect: (c: Category) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {CATEGORIES.map(c => (
        <button key={c}
          type="button"
          onClick={() => onSelect(c)}
          className={`px-3 py-2 rounded-full border text-sm ${value === c ? 'bg-blue-600 text-white' : 'bg-white'}`}
        >{t(`category.${c}`)}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Implement `AddScreen.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Keypad } from './components/Keypad';
import { CategoryChips } from './components/CategoryChips';
import { addTransaction } from '../db/transactions';
import { formatVND } from '../lib/money';
import type { Category } from '../types';

export function AddScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [raw, setRaw] = useState('');
  const [category, setCategory] = useState<Category | null>(null);

  function handleKey(k: string) {
    if (k === '⌫') setRaw(raw.slice(0, -1));
    else setRaw((raw + k).slice(0, 12));
  }

  const amount = parseInt(raw || '0', 10);
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';

  async function handleSave() {
    if (!amount || !category) return;
    await addTransaction({
      amount, currency: 'VND',
      occurredAt: new Date().toISOString(),
      category, source: 'manual',
    });
    navigate('/');
  }

  return (
    <div className="flex flex-col">
      <h1 className="p-4 text-xl">{t('add.title')}</h1>
      <div className="px-4 text-4xl text-center">{formatVND(amount, locale)}</div>
      <Keypad onChange={handleKey} />
      <CategoryChips value={category} onSelect={setCategory} />
      <button
        type="button"
        onClick={handleSave}
        disabled={!amount || !category}
        className="mx-4 my-4 py-3 bg-blue-600 text-white rounded disabled:bg-gray-300"
      >{t('add.save')}</button>
    </div>
  );
}
```

- [ ] **Step 6: Run, expect pass**

```bash
pnpm test tests/ui/AddScreen.test.tsx
```

- [ ] **Step 7: Verify in dev**

```bash
pnpm dev
# /add: type 45 then "000", tap a category, tap Save → routes to /
```

- [ ] **Step 8: Commit**

```bash
git add src/ui tests/ui/AddScreen.test.tsx
git commit -m "feat: manual entry screen with keypad + category chips"
```

---

## Task 10: Home screen — today total, budget bar, last 5

**Files:**
- Create: `src/ui/components/BudgetBar.tsx`, `src/ui/components/TransactionRow.tsx`, `src/hooks/useTransactions.ts`, `src/hooks/useBudget.ts`, `tests/ui/HomeScreen.test.tsx`
- Modify: `src/ui/HomeScreen.tsx`

**Interfaces:**
- Consumes: `listTransactions`, `getTodayTotal`, `getBudgetForMonth`, `monthOf`, `todayISO`, `formatVND`.
- Produces:
  - `useTransactions(limit?: number)` → `{ data: Transaction[]; reload: () => void }`. Loads on mount.
  - `useBudget(month: string)` → `{ data: Budget | undefined; reload: () => void }`.
  - `HomeScreen` renders: today's spend, budget bar (or `home.noBudget`), last 5 rows or `home.empty`, and a floating `+` button linking to `/add`.

- [ ] **Step 1: Hooks**

```ts
// src/hooks/useTransactions.ts
import { useCallback, useEffect, useState } from 'react';
import { listTransactions } from '../db/transactions';
import type { Transaction } from '../types';

export function useTransactions(limit?: number) {
  const [data, setData] = useState<Transaction[]>([]);
  const reload = useCallback(() => {
    listTransactions({ limit }).then(setData);
  }, [limit]);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload };
}
```

```ts
// src/hooks/useBudget.ts
import { useCallback, useEffect, useState } from 'react';
import { getBudgetForMonth } from '../db/budgets';
import type { Budget } from '../types';

export function useBudget(month: string) {
  const [data, setData] = useState<Budget | undefined>();
  const reload = useCallback(() => {
    getBudgetForMonth(month).then(setData);
  }, [month]);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload };
}
```

- [ ] **Step 2: `BudgetBar.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';

export function BudgetBar({
  spent, total, locale,
}: { spent: number; total: number; locale: 'vi' | 'en' }) {
  const { t } = useTranslation();
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  const remaining = Math.max(0, total - spent);
  return (
    <div className="p-4">
      <div className="flex justify-between text-sm">
        <span>{t('home.remaining')}</span>
        <span>{formatVND(remaining, locale)}</span>
      </div>
      <div className="mt-2 h-3 bg-gray-200 rounded">
        <div
          className={`h-3 rounded ${pct >= 100 ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `TransactionRow.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import { formatVND } from '../../lib/money';
import type { Transaction } from '../../types';

export function TransactionRow({ t: tx, locale }: { t: Transaction; locale: 'vi' | 'en' }) {
  const { t } = useTranslation();
  return (
    <li className="flex justify-between px-4 py-2 border-b">
      <span>{t(`category.${tx.category}`)}</span>
      <span>{formatVND(tx.amount, locale)}</span>
    </li>
  );
}
```

- [ ] **Step 4: Test `tests/ui/HomeScreen.test.tsx`**

```tsx
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeScreen } from '../../src/ui/HomeScreen';
import { initI18n } from '../../src/i18n';
import { addTransaction } from '../../src/db/transactions';
import { upsertBudget } from '../../src/db/budgets';
import { monthOf, todayISO } from '../../src/lib/date';

beforeAll(async () => { await initI18n(); });

describe('HomeScreen', () => {
  it('shows today total, budget remaining, and last 5 rows', async () => {
    await upsertBudget(monthOf(todayISO()), 5_000_000);
    for (let i = 0; i < 6; i++) {
      await addTransaction({
        amount: 10000 * (i + 1), currency: 'VND',
        occurredAt: new Date().toISOString(),
        category: 'others', source: 'manual',
      });
    }
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
    // last 5 rows only
    const rows = await screen.findAllByRole('listitem');
    expect(rows.length).toBe(5);
  });

  it('shows noBudget message when no budget is set', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>);
    expect(await screen.findByText(/Chưa đặt|No budget/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run, expect failure**
```bash
pnpm test tests/ui/HomeScreen.test.tsx
```

- [ ] **Step 6: Implement `HomeScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTransactions } from '../hooks/useTransactions';
import { useBudget } from '../hooks/useBudget';
import { BudgetBar } from './components/BudgetBar';
import { TransactionRow } from './components/TransactionRow';
import { getTodayTotal, listTransactions } from '../db/transactions';
import { formatVND } from '../lib/money';
import { monthOf, todayISO } from '../lib/date';

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const month = monthOf(todayISO());
  const { data: budget } = useBudget(month);
  const { data: recent } = useTransactions(5);
  const [todayTotal, setTodayTotal] = useState(0);

  useEffect(() => { getTodayTotal().then(setTodayTotal); }, [recent]);

  // monthly spent for the bar
  const [monthSpent, setMonthSpent] = useState(0);
  useEffect(() => {
    listTransactions({ sinceISO: `${month}-01T00:00:00.000Z` })
      .then(all => setMonthSpent(all.reduce((s, t) => s + t.amount, 0)));
  }, [recent, month]);

  return (
    <div>
      <header className="p-4">
        <div className="text-sm text-gray-500">{t('home.todaySpend')}</div>
        <div className="text-3xl font-semibold">{formatVND(todayTotal, locale)}</div>
      </header>

      {budget
        ? <BudgetBar spent={monthSpent} total={budget.total} locale={locale} />
        : <div className="px-4 text-sm text-gray-500">{t('home.noBudget')}</div>}

      <h2 className="px-4 pt-4 pb-2 text-sm uppercase text-gray-500">
        {t('home.lastTransactions')}
      </h2>
      {recent.length === 0
        ? <div className="px-4 text-sm text-gray-500">{t('home.empty')}</div>
        : <ul>{recent.map(tx => <TransactionRow key={tx.id} t={tx} locale={locale} />)}</ul>}

      <Link
        to="/add"
        className="fixed right-4 bottom-20 w-14 h-14 rounded-full bg-blue-600 text-white text-3xl flex items-center justify-center shadow-lg"
        aria-label={t('nav.add')}
      >+</Link>
    </div>
  );
}
```

- [ ] **Step 7: Run, expect pass**

```bash
pnpm test
```

- [ ] **Step 8: Commit**

```bash
git add src/hooks src/ui tests/ui/HomeScreen.test.tsx
git commit -m "feat: home screen with today total, budget bar, last 5"
```

---

## Task 11: Settings screen — locale toggle + monthly budget

**Files:**
- Modify: `src/ui/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `setLocale`, `upsertBudget`, `getBudgetForMonth`, `monthOf`, `todayISO`, `parseVNDInput`.
- Produces: a screen with two language radio buttons (vi / en) and a single numeric input for monthly budget total. Saving the budget calls `upsertBudget(monthOf(todayISO()), total)`. Saving the locale calls `setLocale(...)` and forces a re-render (i18next emits `languageChanged`).

- [ ] **Step 1: Implement `SettingsScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLocale, type Locale } from '../i18n';
import { upsertBudget, getBudgetForMonth } from '../db/budgets';
import { monthOf, todayISO } from '../lib/date';
import { parseVNDInput } from '../lib/money';

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const month = monthOf(todayISO());
  const [raw, setRaw] = useState('');

  useEffect(() => {
    getBudgetForMonth(month).then(b => {
      if (b) setRaw(String(b.total));
    });
  }, [month]);

  async function handleLocale(l: Locale) {
    await setLocale(l);
  }

  async function handleSaveBudget() {
    const total = parseVNDInput(raw);
    if (Number.isNaN(total) || total <= 0) return;
    await upsertBudget(month, total);
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl">{t('settings.title')}</h1>

      <section>
        <h2 className="font-semibold">{t('settings.language')}</h2>
        <div className="flex gap-4 mt-2">
          {(['vi','en'] as Locale[]).map(l => (
            <label key={l} className="flex items-center gap-2">
              <input
                type="radio"
                name="locale"
                checked={i18n.language === l}
                onChange={() => handleLocale(l)}
              />
              {l === 'vi' ? 'Tiếng Việt' : 'English'}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">{t('settings.monthlyBudget')}</h2>
        <input
          inputMode="numeric"
          value={raw}
          onChange={e => setRaw(e.target.value)}
          className="mt-2 w-full p-2 border rounded"
        />
        <button
          type="button"
          onClick={handleSaveBudget}
          className="mt-2 py-2 px-4 bg-blue-600 text-white rounded"
        >{t('settings.save')}</button>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify in dev**

```bash
pnpm dev
# /settings: switch language → tab labels change; set budget → /home shows bar
```

- [ ] **Step 3: Type-check + tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/SettingsScreen.tsx
git commit -m "feat: settings screen with locale + monthly budget"
```

---

## Task 12: End-to-end manual flow verification

**Files:** none new.

- [ ] **Step 1: Production build smoke test**

```bash
pnpm build
pnpm preview --port 4173
```

- [ ] **Step 2: Manual checklist (perform in browser)**

Open `http://localhost:4173`. Verify each item:
- [ ] First load shows Vietnamese UI.
- [ ] Settings → switch to English → labels change without refresh.
- [ ] Settings → set monthly budget to `5000000` → home shows budget bar with full remaining.
- [ ] Home → tap floating `+` → keypad screen.
- [ ] Enter `45` then `000` → display shows `45.000 ₫` (vi) or `₫45,000` (en).
- [ ] Tap Coffee & Bubble Tea chip → tap Save → returns to home.
- [ ] Today's spend = `45.000 ₫`; budget bar fills slightly; last transactions list shows one row.
- [ ] Repeat 5 more transactions → last transactions list shows only 5 (newest first).
- [ ] Reload the page → all data persists.
- [ ] Browser DevTools → Application → IndexedDB → `finance-app` shows the expected stores.

- [ ] **Step 3: Stop preview, commit any minor fixes**

If anything broke and you fixed it, commit the fix:
```bash
git add -A && git commit -m "fix: phase-1 polish"
```

- [ ] **Step 4: Tag Phase 1**

```bash
git tag phase-1
```

---

## Phase 1 done

A working PWA-ready React app with manual entry, budget tracking, locale toggle, and IndexedDB persistence — without service-worker / install-prompt polish, which arrives in Phase 4.

**Next phase:** brainstorming → Phase 2 (Categorizer + Reports + Recharts + over-budget alerts).
