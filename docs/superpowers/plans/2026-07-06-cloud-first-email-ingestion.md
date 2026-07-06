# Cloud-first Email Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end Supabase flow where iOS Shortcuts posts MB/ACB bank-email spending transactions, Supabase stores them, and the PWA reads authenticated cloud data after Google login.

**Architecture:** Supabase becomes the system of record for transactions. The Edge Function validates Shortcuts payloads with `INGEST_SECRET`, inserts rows for `DEFAULT_USER_ID`, and the PWA uses Supabase Auth + RLS to read only the signed-in user's rows. Existing report/chart functions remain in use by mapping cloud rows into the app's current `Transaction` shape.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase Auth, Supabase Postgres, Supabase Edge Functions, iOS Shortcuts.

---

## File Structure

Create:

- `.env.example` - documents `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `supabase/migrations/20260706000000_create_transactions.sql` - `transactions` table, indexes, RLS policies.
- `supabase/functions/_shared/ingest.ts` - pure validation, datetime parsing, amount normalization, external hash helpers.
- `supabase/functions/ingest-transaction/index.ts` - HTTP Edge Function entrypoint.
- `src/supabase/client.ts` - browser Supabase client and setup guard.
- `src/supabase/mapper.ts` - cloud row to existing UI `Transaction` mapper.
- `src/supabase/transactions.ts` - transaction fetch functions.
- `src/hooks/useAuth.ts` - Supabase auth session hook.
- `src/hooks/useCloudTransactions.ts` - recent/today/month transaction loading hook.
- `src/ui/AuthGate.tsx` - route-level auth gate.
- `src/ui/SignInScreen.tsx` - Google sign-in screen.
- `tests/ingest/ingest.test.ts` - Edge helper tests.
- `tests/supabase/mapper.test.ts` - mapper tests.
- `tests/supabase/transactions.test.ts` - fetch/query tests with mocked Supabase client.
- `tests/hooks/useAuth.test.tsx` - auth hook tests with mocked Supabase client.
- `docs/supabase-shortcuts.md` - setup guide for Supabase and the three iOS Shortcuts automations.

Modify:

- `package.json` and `pnpm-lock.yaml` - add `@supabase/supabase-js`.
- `src/types.ts` - add `bank-email`, `mb`, and `acb`.
- `src/App.tsx` - wrap routes with `AuthGate`.
- `src/ui/Layout.tsx` - remove Add nav from the cloud-first main path.
- `src/ui/HomeScreen.tsx` - read cloud transactions instead of IndexedDB transactions; remove manual/OCR add buttons.
- `src/hooks/useReports.ts` - read month ranges from Supabase instead of IndexedDB transactions.
- `src/ui/ReportsScreen.tsx` - render loading/error/retry states from the updated hook.
- `src/ui/SettingsScreen.tsx` - remove backup/import from the primary path and add sign-out.
- `src/i18n/vi.json` and `src/i18n/en.json` - add auth/cloud/error labels.
- `tests/ui/HomeScreen.test.tsx`, `tests/hooks/useReports.test.tsx`, `tests/ui/ReportsScreen.test.tsx`, `tests/ui/SettingsScreen.test.tsx` - mock cloud data instead of writing transactions to IndexedDB.

---

### Task 1: Add Supabase Dependency, Env Example, and Types

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `.env.example`
- Modify: `src/types.ts`

- [ ] **Step 1: Install Supabase JS**

Run:

```bash
pnpm add @supabase/supabase-js
```

Expected: `package.json` contains `@supabase/supabase-js` under dependencies and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Create `.env.example`**

Create `.env.example`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Extend app transaction types**

Modify `src/types.ts`:

```ts
export type TransactionSource = 'manual' | 'receipt' | 'bank-screenshot' | 'bank-email';
export type BankHint = 'vietcombank' | 'techcombank' | 'momo' | 'zalopay' | 'mb' | 'acb';
```

Keep the existing `Transaction` interface unchanged except that its `source` and `bankHint` fields use the expanded unions.

- [ ] **Step 4: Run focused typecheck**

Run:

```bash
pnpm exec tsc -b
```

Expected: TypeScript still fails only if later tasks are not implemented yet. After Task 1 alone it should pass because expanded unions are non-breaking.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example src/types.ts
git commit -m "chore: add supabase dependency and cloud transaction types"
```

---

### Task 2: Add Supabase Transaction Migration

**Files:**

- Create: `supabase/migrations/20260706000000_create_transactions.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260706000000_create_transactions.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank text not null check (bank in ('MB', 'ACB')),
  type text not null check (type in ('transfer', 'card', 'balance_alert')),
  amount integer not null check (amount > 0),
  currency text not null default 'VND' check (currency = 'VND'),
  transaction_time timestamptz not null,
  content text not null,
  raw_source text not null default 'email' check (raw_source = 'email'),
  external_hash text not null,
  created_at timestamptz not null default now(),
  unique (user_id, external_hash)
);

create index if not exists transactions_user_time_idx
  on public.transactions (user_id, transaction_time desc);

alter table public.transactions enable row level security;

drop policy if exists "Users can read own transactions" on public.transactions;
create policy "Users can read own transactions"
  on public.transactions
  for select
  to authenticated
  using (user_id = auth.uid());
```

- [ ] **Step 2: Validate SQL shape locally**

Run:

```bash
rg -n "enable row level security|auth.uid|external_hash|transactions_user_time_idx" supabase/migrations/20260706000000_create_transactions.sql
```

Expected: all four patterns are present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000000_create_transactions.sql
git commit -m "feat: add supabase transactions migration"
```

---

### Task 3: Build Pure Ingestion Validation Helpers

**Files:**

- Create: `supabase/functions/_shared/ingest.ts`
- Create: `tests/ingest/ingest.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/ingest/ingest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildExternalHash,
  normalizeIngestPayload,
  parseVietnamDatetime,
} from '../../supabase/functions/_shared/ingest';

describe('parseVietnamDatetime', () => {
  it('parses MB transfer datetime as Vietnam local time', () => {
    expect(parseVietnamDatetime('04-07-2026 21:48:49')).toBe('2026-07-04T14:48:49.000Z');
  });

  it('parses MB card datetime as Vietnam local time', () => {
    expect(parseVietnamDatetime('2026-07-06 11:19:20')).toBe('2026-07-06T04:19:20.000Z');
  });

  it('parses ACB embedded timestamp as Vietnam local time', () => {
    expect(parseVietnamDatetime('060726-14:47:32')).toBe('2026-07-06T07:47:32.000Z');
  });
});

