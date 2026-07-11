# Assets, Wallets, and Savings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user asset tracking to Spendly: wallets, bank/card accounts, USD, gold holdings, savings accounts, and internal transfers. The app should show total assets on Home, support wallet selection in manual entry, update asset balances from supported bank email ingestion where identifiers are available, and keep Supabase as the source of truth with React Query caching.

**Architecture:** Add an asset domain layer (`src/assets`) with typed account, event, rate, valuation, and balance helpers. Store persistent asset state in Supabase tables with RLS per user, expose cloud helpers in `src/supabase/assets.ts`, cache through React Query hooks, and integrate balances through transaction save/edit/delete services and the Supabase Edge ingest function. UI changes are additive: Home gets a compact asset summary, Add gets transaction modes plus wallet selection, and a new asset management screen is reachable from Home.

**Tech Stack:** React, TypeScript, Supabase Postgres/RLS, Supabase Edge Functions, React Query, Vitest, existing app CSS and component patterns.

---

## Phase 1: Domain Model and Pure Logic

- [ ] Create `src/assets/types.ts` with the asset domain types.

  Define these exported types:

  ```ts
  export type AssetAccountKind =
    | 'cash'
    | 'bank'
    | 'credit_card'
    | 'savings'
    | 'gold'
    | 'foreign_currency';

  export type AssetCurrency = 'VND' | 'USD';
  export type GoldUnit = 'gram' | 'chi' | 'luong';

  export type AssetEventType =
    | 'opening_balance'
    | 'manual_adjustment'
    | 'expense'
    | 'income'
    | 'transfer_in'
    | 'transfer_out'
    | 'card_refund'
    | 'card_payment'
    | 'bank_email_sync';

  export interface AssetAccount {
    id: string;
    userId?: string;
    kind: AssetAccountKind;
    name: string;
    currency: AssetCurrency;
    balance: number;
    quantity?: number;
    goldUnit?: GoldUnit;
    bank?: string | null;
    accountIdentifier?: string | null;
    cardIdentifier?: string | null;
    includeInTotal: boolean;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
  }

  export interface AssetRate {
    id: string;
    userId?: string;
    pair: 'USD_VND' | 'GOLD_GRAM_VND';
    value: number;
    source: 'auto' | 'manual';
    fetchedAt: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface AssetEvent {
    id: string;
    userId?: string;
    accountId: string;
    counterpartyAccountId?: string | null;
    transactionId?: string | null;
    type: AssetEventType;
    amount: number;
    currency: AssetCurrency;
    balanceAfter?: number | null;
    note?: string | null;
    occurredAt: string;
    createdAt: string;
  }

  export interface AssetSummary {
    totalAssetsVnd: number;
    liquidVnd: number;
    savingsVnd: number;
    liabilityVnd: number;
    byAccount: Array<{
      account: AssetAccount;
      valueVnd: number;
    }>;
  }
  ```

