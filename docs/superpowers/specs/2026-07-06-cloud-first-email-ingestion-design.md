# Finance PWA - Cloud-first email ingestion design

**Date:** 2026-07-06
**Status:** Approved for planning
**Owner:** Sterling Huynh
**Decision:** Replace the local/offline-first architecture with a cloud-first Supabase flow for bank-email spending ingestion.

## 1. Purpose

The app should automatically collect spending transactions from MB and ACB email notifications, store them in Supabase, and show spending reports in the PWA. iOS cannot expose other apps' push notifications to a PWA or app, so iOS Shortcuts Automation is the bridge: it watches Mail, extracts the fields, and POSTs normalized JSON to a Supabase Edge Function.

The first cloud-first version tracks spending only. The user's banks currently send email only for money-out transactions. Income remains out of scope unless the user later enables email credit alerts, connects a banking aggregator, or derives income from balance changes.

## 2. Goals and non-goals

**Goals**

- Use Supabase as the system of record for transactions.
- Require Google login in the PWA through Supabase Auth.
- Ingest transactions from iOS Shortcuts via a secured Edge Function.
- Support the three confirmed email templates:
  - MB transfer from `mbebanking@mbbank.com.vn`.
  - MB credit card from `mbcard@mbbank.com.vn`.
  - ACB balance alert from `mailalert@acb.com.vn`.
- Show cloud transactions on the existing Home and Reports screens.
- Keep existing reports and categorization behavior where practical, but make their source data Supabase rows instead of IndexedDB rows.

**Non-goals**

- Offline-first behavior, local IndexedDB as source of truth, or local backup/restore.
- Reading iOS push notifications, Mail, or SMS directly from the PWA.
- Multi-user ingestion-token management UI.
- Income tracking.
- Bank API / Open Banking / Casso integration.
- OCR and screenshot capture as part of the primary flow.

## 3. Architecture overview

```text
Bank email arrives
  -> iOS Shortcuts Automation filters sender
  -> Shortcuts extracts amount, datetime, content using regex
  -> Shortcuts sends JSON + x-ingest-secret to Supabase Edge Function
  -> Edge Function validates and inserts into Postgres with DEFAULT_USER_ID
  -> PWA authenticates with Google via Supabase Auth
  -> PWA fetches authenticated user's transactions from Supabase
  -> Existing dashboard and report components render spending totals
```

The app becomes cloud-first. IndexedDB code may remain in the repository during the transition, but Home and Reports will no longer depend on it for the main user path.

## 4. Supabase schema

### 4.1 `transactions`

```sql
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank text not null check (bank in ('MB', 'ACB')),
  type text not null check (type in ('transfer', 'card', 'balance_alert')),
  amount integer not null check (amount > 0),
  currency text not null default 'VND' check (currency = 'VND'),
  transaction_time timestamptz not null,
  content text not null,
  raw_source text not null default 'email' check (raw_source in ('email')),
  external_hash text not null,
  created_at timestamptz not null default now(),
  unique (user_id, external_hash)
);

create index transactions_user_time_idx
  on public.transactions (user_id, transaction_time desc);
```

`external_hash` prevents duplicate inserts when Shortcuts retries or an automation fires twice. It is computed in the Edge Function from stable normalized fields: `bank`, `type`, `amount`, `transaction_time`, and `content`.

### 4.2 Row-level security

RLS is enabled on `transactions`.

- Authenticated users can select only rows where `user_id = auth.uid()`.
- The frontend does not insert transactions directly.
- The Edge Function inserts with the Supabase service role key after validating `x-ingest-secret`.

## 5. Authentication and ownership

The PWA uses Supabase Auth with Google as the sign-in provider. When not signed in, the app shows a compact sign-in screen. After sign-in, the app renders the normal layout and fetches transactions for the current user.

This is a personal single-user deployment for the ingestion path:

- `DEFAULT_USER_ID` is stored as a Supabase Edge Function secret.
- `INGEST_SECRET` is stored as a Supabase Edge Function secret and copied into the three iOS Shortcuts automations.
- Every valid Shortcuts POST is inserted for `DEFAULT_USER_ID`.