describe('normalizeIngestPayload', () => {
  it('accepts MB transfer payload', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: '297,000.00',
      datetime: '04-07-2026 21:48:49',
      content: '159287 1PEV8',
      raw_source: 'email',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({
      bank: 'MB',
      type: 'transfer',
      amount: 297000,
      transaction_time: '2026-07-04T14:48:49.000Z',
      content: '159287 1PEV8',
      raw_source: 'email',
    });
  });

  it('accepts negative MB card amount as positive spending', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'card',
      amount: '-52,043',
      datetime: '2026-07-06 11:19:20',
      content: 'Grab* BWCFLJMBDWRJ-G-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.amount).toBe(52043);
  });

  it('accepts ACB dotted amount', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '-10,000.00',
      datetime: '060726-14:47:32',
      content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.amount).toBe(10000);
  });

  it('rejects invalid bank', () => {
    const result = normalizeIngestPayload({
      bank: 'VCB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_bank' });
  });

  it('rejects blank content', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: '   ',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_content' });
  });
});

describe('buildExternalHash', () => {
  it('is stable for equivalent normalized payloads', async () => {
    const one = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: '297,000.00',
      datetime: '04-07-2026 21:48:49',
      content: '159287 1PEV8',
    });
    const two = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 297000,
      datetime: '2026-07-04 21:48:49',
      content: ' 159287 1PEV8 ',
    });

    expect(one.ok).toBe(true);
    expect(two.ok).toBe(true);
    if (!one.ok || !two.ok) throw new Error('normalization failed');

    await expect(buildExternalHash(one.value)).resolves.toBe(await buildExternalHash(two.value));
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm exec vitest run tests/ingest/ingest.test.ts
```

Expected: FAIL because `supabase/functions/_shared/ingest.ts` does not exist.

- [ ] **Step 3: Implement ingestion helpers**

Create `supabase/functions/_shared/ingest.ts`:

```ts
export type Bank = 'MB' | 'ACB';
export type TransactionKind = 'transfer' | 'card' | 'balance_alert';

export interface NormalizedIngestPayload {
  bank: Bank;
  type: TransactionKind;
  amount: number;
  transaction_time: string;
  content: string;
  raw_source: 'email';
}

export type NormalizeResult =
  | { ok: true; value: NormalizedIngestPayload }
  | { ok: false; error: string };

const BANKS = new Set<Bank>(['MB', 'ACB']);
const TYPES = new Set<TransactionKind>(['transfer', 'card', 'balance_alert']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Math.round(value) : Math.abs(Math.round(value));
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/^-/, '').replace(/[,.]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  if (cleaned.length > 2 && value.includes('.') && /\.\d{2}$/.test(value)) {
    return Number(cleaned.slice(0, -2));
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toUtcIso(y: number, m: number, d: number, hh: number, mm: number, ss: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const utc = Date.UTC(y, m - 1, d, hh - 7, mm, ss);
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseVietnamDatetime(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();

  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match.map(Number);
    return toUtcIso(y, m, d, hh, mm, ss);
  }

  match = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, d, m, y, hh, mm, ss] = match.map(Number);
    return toUtcIso(y, m, d, hh, mm, ss);
  }

  match = value.match(/^(\d{2})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, d, m, yy, hh, mm, ss] = match.map(Number);
    return toUtcIso(2000 + yy, m, d, hh, mm, ss);
  }

  return null;
}

export function normalizeIngestPayload(input: unknown): NormalizeResult {
  if (!isRecord(input)) return { ok: false, error: 'invalid_json' };

  const bank = input.bank;
  if (bank !== 'MB' && bank !== 'ACB') return { ok: false, error: 'invalid_bank' };
  if (!BANKS.has(bank)) return { ok: false, error: 'invalid_bank' };

  const type = input.type;
  if (type !== 'transfer' && type !== 'card' && type !== 'balance_alert') {
    return { ok: false, error: 'invalid_type' };
  }
  if (!TYPES.has(type)) return { ok: false, error: 'invalid_type' };

  const amount = normalizeAmount(input.amount);
  if (amount == null || amount <= 0) return { ok: false, error: 'invalid_amount' };

  const transaction_time = parseVietnamDatetime(input.datetime);
  if (transaction_time == null) return { ok: false, error: 'invalid_datetime' };

  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!content) return { ok: false, error: 'invalid_content' };

  const rawSource = input.raw_source == null ? 'email' : input.raw_source;
  if (rawSource !== 'email') return { ok: false, error: 'invalid_raw_source' };

  return {
    ok: true,
    value: { bank, type, amount, transaction_time, content, raw_source: 'email' },
  };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildExternalHash(payload: NormalizedIngestPayload): Promise<string> {
  const stable = [
    payload.bank,
    payload.type,
    String(payload.amount),
    payload.transaction_time,
    payload.content.replace(/\s+/g, ' ').trim(),
  ].join('|');
  const encoded = new TextEncoder().encode(stable);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(digest);
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm exec vitest run tests/ingest/ingest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ingest.ts tests/ingest/ingest.test.ts
git commit -m "feat: add bank email ingestion validation"
```

---

### Task 4: Add Edge Function Endpoint

**Files:**

- Create: `supabase/functions/ingest-transaction/index.ts`

- [ ] **Step 1: Create Edge Function**

Create `supabase/functions/ingest-transaction/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildExternalHash, normalizeIngestPayload } from '../_shared/ingest.ts';