- [ ] Add `tests/assets/valuation.test.ts` covering gold conversion, USD conversion, liabilities, and total summary before writing implementation.

  Include assertions for:
  - `1 luong` equals `37.5 gram`.
  - `1 chi` equals `3.75 gram`.
  - USD value uses the newest `USD_VND` rate.
  - credit card balance reduces total assets as a liability.
  - savings remains included in total assets.

  Example test shape:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { buildAssetSummary, goldQuantityToGrams } from '../../src/assets/valuation';

  describe('asset valuation', () => {
    it('converts Vietnamese gold units to grams', () => {
      expect(goldQuantityToGrams(1, 'luong')).toBe(37.5);
      expect(goldQuantityToGrams(1, 'chi')).toBe(3.75);
    });
  });
  ```

- [ ] Implement `src/assets/valuation.ts`.

  Export:

  ```ts
  export function goldQuantityToGrams(quantity: number, unit: GoldUnit): number;
  export function getRateValue(rates: AssetRate[], pair: AssetRate['pair']): number | null;
  export function valueAssetAccountVnd(account: AssetAccount, rates: AssetRate[]): number;
  export function buildAssetSummary(accounts: AssetAccount[], rates: AssetRate[]): AssetSummary;
  ```

  Rules:
  - VND cash, bank, and savings use `balance`.
  - USD foreign currency uses `balance * USD_VND`.
  - Gold uses `goldQuantityToGrams(quantity, goldUnit) * GOLD_GRAM_VND`.
  - Credit card uses negative `Math.abs(balance)` in total and liability uses positive debt.
  - Exclude accounts where `includeInTotal === false`.
  - Missing rate returns `0` for that non-VND account and keeps the account visible in `byAccount`.

- [ ] Run domain tests.

  Command:

  ```bash
  npm test -- tests/assets/valuation.test.ts
  ```

  Expected: all tests pass.

## Phase 2: Supabase Schema and Data Access

- [ ] Add migration `supabase/migrations/20260711010000_create_assets.sql`.

  Create these tables:

  ```sql
  create table if not exists public.asset_accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null check (kind in ('cash', 'bank', 'credit_card', 'savings', 'gold', 'foreign_currency')),
    name text not null,
    currency text not null check (currency in ('VND', 'USD')),
    balance numeric not null default 0,
    quantity numeric,
    gold_unit text check (gold_unit in ('gram', 'chi', 'luong')),
    bank text,
    account_identifier text,
    card_identifier text,
    include_in_total boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table if not exists public.asset_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    account_id uuid not null references public.asset_accounts(id) on delete cascade,
    counterparty_account_id uuid references public.asset_accounts(id) on delete set null,
    transaction_id uuid references public.transactions(id) on delete set null,
    type text not null,
    amount numeric not null,
    currency text not null check (currency in ('VND', 'USD')),
    balance_after numeric,
    note text,
    occurred_at timestamptz not null,
    created_at timestamptz not null default now()
  );

  create table if not exists public.asset_rates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    pair text not null check (pair in ('USD_VND', 'GOLD_GRAM_VND')),
    value numeric not null,
    source text not null check (source in ('auto', 'manual')),
    fetched_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  ```

  Add:
  - RLS on all three tables.
  - `select`, `insert`, `update`, `delete` policies where `auth.uid() = user_id`.
  - A select policy for `asset_rates` rows with `user_id is null` so global auto rates can be read.
  - Unique index for `(user_id, bank, account_identifier)` where account identifier is not null.
  - Unique index for `(user_id, bank, card_identifier)` where card identifier is not null.
  - Indexes on `asset_events(user_id, occurred_at desc)` and `asset_accounts(user_id, sort_order, created_at)`.

- [ ] Add migration `supabase/migrations/20260711011000_link_transactions_to_assets.sql`.

  Add optional linkage fields:

  ```sql
  alter table public.transactions
    add column if not exists asset_account_id uuid references public.asset_accounts(id) on delete set null,
    add column if not exists counterparty_asset_account_id uuid references public.asset_accounts(id) on delete set null,
    add column if not exists asset_event_id uuid references public.asset_events(id) on delete set null;
  ```

  Add indexes:

  ```sql
  create index if not exists transactions_asset_account_id_idx on public.transactions(asset_account_id);
  create index if not exists transactions_counterparty_asset_account_id_idx on public.transactions(counterparty_asset_account_id);
  ```

- [ ] Add Supabase table typings in `src/supabase/assets.ts`.

  Follow the existing helper style in `src/supabase/categories.ts`: `currentUserId`, `throwIfError`, mapper functions, and type aliases for a Supabase client with custom tables.

  Export:

  ```ts
  export async function listCloudAssetAccounts(client: AssetSupabaseClient): Promise<AssetAccount[]>;
  export async function upsertCloudAssetAccount(client: AssetSupabaseClient, input: AssetAccountInput): Promise<AssetAccount>;
  export async function deleteCloudAssetAccount(client: AssetSupabaseClient, id: string): Promise<void>;
  export async function reorderCloudAssetAccounts(client: AssetSupabaseClient, ids: string[]): Promise<void>;
  export async function listCloudAssetRates(client: AssetSupabaseClient): Promise<AssetRate[]>;
  export async function upsertCloudAssetRate(client: AssetSupabaseClient, input: AssetRateInput): Promise<AssetRate>;
  export async function insertCloudAssetEvent(client: AssetSupabaseClient, input: AssetEventInput): Promise<AssetEvent>;
  export async function listCloudAssetEvents(client: AssetSupabaseClient, accountId?: string): Promise<AssetEvent[]>;
  export async function findCloudAssetAccountByBankIdentifier(
    client: AssetSupabaseClient,
    input: { bank: string; accountIdentifier?: string | null; cardIdentifier?: string | null },
  ): Promise<AssetAccount | null>;
  ```

- [ ] Add tests in `tests/supabase/assets.test.ts`.

  Mock Supabase calls using the same approach as existing Supabase tests. Cover:
  - row-to-domain mapping for all field names.
  - inserting an asset account includes current user id.
  - reorder updates `sort_order`.
  - bank identifier lookup uses `account_identifier` or `card_identifier`.

- [ ] Run Supabase helper tests.

  Command:

  ```bash
  npm test -- tests/supabase/assets.test.ts
  ```

## Phase 3: Query Cache and Hooks

- [ ] Extend `src/query/client.ts` for asset cache keys and stale times.

  Add:

  ```ts
  export const assetQueryKeys = {
    accounts: ['assets', 'accounts'] as const,
    rates: ['assets', 'rates'] as const,
    events: (accountId?: string) => ['assets', 'events', accountId ?? 'all'] as const,
    summary: ['assets', 'summary'] as const,
  };

  export const ASSET_STALE_TIME_MS = 5 * 60 * 1000;

  export async function invalidateAssetQueries(): Promise<void> {
    await spendlyQueryClient.invalidateQueries({ queryKey: ['assets'] });
  }
  ```

- [ ] Create `src/hooks/useAssets.ts`.

  Export hooks:

  ```ts
  export function useAssetAccounts(): UseQueryResult<AssetAccount[]>;
  export function useAssetRates(): UseQueryResult<AssetRate[]>;
  export function useAssetSummary(): UseQueryResult<AssetSummary>;
  export function useAssetEvents(accountId?: string): UseQueryResult<AssetEvent[]>;
  ```

  Behavior:
  - Use Supabase when configured.
  - Return empty arrays when no Supabase client exists.
  - Use `ASSET_STALE_TIME_MS`.
  - `useAssetSummary` combines cached accounts and rates with `buildAssetSummary`.

- [ ] Add `tests/hooks/useAssets.test.tsx`.

  Cover:
  - hooks reuse cached accounts when switching screens.
  - summary recomputes from cached data without refetching categories/transactions.
  - invalidation clears only `assets` query keys.

- [ ] Run hook tests.

  Command:

  ```bash
  npm test -- tests/hooks/useAssets.test.tsx
  ```

## Phase 4: Asset Summary UI and Navigation

- [ ] Create `src/ui/components/AssetSummaryCard.tsx`.

  Layout requirements:
  - Compact card for Home, above or near existing monthly overview.
  - Shows total assets in VND.
  - Shows three rows or chips: liquid, savings, liabilities.
  - Tap/click opens `/assets`.
  - Empty state text: `Chưa thiết lập tài sản`.

- [ ] Add route in `src/App.tsx`.

  Add:

  ```tsx
  <Route path="assets" element={<AssetManagementScreen />} />
  ```

  Use the same import/lazy style as existing screens.

- [ ] Modify `src/ui/HomeScreen.tsx`.

  Add `useAssetSummary()` and render `AssetSummaryCard` without increasing API refetches when switching tabs.

- [ ] Add tests in `tests/ui/HomeScreen.test.tsx`.

  Cover:
  - empty asset summary renders.
  - non-empty total assets renders.
  - clicking asset summary navigates to `/assets`.

- [ ] Run Home screen tests.

  Command:

  ```bash
  npm test -- tests/ui/HomeScreen.test.tsx
  ```

## Phase 5: Asset Management Screen

- [ ] Create `src/ui/AssetManagementScreen.tsx`.

  Required sections:
  - Header: back button, title `Tài sản`, add button.
  - Summary card: total assets, savings, liabilities.
  - Account list grouped by kind:
    - Cash and bank accounts.
    - Credit cards.
    - Savings.
    - Gold and foreign currency.
  - Each row shows name, kind, native balance/quantity, VND value, and bank label if present.

- [ ] Add account create/edit form in the same screen or in `src/ui/components/AssetAccountForm.tsx`.

  Fields:
  - Kind selector: Cash, Bank/Card, Credit card, Savings, Gold, Foreign currency.
  - Name.
  - Currency: VND or USD where relevant.
  - Initial balance or quantity.
  - Gold unit when kind is gold.
  - Bank field when kind is bank or credit card.
  - Account/card identifier optional.
  - Include in total toggle.

  Validation:
  - Name required.
  - Balance/quantity numeric and non-negative for gold and foreign currency.
  - Credit card stored as positive debt in `balance`.

- [ ] Add asset reorder support.

  Reuse the existing drag/drop pattern from `src/ui/CategoryManagerScreen.tsx`: `draggable`, `onDragStart`, `onDragOver`, `onDrop`, and a ref for the dragged row. Persist the final account order through `reorderCloudAssetAccounts`.

- [ ] Add `tests/ui/AssetManagementScreen.test.tsx`.

  Cover:
  - create cash account.
  - create credit card account.
  - create gold account using `chi`.
  - edit account name and balance.
  - reorder accounts.

- [ ] Run asset screen tests.

  Command:

  ```bash
  npm test -- tests/ui/AssetManagementScreen.test.tsx
  ```

## Phase 6: Wallet-Aware Transaction Save/Edit/Delete

- [ ] Extend transaction types in `src/types.ts`.

  Add optional fields to `Transaction`:

  ```ts
  assetAccountId?: string | null;
  counterpartyAssetAccountId?: string | null;
  assetEventId?: string | null;
  ```

  Add input types for wallet-linked saves:

  ```ts
  export interface TransactionAssetLinkInput {
    assetAccountId?: string | null;
  }

  export interface TransferInput {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    currency: AssetCurrency;
    occurredAt: string;
    note?: string;
  }
  ```

- [ ] Update `src/supabase/mapper.ts` and `src/supabase/transactions.ts`.

  Add transaction columns:
  - `asset_account_id`
  - `counterparty_asset_account_id`
  - `asset_event_id`

  Ensure add/update functions accept and return the new fields.

- [ ] Create `src/assets/transactionEffects.ts`.

  Export pure helpers:

  ```ts
  export function expenseEffect(amount: number): number;
  export function incomeEffect(amount: number): number;
  export function creditCardExpenseEffect(amount: number): number;
  export function creditCardRefundEffect(amount: number): number;
  export function transferOutEffect(amount: number): number;
  export function transferInEffect(amount: number): number;
  ```

  Rules:
  - Expense on cash/bank/savings decreases balance.
  - Income on cash/bank/savings increases balance.
  - Expense on credit card increases debt.
  - Refund on credit card decreases debt.
  - Transfer creates two events and leaves total assets unchanged.

- [ ] Add `tests/assets/transactionEffects.test.ts`.

  Cover all rules above.

- [ ] Create a cloud service in `src/assets/save.ts`.

  Export:

  ```ts
  export async function saveTransactionWithAssetEffect(input: SaveTransactionInput & TransactionAssetLinkInput): Promise<Transaction>;
  export async function updateTransactionWithAssetEffect(id: string, input: UpdateTransactionInput & TransactionAssetLinkInput): Promise<Transaction>;
  export async function deleteTransactionWithAssetEffect(id: string): Promise<void>;
  export async function saveAssetTransfer(input: TransferInput): Promise<void>;
  ```

  Implementation rules:
  - Wrap the sequence in clear helper functions. Supabase JS cannot run a database transaction from the client, so keep updates deterministic and invalidate both transaction and asset query keys afterward.
  - For edit/delete, reverse the previous asset event before applying the new effect.
  - If no `assetAccountId` is provided, keep current transaction behavior.
  - Always invalidate `invalidateTransactionQueries()` and `invalidateAssetQueries()` after a successful mutation.

- [ ] Add tests in `tests/assets/save.test.ts`.

  Mock Supabase helpers and verify:
  - manual expense on bank creates transaction and event.
  - income increases selected account.
  - transfer creates two asset events and no expense transaction.
  - deleting a linked transaction reverses its event.

- [ ] Run asset save tests.

  Command:

  ```bash
  npm test -- tests/assets/transactionEffects.test.ts tests/assets/save.test.ts
  ```

## Phase 7: Add Screen Integration

- [ ] Modify `src/ui/AddScreen.tsx` transaction mode.

  Add three modes:
  - `Chi tiêu`
  - `Thu nhập`
  - `Chuyển tiền`

  Keep the current one-screen interaction for income/expense. The top date/note/amount area and submit button stay fixed; the category area is the only scrollable region when categories overflow.

- [ ] Add source wallet selector for income/expense.

  Requirements:
  - Default to the first cash or bank account when available.
  - Allow choosing credit card for expenses.
  - Hide wallet selector when no asset accounts exist and show a small link to create one.
  - For legacy users, saving without a wallet still works.

- [ ] Add transfer form for `Chuyển tiền`.

  Fields:
  - From account.
  - To account.
  - Amount.
  - Date.
  - Note.

  Validation:
  - From and To required.
  - From and To cannot be the same account.
  - Amount must be positive.

- [ ] Update Add screen save handler.

  Use `saveTransactionWithAssetEffect` for income/expense and `saveAssetTransfer` for transfers.

- [ ] Rename the `Cửa hàng` field to `Ghi chú`.

  Use the current `note` field. Do not introduce a separate merchant field in the Add form unless receipt/OCR supplies one.

- [ ] Add tests in `tests/ui/AddScreen.test.tsx`.

  Cover:
  - selecting source wallet for expense.
  - selecting credit card for expense.
  - income mode selects destination wallet.
  - transfer mode saves a transfer.
  - category list scrolls while submit button stays visible.
  - label is `Ghi chú`, not `Cửa hàng`.

- [ ] Run Add screen tests.

  Command:

  ```bash
  npm test -- tests/ui/AddScreen.test.tsx
  ```

## Phase 8: Bank Email Asset Linking

- [ ] Extend ingest payload types in `supabase/functions/_shared/ingest.ts`.

  Add optional normalized fields:

  ```ts
  account_identifier?: string;
  card_identifier?: string;
  balance_vnd?: number;
  ```

  Keep backwards compatibility with existing Shortcut payloads.

- [ ] Extend `supabase/functions/_shared/ingest-handler.ts`.

  Flow:
  - Insert transaction exactly as today.
  - If `bank` and `account_identifier` or `card_identifier` exists, find matching asset account for the user.
  - If not found, auto-create:
    - `kind = 'bank'` for account identifier.
    - `kind = 'credit_card'` for card identifier.
    - `name = '<BANK> <last4>'`.
    - `balance = 0`.
  - For ACB balance emails where `balance_vnd` exists and account is bank, set account balance to `balance_vnd` and write a `bank_email_sync` asset event.
  - For debit expense on bank without current balance, decrease balance by amount.
  - For credit income on bank without current balance, increase balance by amount.
  - For MB credit card expense, increase credit card debt.
  - For MB credit card refund, decrease credit card debt.

- [ ] Add MB credit card refund handling.

  Ingest normalization must treat:

  ```txt
  Giao dịch gần nhất +81,000 VND
  Nội dung Hoàn trả giao dịch tại ...
  ```

  as `direction = 'income'` and `type = 'card_refund'` or equivalent transaction type supported by the UI.

- [ ] Add tests for ingest asset linking.

  Create or extend `tests/ingest/ingest.test.ts`.

  Cover:
  - ACB debit with account identifier updates bank wallet.
  - ACB credit with account identifier updates bank wallet.
  - MB card expense creates/increases credit card debt.
  - MB card refund decreases credit card debt.
  - Missing identifier falls back to current transaction-only insert.

- [ ] Run ingest tests.

  Command:

  ```bash
  npm test -- tests/ingest/ingest.test.ts
  ```

## Phase 9: Rates and Manual Overrides

- [ ] Create `supabase/functions/fetch-asset-rates/index.ts`.

  Behavior:
  - Reads provider configuration from environment variables:
    - `USD_VND_RATE_URL`, defaulting to `https://open.er-api.com/v6/latest/USD`.
    - `GOLD_XAU_USD_RATE_URL`, defaulting to `https://www.goldapi.io/api/XAU/USD`.
    - `GOLD_API_KEY`, used as the `x-access-token` header for GoldAPI requests.
  - Fetches USD/VND from the ExchangeRate-API open-access response at `rates.VND`.
  - Fetches XAU/USD from GoldAPI when `GOLD_API_KEY` exists.
  - Converts XAU/USD to gold gram/VND with `xauUsd * usdVnd / 31.1034768`.
  - Upserts global `asset_rates` rows with `user_id = null` and `source = 'auto'`.
  - Returns cached rows when a provider request fails or when no GoldAPI token is configured.

