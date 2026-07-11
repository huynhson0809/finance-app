# Assets, Wallets, And Savings Design

## Goal

Add an asset layer to Spendly so the app can show the user's total money, wallets, savings, gold, USD holdings, and credit card liabilities alongside the existing expense tracking features.

The feature should answer:

- How much money/assets do I have in total?
- How much is spendable right now?
- How much is locked away as savings?
- How much credit card debt do I owe?
- Which wallet did a transaction affect?

The design keeps existing transaction, report, category, OCR, and bank email flows intact.

## Product Decisions

The approved direction is:

- Use a hybrid snapshot plus light ledger model.
- Store asset data in Supabase per authenticated user from the first version.
- Keep a lightweight local cache for fast reads and offline display, but cloud is the source of truth.
- Home shows a compact total-assets block.
- Detailed management lives behind the Home assets block and Settings links, not as a new bottom tab.
- Add screen gains a third mode: `Expense | Income | Transfer`.
- Savings are real asset accounts, not expenses.
- Transfers into savings do not count as spending.
- MB credit card is a liability account.
- Unknown bank accounts/cards detected from email are auto-created with balance `0`.
- Gold and USD holdings store native quantity and are converted to VND for totals.
- FX and gold prices use automatic fetching plus manual override fallback.

## Core Concepts

### Asset Account

An asset account is anything that contributes to net worth:

- Cash wallet.
- Bank account.
- Savings bucket.
- Gold holding.
- Foreign currency holding.
- Credit card liability.

Each account belongs to one Supabase user. Custom asset accounts do not leak between users.

### Asset Event

An asset event records why an account balance changed.

Examples:

- User manually sets initial cash balance.
- Manual expense paid from ACB.
- Bank email expense detected from MB account.
- Transfer from ACB to savings.
- Credit card expense increases liability.
- Credit card refund decreases liability.
- Manual correction to a wallet balance.

The app stores both a current snapshot on the account and events for audit/debugging. The event log does not need to be a full double-entry accounting system in phase one.

### Bank Mapping

Bank mappings connect detected email identifiers to asset accounts.

Examples:

- `ACB account 8920026868` -> `ACB main`.
- `MB account 8920026789999` -> `MB thanh toán`.
- `MB card 356419....5248` -> `MB Credit Card`.

If the ingestion system sees a new identifier, it creates an account and mapping automatically.

## Data Model

### `asset_accounts`

Columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `name text not null`
- `kind text not null`
- `currency text not null`
- `quantity numeric null`
- `balance_vnd bigint not null default 0`
- `is_liability boolean not null default false`
- `bank text null`
- `account_identifier text null`
- `include_in_net_worth boolean not null default true`
- `include_in_spendable boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Allowed `kind` values:

- `cash`
- `bank`
- `credit_card`
- `savings`
- `gold`
- `foreign_currency`

Allowed currencies for phase one:

- `VND`
- `USD`
- `XAU`

For VND accounts, `balance_vnd` is the actual current balance.

For USD and gold accounts, `quantity` stores the native amount and `balance_vnd` stores the last calculated value using the current cached or overridden rate.

For credit cards, `is_liability = true` and `balance_vnd` represents debt owed. Net worth subtracts it.

Default spendable behavior:

- Cash and bank accounts: `include_in_spendable = true`.
- Savings accounts: `include_in_spendable = false`.
- Gold accounts: `include_in_spendable = false`.
- Foreign currency accounts: `include_in_spendable = true` by default, editable by the user.
- Credit card liabilities: `include_in_spendable = false`.

### `asset_events`

Columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `account_id uuid null references asset_accounts(id)`
- `counterparty_account_id uuid null references asset_accounts(id)`
- `transaction_id uuid null references transactions(id)`
- `event_type text not null`
- `amount_vnd bigint not null`
- `quantity_delta numeric null`
- `currency text not null`
- `occurred_at timestamptz not null`
- `note text null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Allowed `event_type` values:

- `initial_balance`
- `manual_adjustment`
- `transaction`
- `transfer`
- `credit_card_payment`
- `rate_revaluation`
- `email_auto_create`

Transfers use one event with `account_id` as source and `counterparty_account_id` as destination. The service layer applies the debit and credit to snapshots.

### `bank_account_mappings`

Columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `bank text not null`
- `identifier_type text not null`
- `identifier text not null`
- `asset_account_id uuid not null references asset_accounts(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique key:

- `(user_id, bank, identifier_type, identifier)`

Allowed `identifier_type` values:

- `bank_account`
- `card`

### `asset_rates`

Columns:

- `id uuid primary key`
- `user_id uuid null references auth.users(id)`
- `rate_key text not null`
- `base_currency text not null`
- `quote_currency text not null`
- `rate numeric not null`
- `source text not null`
- `is_manual_override boolean not null default false`
- `fetched_at timestamptz not null`
- `expires_at timestamptz null`

Supported phase-one rate keys:

- `USD_VND`
- `GOLD_GRAM_VND`

`user_id = null` can hold shared fetched rates. User-specific rows hold manual overrides.

## Supabase Security

All user-owned asset tables use RLS:

- Authenticated users can read their own rows.
- Authenticated users can insert their own rows.
- Authenticated users can update their own rows.
- Authenticated users can delete or archive their own rows where deletion is safe.

Service-role Edge Functions may create/update accounts and mappings during email ingestion.

## Account Valuation Rules

Net worth:

```text
netWorth = positiveAssetsVnd - liabilitiesVnd
```

Spendable balance:

```text
spendable = cash + bank accounts + foreign currency accounts marked spendable - credit card liabilities
```

Savings balance:

```text
savings = sum(savings accounts)
```

Gold:

```text
goldVnd = goldQuantityInGrams * goldGramVndRate
```

USD:

```text
usdVnd = usdQuantity * usdVndRate
```

Gold units:

- 1 luong = 10 chi.
- 1 chi = 3.75 grams.
- 1 luong = 37.5 grams.

The UI can accept grams, chi, or luong, but storage normalizes gold quantity for valuation.

## Home UI

Home adds a compact asset summary near the top.

It shows:

- Total net worth.
- Spendable money.
- Savings.
- Credit card debt.

The block opens an Asset Management screen.

The existing monthly expense/income/budget widgets remain below it. This keeps Home as the command center without adding a new bottom nav item.

## Asset Management UI

Asset Management shows:

- Net worth header.
- Sections:
  - Cash and bank.
  - Savings.
  - Gold.
  - Foreign currency.
  - Credit cards/liabilities.
- Add asset button.
- Edit balance/detail action for each account.
- Manual refresh rates action.
- Rate override settings for USD and gold.

The add asset flow supports:

- Cash wallet.
- Bank card/account with name and optional bank identifier.
- Savings account with name and target note.
- Gold holding with unit selector: gram, chi, luong.
- USD holding.
- Credit card liability.

## Add Screen UI

The Add screen segmented control becomes:

```text
Expense | Income | Transfer
```

### Expense

Fields:

- Date/time.
- Note.
- Amount.
- Source wallet/card.
- Category.

Saving an expense:

- Creates/updates the existing transaction row.
- Creates an asset event if a source account is selected.
- Decreases asset account balance for cash/bank.
- Increases liability for credit card account.

### Income

Fields:

- Date/time.
- Note.
- Amount.
- Destination wallet.
- Category.

Saving income:

- Creates/updates the existing transaction row.
- Creates an asset event if destination account is selected.
- Increases cash/bank/savings account balance.

### Transfer

Fields:

- Date/time.
- Amount.
- From account.
- To account.
- Note.

Transfer covers:

- Wallet to wallet.
- Wallet to savings.
- Savings withdrawal.
- Credit card payment.

Transfers are not expense/income report transactions. They show in asset history and optional balance change reports.

## Bank Email Ingestion

### ACB

ACB email may contain:

- Account identifier.
- Amount.
- Direction.
- Content.
- New balance.

Behavior:

- If account mapping exists, use the mapped asset account.
- If mapping does not exist, create `ACB <last4>` bank account with balance `0`, then create mapping.
- If email contains new balance, update the account snapshot to that balance.
- Create an asset event linked to the transaction.

### MB eBanking Transfer

MB transfer email may contain:

- Debit account identifier.
- Amount.
- Direction.
- Content.

Behavior:

- If source account mapping exists, use it.
- If mapping does not exist, create `MB <last4>` bank account with balance `0`, then create mapping.
- Apply debit/credit based on parsed direction.
- Create an asset event linked to the transaction.

### MB Credit Card

MB card email may contain:

- Card masked identifier.
- Amount.
- Direction.
- Content.

Behavior:

- If card mapping exists, use it.
- If mapping does not exist, create `MB Card <last4>` liability account with balance `0`, then create mapping.
- Expense increases liability.
- Refund/payment notification decreases liability if parsed as credit/refund.
- Create an asset event linked to the transaction.

## Exchange Rate Strategy

Rates are retrieved through a small service layer, preferably via Supabase Edge Function so API keys and provider quirks stay out of the client.

Phase-one behavior:

- Fetch USD/VND and gold price when the asset screen opens and cached rate is stale.
- Cache rates in Supabase.
- Allow user-specific manual override in Settings or Asset Management.
- If API fetch fails, keep using the last cached value.
- If no rate exists, show the asset quantity but exclude that account from net-worth totals until a rate is available or manually entered.

## Transaction Compatibility

Existing transactions remain valid.

New optional nullable fields are added to transactions during this feature:

- `asset_account_id`
- `counterparty_asset_account_id`
- `asset_event_id`

Old transactions without asset links continue to appear in reports and calendar.

Editing a transaction with an asset link must adjust the related asset event/snapshot. If the user changes the wallet, the service reverses the old effect and applies the new one.

Deleting a transaction with an asset link must reverse its asset effect.

## Error Handling

- If asset account update fails after transaction save, surface a warning and keep the transaction. The transaction should be marked as needing asset sync if possible.
- If email ingestion cannot update/create asset account, it should still insert the transaction and log the asset-link failure.
- If exchange rate fetch fails, use cached/override value.
- If a credit card payment transfer would make liability negative, allow it but show the account as overpaid credit.
- If a user manually adjusts balance, record a `manual_adjustment` event.

## Reporting

Existing expense/income reports continue to ignore transfers and savings transfers.

New asset-aware views:

- Home asset summary.
- Asset Management account list.
- Asset history per account.
- Optional future balance change report can use asset events.

Savings transfers do not appear as expenses. They appear only in asset history and savings totals.

## Testing

Add focused test coverage:

- Asset valuation helpers:
  - Net worth subtracts liabilities.
  - Spendable excludes savings by default.
  - USD and gold conversion use cached or overridden rates.
  - Gold unit conversion among gram/chi/luong.
- Supabase mappers:
  - Asset accounts.
  - Asset events.
  - Bank mappings.
  - Rates.
- Service layer:
  - Manual expense updates cash/bank balance.
  - Credit card expense increases liability.
  - Transfer to savings does not create expense transaction.
  - Credit card payment decreases liability and source wallet.
  - Editing/deleting linked transactions reverses old asset effects.
- Email ingestion:
  - ACB creates/matches bank account.
  - ACB new balance updates snapshot.
  - MB transfer creates/matches bank account.
  - MB card creates/matches liability account.
- UI:
  - Home shows asset summary.
  - Asset Management lists account sections.
  - Add screen transfer mode saves a transfer.
  - Expense/income forms can select wallet.

Run before handoff:

```text
npm test
npm run lint
npm run build
```

## Implementation Phases

### Phase 1: Cloud Data And Asset Summary

- Create Supabase migrations for asset accounts, events, mappings, rates.
- Add TypeScript types and Supabase client helpers.
- Add valuation helpers.
- Add Home asset summary using cloud data.

### Phase 2: Asset Management

- Add asset management route.
- Add/edit cash, bank, savings, credit card, USD, and gold accounts.
- Add manual balance adjustment with event logging.
- Add rate display and manual override.

### Phase 3: Add Screen Transfer And Wallet Selection

- Add transfer mode.
- Add wallet selection to expense/income.
- Save asset events and update snapshots.
- Keep transfers out of expense reports.

### Phase 4: Email Asset Linking

- Extend ingestion parsing to extract account/card identifiers reliably.
- Auto-create bank accounts and credit card liabilities.
- Create bank mappings.
- Link inserted transactions to asset events.

### Phase 5: Reconciliation And Editing

- Make transaction edit/delete reverse and reapply asset effects.
- Add asset sync warnings for failed updates.
- Add per-account asset history.

This phased rollout keeps Spendly usable after each phase and avoids making existing expense tracking depend on the entire asset system landing at once.