This avoids building multi-user token management now while keeping the public frontend anon key unable to read unauthenticated data.

## 6. Edge Function API

### 6.1 Endpoint

`POST /functions/v1/ingest-transaction`

Required header:

```text
x-ingest-secret: <INGEST_SECRET>
content-type: application/json
```

### 6.2 Request body

```json
{
  "bank": "MB",
  "type": "transfer",
  "amount": 297000,
  "datetime": "2026-07-04 21:48:49",
  "content": "159287 1PEV8",
  "raw_source": "email"
}
```

Allowed values:

- `bank`: `MB` or `ACB`.
- `type`: `transfer`, `card`, or `balance_alert`.
- `amount`: positive integer VND after removing signs, separators, and decimals.
- `datetime`: `YYYY-MM-DD HH:mm:ss`, `DD-MM-YYYY HH:mm:ss`, `DD/MM/YYYY HH:mm:ss`, or ACB embedded `DDMMYY-HH:mm:ss`.
- `content`: non-empty string, trimmed.
- `raw_source`: optional, defaults to `email`; only `email` is accepted.

All incoming datetimes are interpreted as Vietnam local time (`Asia/Ho_Chi_Minh`) before being stored as `timestamptz`. This avoids accidental day shifts when the frontend groups transactions by day or month.

### 6.3 Responses

- `201 Created`: inserted new transaction.
- `200 OK`: duplicate transaction already existed.
- `400 Bad Request`: invalid payload.
- `401 Unauthorized`: missing or wrong ingest secret.
- `500 Internal Server Error`: unexpected insert failure.

The response body is small and Shortcuts-friendly:

```json
{ "ok": true, "status": "inserted" }
```

or

```json
{ "ok": true, "status": "duplicate" }
```

## 7. iOS Shortcuts automations

Create three automations, each with trigger "Email received" and the exact sender filter.

### 7.1 MB transfer

Sender: `mbebanking@mbbank.com.vn`

Fields:

- Amount regex: `Số tiền giao dịch\s*\(VND\)\s*([\d,]+\.\d{2})`
- Content regex: `Nội dung chuyển tiền\s*\n?\s*(.+)`
- Datetime regex: `Ngày, giờ giao dịch:\s*(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})`

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

### 7.2 MB credit card

Sender: `mbcard@mbbank.com.vn`

Fields:

- Amount regex: `Giao dịch gần nhất\s*(-?[\d,]+)\s*VND`
- Content regex: `Nội dung\s*Giao dịch chi tiêu tại\s*(.+)`
- Datetime regex: `Ngày, giờ giao dịch:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})`

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

### 7.3 ACB balance alert

Sender: `mailalert@acb.com.vn`

Fields:

- Amount regex: `Ghi nợ\s*(-?[\d,\.]+)\s*VND`
- Content regex: `Nội dung giao dịch:\s*(.+?)\.`
- Datetime extraction: prefer the timestamp embedded in content when present, e.g. `060726-14:47:32`. Shortcuts can send this raw value; the Edge Function will parse it as `2026-07-06 14:47:32` in Vietnam local time. If only the balance date is available, send that date at local noon to avoid accidentally shifting the day during timezone conversion.

Use only the first Vietnamese match because ACB includes Vietnamese and English sections in one email.

JSON:

```json
{
  "bank": "ACB",
  "type": "balance_alert",
  "amount": 10000,
  "datetime": "2026-07-06 14:47:32",
  "content": "HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA",
  "raw_source": "email"
}
```

## 8. PWA changes

### 8.1 New modules

```text
src/supabase/
  client.ts          - createBrowserClient from env vars
  auth.ts            - signInWithGoogle, signOut, session helpers
  transactions.ts    - listTransactions(), listTransactionsForMonth()
  mapper.ts          - Supabase row -> app Transaction

src/hooks/
  useAuth.ts
  useCloudTransactions.ts

supabase/
  migrations/
    20260706000000_create_transactions.sql
  functions/
    ingest-transaction/
      index.ts
```

