# Email Category Assignment and Editing Design

## Goal

Bank-email transactions should enter Supabase with a useful category derived from the transaction content. If the automatic category is wrong, the user can edit that transaction's category in the PWA and the corrected value is saved back to Supabase.

## Scope

- Categorize new email-ingested transactions from `content` before insert.
- Keep generic transfer wording from forcing every bank transfer into `transfers-debt`.
- Let the user edit the category of a visible transaction.
- Persist category edits to `public.transactions.category`.
- Refresh recent transactions and month totals after a successful edit.
- Show a visible error if the edit cannot be saved.

This design does not add full cloud rule learning yet. Manual/image entry can continue to use the existing local learned-rule behavior. Cloud rule learning can be added later once category corrections are reliable at the transaction level.

## Data Model

`public.transactions.category` already exists from the user-entered transaction migration and accepts the app's category enum. Email rows can use this same nullable column.

No new table is required for this step.

Row-level security needs an update policy so authenticated users can update their own transaction category from the PWA:

- `for update`
- `to authenticated`
- `using (user_id = auth.uid())`
- `with check (user_id = auth.uid())`

## Backend Ingest

The Edge Function should classify the normalized `content` before inserting the row.

Classification uses the same seed categories as the client, but excludes generic transfer markers such as `transfer` and `chuyen khoan`. This prevents MB/ACB transfer emails from all becoming `transfers-debt` just because the bank email says "chuyển khoản".

Examples:

- `Grab* BWCFLJMBDWRJ-G-1` -> `transportation`
- `Shopee` -> `shopping`
- `Highlands Coffee` -> `coffee-bubble-tea`
- `159287 1PEV8` -> `others`
- `HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32...` -> `others` unless it contains a stronger merchant keyword

The inserted row should include `category`.

## Client Mapping

When reading Supabase rows:

- If `category` is present, use it directly.
- If `category` is absent on an older email row, keep the current fallback classifier so old data still displays a category.
- Manual, receipt, and bank-screenshot rows continue to use their stored category directly.

## Editing Flow

Each transaction row should expose a compact category control. The first implementation can use a simple select-like control or a small button that opens the existing category chips. The important behavior is:

1. User opens category editor for a transaction.
2. User chooses a category.
3. App sends an update to Supabase for that transaction id.
4. On success, Home reloads recent transactions and month transactions so both the list and totals update.
5. On failure, the row or screen shows a visible error and keeps the previous category.

The UI should avoid large layout shifts in the transaction list.

## Supabase API

Add an update function alongside the existing list and insert helpers:

- `updateCloudTransactionCategory(client, id, category)`

It updates only `category` and returns the mapped transaction row. Errors should throw with the Supabase message so the UI can display it.

## Error Handling

- Ingest insert failures keep the current Edge Function behavior.
- Category edit failures show a visible alert in the PWA.
- Duplicate email handling remains based on `external_hash` and is unchanged.

## Testing

Add tests for:

- Ingest classification stores `category` for known merchant content.
- Ingest classification ignores generic transfer wording.
- Supabase category update sends the correct update payload and maps the returned row.
- Transaction row exposes an edit category action.
- Home reloads transaction data after a successful category edit.
- Home shows an error after a failed category edit.

## Rollout Notes

After implementation, the user must push the new migration before category edits work in production:

```bash
npx supabase db push
```