const jsonHeaders = {
  'content-type': 'application/json',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const expectedSecret = Deno.env.get('INGEST_SECRET');
  const providedSecret = req.headers.get('x-ingest-secret');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const normalized = normalizeIngestPayload(body);
  if (!normalized.ok) {
    return json({ ok: false, error: normalized.error }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const defaultUserId = Deno.env.get('DEFAULT_USER_ID');
  if (!supabaseUrl || !serviceRoleKey || !defaultUserId) {
    return json({ ok: false, error: 'missing_server_config' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const external_hash = await buildExternalHash(normalized.value);
  const { error } = await supabase.from('transactions').insert({
    ...normalized.value,
    user_id: defaultUserId,
    external_hash,
  });

  if (error?.code === '23505') {
    return json({ ok: true, status: 'duplicate' }, 200);
  }
  if (error) {
    console.error('insert transaction failed', error);
    return json({ ok: false, error: 'insert_failed' }, 500);
  }

  return json({ ok: true, status: 'inserted' }, 201);
});
```

- [ ] **Step 2: Run helper tests again**

Run:

```bash
pnpm exec vitest run tests/ingest/ingest.test.ts
```

Expected: PASS. The endpoint itself is not imported into Vitest because it depends on Deno globals.

- [ ] **Step 3: Run text checks for required secrets and duplicate handling**

Run:

```bash
rg -n "INGEST_SECRET|DEFAULT_USER_ID|SUPABASE_SERVICE_ROLE_KEY|23505|duplicate" supabase/functions/ingest-transaction/index.ts
```

Expected: all patterns are present.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ingest-transaction/index.ts
git commit -m "feat: add transaction ingestion edge function"
```

---

### Task 5: Add Supabase Browser Client and Mapper

**Files:**

- Create: `src/supabase/client.ts`
- Create: `src/supabase/mapper.ts`
- Create: `tests/supabase/mapper.test.ts`

- [ ] **Step 1: Write mapper tests**

Create `tests/supabase/mapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapTransactionRow } from '../../src/supabase/mapper';

describe('mapTransactionRow', () => {
  it('maps an MB card row to the app Transaction shape', () => {
    const tx = mapTransactionRow({
      id: 'tx-1',
      bank: 'MB',
      type: 'card',
      amount: 52043,
      currency: 'VND',
      transaction_time: '2026-07-06T04:19:20.000Z',
      content: 'Grab* BWCFLJMBDWRJ-G-1',
      raw_source: 'email',
      created_at: '2026-07-06T04:20:00.000Z',
    });

    expect(tx).toMatchObject({
      id: 'tx-1',
      amount: 52043,
      currency: 'VND',
      occurredAt: '2026-07-06T04:19:20.000Z',
      merchant: 'Grab* BWCFLJMBDWRJ-G-1',
      category: 'transportation',
      note: 'MB card',
      source: 'bank-email',
      bankHint: 'mb',
    });
  });

  it('falls back to others when content has no category match', () => {
    const tx = mapTransactionRow({
      id: 'tx-2',
      bank: 'ACB',
      type: 'balance_alert',
      amount: 10000,
      currency: 'VND',
      transaction_time: '2026-07-06T07:47:32.000Z',
      content: 'UNKNOWN TRANSFER MEMO',
      raw_source: 'email',
      created_at: '2026-07-06T07:48:00.000Z',
    });

    expect(tx.category).toBe('others');
    expect(tx.bankHint).toBe('acb');
  });
});
```

- [ ] **Step 2: Run failing mapper tests**

Run:

```bash
pnpm exec vitest run tests/supabase/mapper.test.ts
```

Expected: FAIL because `src/supabase/mapper.ts` does not exist.

- [ ] **Step 3: Create Supabase client**

Create `src/supabase/client.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

const config = getSupabaseConfig();

export const supabase = config
  ? createClient(config.url, config.anonKey)
  : null;

export type AppSupabaseClient = SupabaseClient;
```

- [ ] **Step 4: Create mapper**

Create `src/supabase/mapper.ts`:

```ts
import { classify, SEED_RULES } from '../categorizer';
import type { BankHint, Transaction } from '../types';

export type CloudBank = 'MB' | 'ACB';
export type CloudTransactionType = 'transfer' | 'card' | 'balance_alert';

export interface CloudTransactionRow {
  id: string;
  bank: CloudBank;
  type: CloudTransactionType;
  amount: number;
  currency: 'VND';
  transaction_time: string;
  content: string;
  raw_source: 'email';
  created_at: string;
}

function bankHint(bank: CloudBank): BankHint {
  return bank === 'MB' ? 'mb' : 'acb';
}

export function mapTransactionRow(row: CloudTransactionRow): Transaction {
  const suggestion = classify(row.content, SEED_RULES);
  return {
    id: row.id,
    amount: row.amount,
    currency: 'VND',
    occurredAt: row.transaction_time,
    merchant: row.content,
    category: suggestion?.category ?? 'others',
    note: `${row.bank} ${row.type}`,
    source: 'bank-email',
    bankHint: bankHint(row.bank),
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}
```

- [ ] **Step 5: Run mapper tests**

Run:

```bash
pnpm exec vitest run tests/supabase/mapper.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/supabase/client.ts src/supabase/mapper.ts tests/supabase/mapper.test.ts
git commit -m "feat: map cloud transaction rows"
```

---

### Task 6: Add Cloud Transaction Queries

**Files:**

- Create: `src/supabase/transactions.ts`
- Create: `tests/supabase/transactions.test.ts`

- [ ] **Step 1: Write tests with an injected query client**

Create `tests/supabase/transactions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { listCloudTransactions, listCloudTransactionsForRange } from '../../src/supabase/transactions';

function makeQuery(data: unknown[] | null, error: unknown = null) {
  const order = vi.fn(async () => ({ data, error }));
  const limit = vi.fn(() => ({ order }));
  const lt = vi.fn(() => ({ limit, order }));
  const gte = vi.fn(() => ({ lt, limit, order }));
  const select = vi.fn(() => ({ gte, limit, order }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, calls: { from, select, gte, lt, limit, order } };
}

describe('cloud transaction queries', () => {
  it('lists recent transactions newest first', async () => {
    const { client, calls } = makeQuery([
      {
        id: 'tx-1',
        bank: 'MB',
        type: 'card',
        amount: 52043,
        currency: 'VND',
        transaction_time: '2026-07-06T04:19:20.000Z',
        content: 'Grab',
        raw_source: 'email',
        created_at: '2026-07-06T04:20:00.000Z',
      },
    ]);

    const result = await listCloudTransactions(client, { limit: 5 });

    expect(calls.from).toHaveBeenCalledWith('transactions');
    expect(calls.select).toHaveBeenCalledWith('id,bank,type,amount,currency,transaction_time,content,raw_source,created_at');
    expect(calls.limit).toHaveBeenCalledWith(5);
    expect(calls.order).toHaveBeenCalledWith('transaction_time', { ascending: false });
    expect(result[0].source).toBe('bank-email');
  });

  it('applies range filters', async () => {
    const { client, calls } = makeQuery([]);

    await listCloudTransactionsForRange(client, {
      sinceISO: '2026-07-01T00:00:00.000Z',
      untilISO: '2026-08-01T00:00:00.000Z',
    });

    expect(calls.gte).toHaveBeenCalledWith('transaction_time', '2026-07-01T00:00:00.000Z');
    expect(calls.lt).toHaveBeenCalledWith('transaction_time', '2026-08-01T00:00:00.000Z');
  });

  it('throws on Supabase errors', async () => {
    const { client } = makeQuery(null, { message: 'boom' });

    await expect(listCloudTransactions(client, { limit: 5 })).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm exec vitest run tests/supabase/transactions.test.ts
```

Expected: FAIL because `src/supabase/transactions.ts` does not exist.

- [ ] **Step 3: Implement query module**

Create `src/supabase/transactions.ts`:

```ts
import { mapTransactionRow, type CloudTransactionRow } from './mapper';
import type { Transaction } from '../types';

const COLUMNS = 'id,bank,type,amount,currency,transaction_time,content,raw_source,created_at';

export interface QueryClient {
  from: (table: string) => {
    select: (columns: string) => {
      gte: (column: string, value: string) => {
        lt: (column: string, value: string) => {
          order: (column: string, opts: { ascending: boolean }) => Promise<{ data: CloudTransactionRow[] | null; error: { message: string } | null }>;
          limit: (count: number) => {
            order: (column: string, opts: { ascending: boolean }) => Promise<{ data: CloudTransactionRow[] | null; error: { message: string } | null }>;
          };
        };
      };
      limit: (count: number) => {
        order: (column: string, opts: { ascending: boolean }) => Promise<{ data: CloudTransactionRow[] | null; error: { message: string } | null }>;
      };
      order: (column: string, opts: { ascending: boolean }) => Promise<{ data: CloudTransactionRow[] | null; error: { message: string } | null }>;
    };
  };
}

export async function listCloudTransactions(
  client: QueryClient,
  opts: { limit?: number } = {},
): Promise<Transaction[]> {
  let query = client.from('transactions').select(COLUMNS);
  if (opts.limit != null) {
    query = query.limit(opts.limit) as unknown as typeof query;
  }
  const { data, error } = await query.order('transaction_time', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransactionRow);
}

export async function listCloudTransactionsForRange(
  client: QueryClient,
  opts: { sinceISO: string; untilISO: string },
): Promise<Transaction[]> {
  const { data, error } = await client
    .from('transactions')
    .select(COLUMNS)
    .gte('transaction_time', opts.sinceISO)
    .lt('transaction_time', opts.untilISO)
    .order('transaction_time', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransactionRow);
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm exec vitest run tests/supabase/transactions.test.ts tests/supabase/mapper.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/supabase/transactions.ts tests/supabase/transactions.test.ts
git commit -m "feat: add cloud transaction queries"
```

---

### Task 7: Add Supabase Auth Hook and Sign-in Gate

**Files:**

- Create: `src/hooks/useAuth.ts`
- Create: `src/ui/SignInScreen.tsx`
- Create: `src/ui/AuthGate.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Create: `tests/hooks/useAuth.test.tsx`

- [ ] **Step 1: Write auth hook tests**

Create `tests/hooks/useAuth.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../src/hooks/useAuth';

function makeAuthClient(session: unknown) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn((_event, callback) => {
        callback('INITIAL_SESSION', session);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
}

describe('useAuth', () => {
  it('loads session from Supabase client', async () => {
    const client = makeAuthClient({ user: { id: 'user-1' } });
    const { result } = renderHook(() => useAuth(client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual({ user: { id: 'user-1' } });
  });

  it('reports missing config as setup error', async () => {
    const { result } = renderHook(() => useAuth(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toBe(true);
  });

  it('starts Google OAuth sign in', async () => {
    const client = makeAuthClient(null);
    const { result } = renderHook(() => useAuth(client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.signInWithGoogle();

    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  });
});
```

- [ ] **Step 2: Run failing auth tests**

Run:

```bash
pnpm exec vitest run tests/hooks/useAuth.test.tsx
```

Expected: FAIL because `src/hooks/useAuth.ts` does not exist.

- [ ] **Step 3: Implement auth hook**

Create `src/hooks/useAuth.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase, type AppSupabaseClient } from '../supabase/client';

interface AuthLikeClient {
  auth: Pick<AppSupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithOAuth' | 'signOut'>;
}

export function useAuth(client: AuthLikeClient | null = supabase) {
  const [session, setSession] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const setupError = client == null;

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }

    let mounted = true;
    client.auth.getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const signInWithGoogle = useCallback(async () => {
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw new Error(error.message);
  }, [client]);

  return { session, loading, setupError, signInWithGoogle, signOut };
}
```

- [ ] **Step 4: Create sign-in and auth gate UI**

Create `src/ui/SignInScreen.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function SignInScreen({
  setupError,
  onSignIn,
}: {
  setupError: boolean;
  onSignIn: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');

  async function handleSignIn() {
    setError('');
    try {
      await onSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <section className="w-full max-w-sm rounded bg-white border p-5 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
          <p className="text-sm text-gray-600 mt-1">{t('auth.subtitle')}</p>
        </div>
        {setupError && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            {t('auth.setupError')}
          </div>
        )}
        {error && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleSignIn}
          disabled={setupError}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded disabled:bg-gray-300"
        >
          {t('auth.signInWithGoogle')}
        </button>
      </section>
    </main>
  );
}
```

Create `src/ui/AuthGate.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { SignInScreen } from './SignInScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const auth = useAuth();

  if (auth.loading) {
    return <div className="p-4 text-sm text-gray-500">{t('auth.loading')}</div>;
  }

  if (auth.setupError || !auth.session) {
    return <SignInScreen setupError={auth.setupError} onSignIn={auth.signInWithGoogle} />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Wrap app routes**

Modify `src/App.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { HomeScreen } from './ui/HomeScreen';
import { AddScreen } from './ui/AddScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { ConfirmScreen } from './ui/ConfirmScreen';
import { AuthGate } from './ui/AuthGate';

const ReportsScreen = lazy(() =>
  import('./ui/ReportsScreen').then(m => ({ default: m.ReportsScreen })),
);

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeScreen />} />
          <Route path="add" element={<AddScreen />} />
          <Route path="confirm" element={<ConfirmScreen />} />
          <Route
            path="reports"
            element={
              <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading...</div>}>
                <ReportsScreen />
              </Suspense>
            }
          />
          <Route path="settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
```

- [ ] **Step 6: Add i18n keys**

Add to `src/i18n/en.json`:

```json
"auth": {
  "title": "Finance",
  "subtitle": "Sign in to view bank-email spending from Supabase.",
  "loading": "Checking sign-in...",
  "signInWithGoogle": "Continue with Google",
  "signInFailed": "Sign in failed",
  "setupError": "Supabase environment variables are missing."
}
```

Add to `src/i18n/vi.json`:

```json
"auth": {
  "title": "Quản lý chi tiêu",
  "subtitle": "Đăng nhập để xem chi tiêu từ email ngân hàng trên Supabase.",
  "loading": "Đang kiểm tra đăng nhập...",
  "signInWithGoogle": "Tiếp tục với Google",
  "signInFailed": "Đăng nhập thất bại",
  "setupError": "Thiếu biến môi trường Supabase."
}
```

- [ ] **Step 7: Run auth tests**

Run:

```bash
pnpm exec vitest run tests/hooks/useAuth.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useAuth.ts src/ui/SignInScreen.tsx src/ui/AuthGate.tsx src/App.tsx src/i18n/en.json src/i18n/vi.json tests/hooks/useAuth.test.tsx
git commit -m "feat: add google auth gate"
```

---

### Task 8: Add Cloud Transaction Hook and Convert Home

**Files:**

- Create: `src/hooks/useCloudTransactions.ts`
- Modify: `src/ui/HomeScreen.tsx`
- Modify: `tests/ui/HomeScreen.test.tsx`

- [ ] **Step 1: Write Home tests using mocked cloud hook**

Modify `tests/ui/HomeScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeScreen } from '../../src/ui/HomeScreen';
import { initI18n } from '../../src/i18n';
import { monthOf, todayISO } from '../../src/lib/date';
import { upsertBudget } from '../../src/db/budgets';

const cloudState = vi.hoisted(() => ({
  recent: [] as any[],
  month: [] as any[],
  loading: false,
  error: '',
  reload: vi.fn(),
}));

vi.mock('../../src/hooks/useCloudTransactions', () => ({
  useRecentCloudTransactions: () => ({
    data: cloudState.recent,
    loading: cloudState.loading,
    error: cloudState.error,
    reload: cloudState.reload,
  }),
  useMonthCloudTransactions: () => ({
    data: cloudState.month,
    loading: cloudState.loading,
    error: cloudState.error,
    reload: cloudState.reload,
  }),
}));

beforeAll(async () => { await initI18n(); });

function tx(id: string, amount: number) {
  return {
    id,
    amount,
    currency: 'VND',
    occurredAt: new Date().toISOString(),
    category: 'others',
    source: 'bank-email',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('HomeScreen', () => {
  it('shows today total, budget remaining, and recent cloud rows', async () => {
    await upsertBudget(monthOf(todayISO()), 5_000_000);
    cloudState.recent = [tx('1', 10000), tx('2', 20000)];
    cloudState.month = [tx('1', 10000), tx('2', 20000)];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
    const headerDiv = document.querySelector('header .text-3xl');
    expect(/30[.,]000/.test(headerDiv?.textContent ?? '')).toBe(true);
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
  });

  it('shows noBudget message when no budget is set', async () => {
    cloudState.recent = [];
    cloudState.month = [];

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(await screen.findByText(/Chưa đặt|No budget/)).toBeInTheDocument();
  });

  it('shows cloud fetch error with retry', async () => {
    cloudState.error = 'network failed';

    render(<MemoryRouter><HomeScreen /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent(/network failed/i);
  });
});
```

- [ ] **Step 2: Run failing Home tests**

Run:

```bash
pnpm exec vitest run tests/ui/HomeScreen.test.tsx
```

Expected: FAIL because `src/hooks/useCloudTransactions.ts` does not exist and Home still imports local transaction DB.

- [ ] **Step 3: Implement cloud transaction hook**

Create `src/hooks/useCloudTransactions.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';
import {
  listCloudTransactions,
  listCloudTransactionsForRange,
  type QueryClient,
} from '../supabase/transactions';
import { monthRangeISO } from '../lib/date';
import type { Transaction } from '../types';

function useCloudLoader(load: () => Promise<Transaction[]>, deps: unknown[]) {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    if (!supabase) {
      setData([]);
      setLoading(false);
      setError('Supabase is not configured');
      return;
    }
    setLoading(true);
    setError('');
    load()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload };
}

export function useRecentCloudTransactions(limit = 5) {
  return useCloudLoader(
    () => listCloudTransactions(supabase as unknown as QueryClient, { limit }),
    [limit],
  );
}

export function useMonthCloudTransactions(monthISO: string) {
  return useCloudLoader(
    () => {
      const range = monthRangeISO(monthISO);
      return listCloudTransactionsForRange(supabase as unknown as QueryClient, range);
    },
    [monthISO],
  );
}
```

- [ ] **Step 4: Convert HomeScreen to cloud transactions**

Modify `src/ui/HomeScreen.tsx`:

```tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBudget } from '../hooks/useBudget';
import { useMonthCloudTransactions, useRecentCloudTransactions } from '../hooks/useCloudTransactions';
import { BudgetBar } from './components/BudgetBar';
import { BudgetAlert } from './components/BudgetAlert';
import { TransactionRow } from './components/TransactionRow';
import { sumByCategory, status as budgetStatus } from '../reports';
import { formatVND } from '../lib/money';
import { monthOf, todayISO, isSameDay } from '../lib/date';
import { CATEGORIES, type Category } from '../types';

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const month = monthOf(todayISO());
  const { data: budget } = useBudget(month);
  const recent = useRecentCloudTransactions(5);
  const monthTx = useMonthCloudTransactions(month);

  const todayTotal = useMemo(
    () => monthTx.data
      .filter(tx => isSameDay(tx.occurredAt, todayISO()))
      .reduce((sum, tx) => sum + tx.amount, 0),
    [monthTx.data],
  );

  const sums = useMemo(() => sumByCategory(monthTx.data), [monthTx.data]);
  const bStatus = useMemo(() => budgetStatus(budget, sums), [budget, sums]);
  const monthSpent = bStatus.overallSpent;
  const perCategoryOver = useMemo(
    () => CATEGORIES.filter(c => bStatus.perCategory[c] === 'over'),
    [bStatus],
  );
  const categoryLabel = (c: Category) => t(`category.${c}`);
  const error = recent.error || monthTx.error;

  return (
    <div>
      <header className="p-4">
        <div className="text-sm text-gray-500">{t('home.todaySpend')}</div>
        <div className="text-3xl font-semibold">{formatVND(todayTotal, locale)}</div>
      </header>

      {error && (
        <div role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={() => { recent.reload(); monthTx.reload(); }} className="ml-3 underline">
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {budget
        ? <BudgetBar spent={monthSpent} total={budget.total} locale={locale} status={bStatus.overall} />
        : <div className="px-4 text-sm text-gray-500">{t('home.noBudget')}</div>}

      <BudgetAlert
        overall={bStatus.overall}
        perCategoryOver={perCategoryOver}
        categoryLabel={categoryLabel}
      />

      <h2 className="px-4 pt-4 pb-2 text-sm uppercase text-gray-500">
        {t('home.lastTransactions')}
      </h2>
      {recent.loading
        ? <div className="px-4 text-sm text-gray-500">{t('cloud.loading')}</div>
        : recent.data.length === 0
          ? <div className="px-4 text-sm text-gray-500">{t('home.empty')}</div>
          : <ul>{recent.data.map(tx => <TransactionRow key={tx.id} t={tx} locale={locale} />)}</ul>}
    </div>
  );
}
```

- [ ] **Step 5: Add cloud i18n keys**

Add to `src/i18n/en.json`:

```json
"cloud": {
  "loading": "Loading transactions...",
  "retry": "Retry"
}
```

Add to `src/i18n/vi.json`:

```json
"cloud": {
  "loading": "Đang tải giao dịch...",
  "retry": "Thử lại"
}
```

- [ ] **Step 6: Run Home tests**

Run:

```bash
pnpm exec vitest run tests/ui/HomeScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useCloudTransactions.ts src/ui/HomeScreen.tsx src/i18n/en.json src/i18n/vi.json tests/ui/HomeScreen.test.tsx
git commit -m "feat: load home dashboard from supabase"
```

---

### Task 9: Convert Reports to Cloud Transactions

**Files:**

- Modify: `src/hooks/useReports.ts`
- Modify: `src/ui/ReportsScreen.tsx`
- Modify: `tests/hooks/useReports.test.tsx`
- Modify: `tests/ui/ReportsScreen.test.tsx`

- [ ] **Step 1: Rewrite `useReports` tests with mocked Supabase queries**

Modify `tests/hooks/useReports.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { upsertBudget } from '../../src/db/budgets';
import { useReports } from '../../src/hooks/useReports';

const queryState = vi.hoisted(() => ({
  current: [] as any[],
  previous: [] as any[],
  error: null as Error | null,
}));

vi.mock('../../src/supabase/client', () => ({ supabase: {} }));
vi.mock('../../src/supabase/transactions', () => ({
  listCloudTransactionsForRange: vi.fn(async (_client, range) => {
    if (queryState.error) throw queryState.error;
    return range.sinceISO.startsWith('2026-06') ? queryState.current : queryState.previous;
  }),
}));

beforeEach(() => {
  queryState.current = [];
  queryState.previous = [];
  queryState.error = null;
});

describe('useReports', () => {
  it('returns zeros when Supabase has no rows', async () => {
    const { result } = renderHook(() => useReports('2026-06'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sums['food-drinks']).toBe(0);
    expect(result.current.bStatus.overall).toBe('ok');
    expect(result.current.error).toBe('');
  });

  it('aggregates current month cloud transactions', async () => {
    queryState.current = [{
      id: 'tx-1',
      amount: 1500,
      currency: 'VND',
      occurredAt: '2026-06-10T08:00:00.000Z',
      category: 'food-drinks',
      source: 'bank-email',
      createdAt: '2026-06-10T08:00:00.000Z',
      updatedAt: '2026-06-10T08:00:00.000Z',
    }];
    await upsertBudget('2026-06', 10000);

    const { result } = renderHook(() => useReports('2026-06'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sums['food-drinks']).toBe(1500);
    expect(result.current.bStatus.overall).toBe('ok');
  });

  it('returns error when Supabase query fails', async () => {
    queryState.error = new Error('network failed');

    const { result } = renderHook(() => useReports('2026-06'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('network failed');
  });
});
```

- [ ] **Step 2: Run failing report hook tests**

Run:

```bash
pnpm exec vitest run tests/hooks/useReports.test.tsx
```

Expected: FAIL because `useReports` does not expose `error` and still imports `db/transactions`.

- [ ] **Step 3: Update `useReports`**

Modify `src/hooks/useReports.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBudgetForMonth } from '../db/budgets';
import { supabase } from '../supabase/client';
import { listCloudTransactionsForRange, type QueryClient } from '../supabase/transactions';
import {
  sumByCategory, dailyTotals, monthOverMonth, hints, status,
  type BudgetStatus,
} from '../reports';
import { monthRangeISO, prevMonth } from '../lib/date';
import type { Budget, Category, Transaction } from '../types';

export interface UseReportsResult {
  loading: boolean;
  error: string;
  sums: Record<Category, number>;
  daily: Array<{ date: string; total: number }>;
  deltas: ReturnType<typeof monthOverMonth>;
  anomalyHints: ReturnType<typeof hints>;
  bStatus: { overall: BudgetStatus; perCategory: Record<Category, BudgetStatus>; overallSpent: number };
  reload: () => void;
}

export function useReports(monthISO: string): UseReportsResult {
  const [curr, setCurr] = useState<Transaction[]>([]);
  const [prev, setPrev] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<Budget | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    const { sinceISO: cSince, untilISO: cUntil } = monthRangeISO(monthISO);
    const { sinceISO: pSince, untilISO: pUntil } = monthRangeISO(prevMonth(monthISO));

    if (!supabase) {
      setCurr([]);
      setPrev([]);
      setLoading(false);
      setError('Supabase is not configured');
      return;
    }

    Promise.all([
      listCloudTransactionsForRange(supabase as unknown as QueryClient, { sinceISO: cSince, untilISO: cUntil }),
      listCloudTransactionsForRange(supabase as unknown as QueryClient, { sinceISO: pSince, untilISO: pUntil }),
      getBudgetForMonth(monthISO),
    ])
      .then(([c, p, b]) => { setCurr(c); setPrev(p); setBudget(b); })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [monthISO]);

  useEffect(() => { reload(); }, [reload]);

  const sums = useMemo(() => sumByCategory(curr), [curr]);
  const daily = useMemo(() => dailyTotals(curr, monthISO), [curr, monthISO]);
  const deltas = useMemo(() => monthOverMonth(curr, prev), [curr, prev]);
  const anomalyHints = useMemo(() => hints(deltas), [deltas]);
  const bStatus = useMemo(() => status(budget, sums), [budget, sums]);

  return { loading, error, sums, daily, deltas, anomalyHints, bStatus, reload };
}
```

- [ ] **Step 4: Add ReportsScreen loading/error states**

Modify the top of `ReportsScreen` after `useReports(month)`:

```tsx
const { loading, error, reload, sums, daily, anomalyHints, bStatus } = useReports(month);
```

Add this below the header:

```tsx
{loading && <div className="px-4 text-sm text-gray-500">{t('cloud.loading')}</div>}
{error && (
  <div role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
    {error}
    <button type="button" onClick={reload} className="ml-3 underline">
      {t('cloud.retry')}
    </button>
  </div>
)}
```

- [ ] **Step 5: Update Reports screen tests**

Modify `tests/ui/ReportsScreen.test.tsx` to mock `useReports`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { initI18n } from '../../src/i18n';
import { ReportsScreen } from '../../src/ui/ReportsScreen';
import { CATEGORIES } from '../../src/types';

const reportsState = vi.hoisted(() => ({
  loading: false,
  error: '',
  sums: Object.fromEntries(CATEGORIES.map(c => [c, 0])) as any,
  daily: [] as any[],
  anomalyHints: [] as any[],
  bStatus: {
    overall: 'ok',
    perCategory: Object.fromEntries(CATEGORIES.map(c => [c, 'ok'])) as any,
    overallSpent: 0,
  },
  reload: vi.fn(),
}));

vi.mock('../../src/hooks/useReports', () => ({
  useReports: () => reportsState,
}));

beforeAll(async () => { await initI18n(); });

describe('ReportsScreen', () => {
  it('shows empty state when the current month has no transactions', async () => {
    render(<MemoryRouter><ReportsScreen /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/no spending|chưa có chi tiêu/i)).toBeInTheDocument();
    });
  });

  it('shows over-budget banner when overall exceeded', async () => {
    reportsState.bStatus.overall = 'over';
    render(<MemoryRouter initialEntries={['/reports?month=2099-06']}><ReportsScreen /></MemoryRouter>);
    await waitFor(() => screen.getByRole('alert'));
  });

  it('shows cloud error state', async () => {
    reportsState.error = 'network failed';
    render(<MemoryRouter><ReportsScreen /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/network failed/i);
  });
});
```

- [ ] **Step 6: Run report tests**

Run:

```bash
pnpm exec vitest run tests/hooks/useReports.test.tsx tests/ui/ReportsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useReports.ts src/ui/ReportsScreen.tsx tests/hooks/useReports.test.tsx tests/ui/ReportsScreen.test.tsx
git commit -m "feat: load reports from supabase"
```

---

### Task 10: Clean Up Primary Cloud UI and Add Sign-out

**Files:**

- Modify: `src/ui/Layout.tsx`
- Modify: `src/ui/SettingsScreen.tsx`
- Modify: `tests/ui/SettingsScreen.test.tsx`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Update Settings tests for sign-out**

Modify `tests/ui/SettingsScreen.test.tsx` by adding a `useAuth` mock and a sign-out test:

```tsx
import { vi } from 'vitest';

const authState = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    signOut: authState.signOut,
  }),
}));

it('signs out from settings', async () => {
  render(<SettingsScreen />);
  await userEvent.click(screen.getByRole('button', { name: /sign out|đăng xuất/i }));
  expect(authState.signOut).toHaveBeenCalled();
});
```

Keep existing budget/caps tests. Remove backup/import tests from this file because backup/import is no longer primary UI.

- [ ] **Step 2: Remove Add tab from Layout**

Modify `src/ui/Layout.tsx`:

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UpdatePrompt } from './components/UpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';

export function Layout() {
  const { t } = useTranslation();
  const tab = 'flex-1 py-3 text-center text-sm';
  const active = ({ isActive }: { isActive: boolean }) =>
    `${tab} ${isActive ? 'font-bold text-blue-600' : 'text-gray-600'}`;
  return (
    <div className="min-h-screen flex flex-col">
      <UpdatePrompt />
      <InstallPrompt />
      <main className="flex-1 pb-16"><Outlet /></main>
      <nav className="fixed bottom-0 inset-x-0 flex bg-white border-t">
        <NavLink to="/" end className={active}>{t('nav.home')}</NavLink>
        <NavLink to="/reports" className={active}>{t('nav.reports')}</NavLink>
        <NavLink to="/settings" className={active}>{t('nav.settings')}</NavLink>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Add sign-out and remove backup/import UI from Settings**

Modify `src/ui/SettingsScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLocale, type Locale } from '../i18n';
import { upsertBudget, getBudgetForMonth } from '../db/budgets';
import { monthOf, todayISO } from '../lib/date';
import { parseVNDInput } from '../lib/money';
import { CapsEditor } from './components/CapsEditor';
import { useAuth } from '../hooks/useAuth';
import type { Category } from '../types';

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const month = monthOf(todayISO());
  const [raw, setRaw] = useState('');
  const [caps, setCaps] = useState<Partial<Record<Category, number>>>({});
  const [total, setTotal] = useState(0);

  useEffect(() => {
    getBudgetForMonth(month).then(b => {
      if (b) { setRaw(String(b.total)); setTotal(b.total); setCaps(b.caps ?? {}); }
    });
  }, [month]);

  async function handleLocale(l: Locale) { await setLocale(l); }

  async function handleSaveBudget() {
    const parsed = parseVNDInput(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return;
    await upsertBudget(month, parsed, caps);
    setTotal(parsed);
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

        {total > 0 && (
          <div className="mt-4">
            <CapsEditor
              month={month}
              total={total}
              initialCaps={caps}
              onSaved={() => getBudgetForMonth(month).then(b => b && setCaps(b.caps ?? {}))}
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold">{t('settings.account')}</h2>
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-2 py-2 px-4 bg-gray-700 text-white rounded"
        >
          {t('settings.signOut')}
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add settings i18n keys**

Add to `src/i18n/en.json` inside `settings`:

```json
"account": "Account",
"signOut": "Sign out"
```

Add to `src/i18n/vi.json` inside `settings`:

```json
"account": "Tài khoản",
"signOut": "Đăng xuất"
```

- [ ] **Step 5: Run Settings and Layout-adjacent tests**

Run:

```bash
pnpm exec vitest run tests/ui/SettingsScreen.test.tsx tests/ui/OfflineBanner.test.tsx
```

Expected: PASS after removing backup/import expectations from Settings tests. `OfflineBanner` test may remain because the component still exists; Layout no longer mounts it.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Layout.tsx src/ui/SettingsScreen.tsx src/i18n/en.json src/i18n/vi.json tests/ui/SettingsScreen.test.tsx
git commit -m "feat: simplify primary cloud UI"
```

---

### Task 11: Add Supabase and Shortcuts Setup Guide

**Files:**

- Create: `docs/supabase-shortcuts.md`

- [ ] **Step 1: Write setup guide**

Create `docs/supabase-shortcuts.md`:

````md
# Supabase + iOS Shortcuts Setup

## Supabase project

1. Create a Supabase project.
2. In Authentication > Providers, enable Google.
3. Add local and deployed URLs to the redirect allow list:
   - `http://localhost:5173`
   - the production PWA URL
4. Apply `supabase/migrations/20260706000000_create_transactions.sql`.
5. Deploy `supabase/functions/ingest-transaction`.
6. Set Edge Function secrets:

```text
SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
INGEST_SECRET=<long-random-secret>
DEFAULT_USER_ID=<auth.users.id for your Google account>
```

7. Copy the project URL and anon key into `.env.local`:

```text
VITE_SUPABASE_URL=<project-url>
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## Endpoint

```text
POST https://<project-ref>.functions.supabase.co/ingest-transaction
x-ingest-secret: <INGEST_SECRET>
content-type: application/json
```

## MB transfer automation

Sender: `mbebanking@mbbank.com.vn`

Regex:

```text
Số tiền giao dịch\s*\(VND\)\s*([\d,]+\.\d{2})
Nội dung chuyển tiền\s*\n?\s*(.+)
Ngày, giờ giao dịch:\s*(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})
```

JSON:

```json
{
  "bank": "MB",
  "type": "transfer",
  "amount": 297000,
  "datetime": "04-07-2026 21:48:49",
  "content": "159287 1PEV8",
  "raw_source": "email"
}
```

## MB credit card automation

Sender: `mbcard@mbbank.com.vn`

Regex:

```text
Giao dịch gần nhất\s*(-?[\d,]+)\s*VND
Nội dung\s*Giao dịch chi tiêu tại\s*(.+)
Ngày, giờ giao dịch:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})
```

JSON:

```json
{
  "bank": "MB",
  "type": "card",
  "amount": 52043,
  "datetime": "2026-07-06 11:19:20",
  "content": "Grab* BWCFLJMBDWRJ-G-1",
  "raw_source": "email"
}
```

## ACB balance alert automation

Sender: `mailalert@acb.com.vn`

Regex:

```text
Ghi nợ\s*(-?[\d,\.]+)\s*VND
Nội dung giao dịch:\s*(.+?)\.
(\d{6}-\d{2}:\d{2}:\d{2})
```

Use the first Vietnamese match only. ACB includes Vietnamese and English sections in one email.

JSON:

```json
{
  "bank": "ACB",
  "type": "balance_alert",
  "amount": 10000,
  "datetime": "060726-14:47:32",
  "content": "HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA",
  "raw_source": "email"
}
```

## Verification

Send the same JSON twice. The first response should be:

```json
{ "ok": true, "status": "inserted" }
```

The second response should be:

```json
{ "ok": true, "status": "duplicate" }
```
````

- [ ] **Step 2: Run markdown smoke check**

Run:

```bash
rg -n "DEFAULT_USER_ID|INGEST_SECRET|mbcard@mbbank.com.vn|mailalert@acb.com.vn|duplicate" docs/supabase-shortcuts.md
```

Expected: all patterns are present.

- [ ] **Step 3: Commit**

```bash
git add docs/supabase-shortcuts.md
git commit -m "docs: add supabase shortcuts setup guide"
```

---

### Task 12: Full Verification and Fixups

**Files:**

- Modify any files with failures found by this task.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
pnpm exec vitest run tests/ingest/ingest.test.ts tests/supabase/mapper.test.ts tests/supabase/transactions.test.ts tests/hooks/useAuth.test.tsx tests/ui/HomeScreen.test.tsx tests/hooks/useReports.test.tsx tests/ui/ReportsScreen.test.tsx tests/ui/SettingsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS. If tests for manual Add/OCR fail because the cloud-first path changed shared types or i18n, update those tests to reflect that the routes still exist but are no longer in primary navigation.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm run build
```

Expected: PASS. The build may still run `scripts/prepare-tesseract.mjs` because the previous PWA/OCR setup remains in the repo.

- [ ] **Step 4: Inspect transaction DB usage**

Run:

```bash
rg -n "listTransactions|getTodayTotal|addTransaction" src/ui src/hooks
```

Expected: `HomeScreen` and `useReports` do not call local transaction DB functions. Remaining matches may exist in `AddScreen` and `ConfirmScreen` because those routes are retained but hidden from primary navigation.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git diff --stat
git status --short
```

Expected: only files touched by this plan are modified or created. Existing untracked phase-2/3/4 plan/spec files from before this work may still appear and should not be staged.

- [ ] **Step 6: Commit verification fixups**

If Step 1-4 required changes:

```bash
git add <changed-files-from-this-task>
git commit -m "fix: stabilize cloud ingestion flow"
```

If Step 1-4 required no changes, skip this commit.

---

## Self-Review

Spec coverage:

- Supabase schema and RLS are covered by Task 2.
- Edge Function validation, hashing, duplicate handling, and secrets are covered by Tasks 3 and 4.
- Google Auth and setup-error handling are covered by Task 7.
- PWA cloud transaction reads are covered by Tasks 5, 6, 8, and 9.
- Primary UI cleanup is covered by Task 10.
- iOS Shortcuts setup is covered by Task 11.
- End-to-end verification is covered by Task 12.

Scope notes:

- Budgets remain local in this plan because the approved spec only makes Supabase the system of record for transactions.
- Manual/OCR routes remain in the codebase but are hidden from primary navigation to avoid mixing local transaction writes with cloud transaction reads.
- Multi-user ingestion tokens and income tracking remain outside this implementation plan.