### 8.2 Existing screens

- `App.tsx` wraps routes with an auth gate.
- `HomeScreen` reads recent transactions and today's total from Supabase.
- `ReportsScreen` reads current and previous month transactions from Supabase.
- `TransactionRow` can continue rendering the existing `Transaction` shape after mapping.
- `SettingsScreen` removes backup/import from the primary cloud-first path and adds sign-out.

### 8.3 Transaction mapping

The app keeps the current `Transaction` UI type for minimal UI churn:

```ts
Transaction {
  id: row.id,
  amount: row.amount,
  currency: 'VND',
  occurredAt: row.transaction_time,
  merchant: row.content,
  category: classify(row.content) ?? 'others',
  note: `${row.bank} ${row.type}`,
  source: 'bank-email',
  bankHint: row.bank.toLowerCase()
}
```

`TransactionSource` gains `bank-email`. `BankHint` gains `mb` and `acb`.

For phase 1 of the cloud rewrite, categories can be derived client-side from the existing rules. Persisting user category corrections to Supabase is out of scope unless needed after the cloud path is stable.

## 9. Environment and setup

Add `.env.example`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Supabase secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
INGEST_SECRET
DEFAULT_USER_ID
```

Manual setup flow:

1. Create a Supabase project.
2. Enable Google provider in Supabase Auth.
3. Add the local and deployed PWA URLs to Auth redirect allow list.
4. Apply the migration.
5. Deploy `ingest-transaction`.
6. Set Edge Function secrets.
7. Sign in once with Google, copy the resulting user id into `DEFAULT_USER_ID`.
8. Configure three iOS Shortcuts automations with endpoint URL and `x-ingest-secret`.

## 10. Error handling

- Missing Supabase env vars: PWA shows a setup error screen instead of crashing.
- Not signed in: show Google sign-in screen.
- Supabase fetch fails: show retry state in Home and Reports.
- No transactions: show the existing empty state.
- Edge Function receives invalid JSON: return `400` with a stable error code.
- Wrong ingest secret: return `401` with no detailed hint.
- Duplicate email: return `200 duplicate`, not an error.
- Unknown date format: return `400 invalid_datetime`.

## 11. Testing

### Unit tests

- `supabase/mapper`: maps cloud rows into the app `Transaction` shape.
- Edge Function helper validation: accepts the three confirmed payload shapes; rejects invalid bank, type, amount, content, and datetime.
- Date parsing: supports MB `DD-MM-YYYY`, MB card `YYYY-MM-DD`, and ACB embedded `DDMMYY-HH:mm:ss`.
- Hashing: same normalized payload produces same `external_hash`.

### Component tests

- Auth gate shows Google sign-in when no session exists.
- Home shows cloud transactions after authenticated fetch.
- Reports aggregates cloud transactions for month and previous month.
- Fetch error state exposes a retry action.

### Manual verification

- Deploy Supabase project.
- Trigger each Shortcuts automation using one real email sample.
- Confirm Supabase receives exactly one row per email.
- Confirm PWA dashboard updates after refresh.
- Retry the same Shortcuts POST and confirm it returns duplicate without adding another row.

## 12. Migration from local-first app

This is an architecture change, not a data migration.

- Existing local manual/OCR transactions will not automatically upload to Supabase.
- IndexedDB modules can remain temporarily to reduce unrelated refactors.
- Screens touched by the main path should stop calling `db/transactions`.
- Backup/import and offline reminder UI should be removed or hidden from the primary settings path.
- Service worker/PWA install behavior can remain as shell polish, but the app is no longer expected to be useful without network.

## 13. Success criteria

- User can sign in with Google.
- A valid Shortcuts POST creates a Supabase transaction attached to the Google user's id.
- Duplicate Shortcuts POSTs do not duplicate rows.
- Home shows today's spending and recent email-ingested transactions from Supabase.
- Reports show monthly spending from Supabase rows.
- RLS prevents one authenticated user from reading another user's rows.
- No primary screen depends on IndexedDB for transaction data.