- [ ] Create `src/supabase/rates.ts` for manual rate overrides.

  Manual override behavior:
  - User-created rate rows have `user_id = current user`.
  - `useAssetRates()` prefers user manual rate over global auto rate for the same pair.
  - The module exports `listCloudAssetRates`, `upsertCloudAssetRate`, and `refreshCloudAssetRates`.

- [ ] Add a rate management section to `AssetManagementScreen`.

  Required controls:
  - Display latest USD/VND rate and fetched time.
  - Display latest gold gram/VND rate and fetched time.
  - Manual override inputs for both pairs.
  - Button to refresh auto rates by invoking the Edge Function.

- [ ] Add tests for rate selection.

  Create `tests/assets/rates.test.ts`.

  Cover:
  - manual user USD/VND overrides global auto USD/VND.
  - global auto rate is used when no user rate exists.
  - missing rate keeps non-VND account value at `0`.

- [ ] Run rate tests.

  Command:

  ```bash
  npm test -- tests/assets/rates.test.ts
  ```

## Phase 10: Cache, Regression Tests, and Manual QA

- [ ] Run focused unit tests for assets and touched UI.

  Command:

  ```bash
  npm test -- tests/assets tests/supabase/assets.test.ts tests/hooks/useAssets.test.tsx tests/ui/AssetManagementScreen.test.tsx tests/ui/AddScreen.test.tsx tests/ingest/ingest.test.ts
  ```

- [ ] Run the full test suite.

  Command:

  ```bash
  npm test
  ```

- [ ] Run production build.

  Command:

  ```bash
  npm run build
  ```

- [ ] Start local dev server for visual QA.

  Command:

  ```bash
  npm run dev
  ```

  Verify in browser:
  - Home renders total assets without layout overlap.
  - Switching Home, Calendar, Add, Reports, Settings does not refetch asset accounts on every tab change.
  - Add screen keeps date/note/amount and submit button visible while only categories scroll.
  - Asset screen creates cash, bank, credit card, savings, USD, and gold accounts.
  - Transfer from bank to savings leaves total assets unchanged.
  - Credit card expense increases liability.
  - Credit card refund decreases liability.

- [ ] Commit after each completed phase.

  Suggested commit messages:
  - `feat: add asset domain model`
  - `feat: add asset persistence`
  - `feat: show asset summary`
  - `feat: manage asset accounts`
  - `feat: link transactions to assets`
  - `feat: support transfers in add screen`
  - `feat: link bank emails to assets`
  - `feat: add asset rate refresh`

## Deployment Notes

- [ ] Apply Supabase migrations before testing on a real device.

  Command:

  ```bash
  supabase db push
  ```

- [ ] Deploy Edge Function changes after tests pass.

  Commands:

  ```bash
  supabase functions deploy ingest-transaction
  supabase functions deploy fetch-asset-rates
  ```

- [ ] Configure Edge Function secrets.

  Commands:

  ```bash
  supabase secrets set USD_VND_RATE_URL="https://open.er-api.com/v6/latest/USD"
  supabase secrets set GOLD_XAU_USD_RATE_URL="https://www.goldapi.io/api/XAU/USD"
  supabase secrets set GOLD_API_KEY="$GOLD_API_KEY"
  ```

  Keep manual override available so the app remains usable when an external rate provider is unavailable or the GoldAPI token is not configured.
