# Supabase and iOS Shortcuts Setup

This guide wires the cloud-first email ingestion flow end to end:

1. Supabase stores transactions and authenticates the PWA with Google.
2. The `ingest-transaction` Edge Function receives normalized bank-email fields.
3. iOS Shortcuts Mail automations extract fields from MB and ACB emails, then POST JSON to Supabase.

## Prerequisites

- Supabase CLI installed and logged in with `supabase login`.
- A Supabase project ref, shown in the project URL as `https://<project-ref>.supabase.co`.
- The production PWA URL.
- One Google account that will own the transactions.
- A strong random `INGEST_SECRET`.

## Supabase Project Setup

### 1. Create the project

1. Create a new project in the Supabase dashboard.
2. Copy the project URL and anon key from Project Settings -> API.
3. Copy the service role key from Project Settings -> API. Keep this private.

### 2. Enable Google auth

1. In Google Cloud Console, create an OAuth client for a web application.
2. Add the Supabase auth callback URL to Google:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

For a local Supabase stack, also add:

```text
http://127.0.0.1:54321/auth/v1/callback
```

3. In Supabase, go to Authentication -> Providers -> Google.
4. Enable Google and paste the Google OAuth client ID and client secret.
5. In Google Cloud Console, add Authorized JavaScript origins for the local PWA and production PWA:

```text
http://localhost:5173
http://127.0.0.1:5173
https://<your-production-domain>
```

6. In Supabase, go to Authentication -> URL Configuration.
7. Add redirect URLs for local and production PWA usage. Include the exact bare origins because the app uses `redirectTo: window.location.origin`; wildcard entries are useful for any future callback paths.

```text
http://localhost:5173
http://localhost:5173/**
http://127.0.0.1:5173
http://127.0.0.1:5173/**
https://<your-production-domain>
https://<your-production-domain>/**
```

Set the Site URL to the production PWA URL when deploying.

### 3. Link the local repository

From the repository root:

```bash
supabase link --project-ref <project-ref>
```

### 4. Apply the transaction migrations

The migrations under `supabase/migrations/` create the transaction table, allow bank-email ingestion, and allow signed-in users to add manual, receipt, and bank-screenshot transactions from the PWA.

```text
supabase/migrations/
```

Push pending migrations:

```bash
supabase db push
```

After pulling updates, run `npx supabase db push` so Supabase has the latest transaction columns, including `transactions.direction`, the expanded category constraints, and the category update RLS policy. Without the latest migrations, manual income, manual/image saves, or category edits may fail with a schema or row-level security error.

### 5. Get `DEFAULT_USER_ID`

1. Start the PWA with the Supabase env vars from the next section.
2. Sign in once with Google.
3. In Supabase, open Authentication -> Users.
4. Copy the UUID for the exact Google email/account that will sign into the PWA. This is `DEFAULT_USER_ID`.

If `DEFAULT_USER_ID` belongs to a different auth user, the Edge Function will insert rows for that other user and row-level security will hide the inserted transactions from the signed-in PWA user.

### 6. Set Edge Function secrets

Set all four secrets for the linked project:

```bash
supabase secrets set \
  SUPABASE_URL="https://<project-ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  INGEST_SECRET="<strong-random-secret>" \
  DEFAULT_USER_ID="<auth-user-uuid>"
```

`SUPABASE_SERVICE_ROLE_KEY` must never be exposed in the PWA or Shortcuts.

### 7. Deploy the Edge Function

Deploy `supabase/functions/ingest-transaction`:

```bash
supabase functions deploy ingest-transaction --no-verify-jwt
```

The function uses `x-ingest-secret` instead of Supabase JWT auth because iOS Shortcuts is the ingestion bridge. Redeploy it after pulling updates so bank-email rows include `direction: "expense"`.

Warning: every redeploy must preserve `--no-verify-jwt`, or the equivalent Supabase function config, because Shortcuts do not send Supabase JWTs. If JWT verification is enabled later, the same Shortcut requests will fail before the function can check `x-ingest-secret`.

The repository also pins this setting in `supabase/config.toml`:

```toml
[functions.ingest-transaction]
verify_jwt = false
```

### 8. Configure PWA env

Create the PWA environment file for local development and set the same values in production hosting:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Only use the anon key in the frontend.

## Endpoint Details

Production endpoint:

```text
POST https://<project-ref>.supabase.co/functions/v1/ingest-transaction
```

Required headers:

```text
x-ingest-secret: <INGEST_SECRET>
content-type: application/json
```

The body must be JSON. The function accepts raw matched amount strings or normalized integer VND amounts.

Allowed request fields:

```json
{
  "bank": "MB",
  "type": "transfer",
  "amount": "297,000.00",
  "datetime": "04-07-2026 21:48:49",
  "content": "159287 1PEV8",
  "raw_source": "email",
  "direction": "expense"
}
```

Notes:

- `bank` is `MB` or `ACB`.
- `type` is `transfer`, `card`, or `balance_alert`.
- `raw_source` is optional and defaults to `email`.
- `direction` is optional and defaults to `expense`. Send `income` for ACB `Ghi có` emails. A leading `+` also infers income, including MB card refunds.
- `account_identifier` is optional for `transfer` and `balance_alert`. The Edge Function uppercases it and removes non-alphanumeric mask and separator characters; values that contain no alphanumeric characters are rejected.
- `card_identifier` is optional for `card` and is always stored as its last four decimal digits. For example, `9704.05XX.XXXX.1234`, `**** 1234`, and a full card number ending in `1234` all normalize to `1234`. A provided value with fewer than four digits is rejected.
- `balance_vnd` is optional only for ACB `balance_alert` requests and must be sent together with a valid `account_identifier`. It accepts a nonnegative safe integer or a formatted whole-VND string such as `17,016,222.00`, including zero.
- Datetimes are interpreted as Vietnam local time before storage.
- Existing Shortcuts may omit all three asset fields. They remain valid, and enriched retries dedupe against legacy requests because asset fields are excluded from the external hash.

## iOS Shortcuts Guidance

iOS does not let the PWA or app read Mail, push notifications, or notification content directly. The Shortcut automation is the bridge: Mail triggers it, Shortcuts extracts the fields, and Shortcuts posts the JSON to the Edge Function.

ACB `mailalert@acb.com.vn` can cover both `Ghi nợ` spending and `Ghi có` income when those emails are enabled. A positive-signed MB card amount is retained as a card transaction and inferred as income for refunds.

Create exactly three Mail automations: one for MB transfer, one for MB card, and one for ACB balance alerts. The ACB automation handles both debit and credit with an If branch. For each automation:

1. Trigger: Mail -> Email received.
2. Sender: use the exact sender address from the matching section below.
3. Action: Receive emails as input.
4. Action: Match Text against Shortcut Input with each regex.
5. Action: From each Match Text result, use First Item, then Group 1 / first capture group for the field value. Do not send the full regex match or the whole Matches list.
6. Action: Build a Dictionary with `bank`, `type`, `amount`, `datetime`, `content`, `raw_source`, and any optional fields extracted for that email: `direction`, `account_identifier`, `card_identifier`, or `balance_vnd`. Never add `balance_vnd` unless the same Dictionary also has `account_identifier`.
7. Action: Get Contents of URL.
8. URL: `https://<project-ref>.supabase.co/functions/v1/ingest-transaction`.
9. Method: `POST`.
10. Headers:

```text
x-ingest-secret: <INGEST_SECRET>
content-type: application/json
```

11. Request Body: JSON, using the Dictionary.

Keep "Ask Before Running" off if iOS allows it for the Mail automation.

## Shortcut 1: MB Transfer

Sender:

```text
mbebanking@mbbank.com.vn
```

Regex set:

```text
amount: Số tiền giao dịch\s*:?\s*\(VND\)\s*([\d,]+\.\d{2})
content: Nội dung chuyển tiền\s*:?\s*\n?\s*(.+)
datetime: Ngày,\s*giờ giao dịch\s*:?\s*(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})
account_identifier (optional): Tài khoản trích nợ\s*:?\s*(?:[^\r\n]*-\s*)?([0-9]{4,})\s*\(VND\)
```

Use Group 1 / the first capture group from the first match for each field. If the MB email does not contain the account label above, omit `account_identifier`; do not send an empty Dictionary value. The Edge Function canonicalizes the captured token before matching it to an asset account.

Sample POST JSON:

```json
{
  "bank": "MB",
  "type": "transfer",
  "amount": "297,000.00",
  "datetime": "04-07-2026 21:48:49",
  "content": "159287 1PEV8",
  "raw_source": "email",
  "account_identifier": "00123456789"
}
```

## Shortcut 2: MB Credit Card

Sender:

```text
mbcard@mbbank.com.vn
```

Regex set:

```text
amount: Giao dịch gần nhất\s*([+-]?[\d,]+)\s*VND
content: Nội dung\s*:?\s*([^\r\n]+)
datetime: Ngày,\s*giờ giao dịch\s*:?\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})
card_identifier last four (optional): Thông tin thẻ\s*[0-9*Xx. -]*([0-9]{4})[ \t]*(?=\r?\n|$)
```

Use Group 1 / the first capture group from the first match for each field. Keep the leading `-` or `+`; the Edge Function stores a positive VND amount while using `+` to infer a card refund as income. For `card_identifier`, capture and send only the last four digits with the pattern above. It returns `5248` from `356419....5248` and `1234` from `9704.05XX.XXXX.1234`; its end-of-line check prevents an incomplete mask such as `9704.05XX.XXXX.123` from incorrectly returning `9704`. Omit the field if no valid card identifier is present.

Full masks and full card numbers are accepted for compatibility, but the Edge Function always normalizes them to the last four digits. Do not use the preceding digits to distinguish cards. If multiple cards at the same bank share the same last four digits, automatic matching is ambiguous; resolve the affected card association in asset management.

Sample POST JSON:

```json
{
  "bank": "MB",
  "type": "card",
  "amount": "-52,043",
  "datetime": "2026-07-06 11:19:20",
  "content": "Grab* BWCFLJMBDWRJ-G-1",
  "raw_source": "email",
  "card_identifier": "1234"
}
```

## Shortcut 3: ACB Balance Alert

Sender:

```text
mailalert@acb.com.vn
```

Create one automation for this sender. Extract the shared fields first:

```text
content: Nội dung giao dịch:\s*(.+?)\.
datetime: (\d{6}-\d{2}:\d{2}:\d{2})
account_identifier (optional): ACB trân trọng thông báo tài khoản\s+([0-9]{4,})
balance_vnd (optional): Số dư mới(?: của tài khoản trên)?(?: là)?\s*:?\s*([\d,.]+)\s*VND
```

Then add an If action whose condition is: email body contains `Ghi có`.

- If true, extract `amount` with the credit regex and set `direction` to `income`.
- Otherwise, extract `amount` with the debit regex and omit `direction` or set it to `expense`.

```text
credit amount: Ghi có\s*(\+?[\d,.]+)\s*VND
debit amount: Ghi nợ\s*(-?[\d,.]+)\s*VND
```

Use First Item, then Group 1 / the first capture group, from the first Vietnamese match only. ACB includes Vietnamese and English sections in the same email, and later English matches can duplicate or distort fields. The ACB datetime format `DDMMYY-HH:mm:ss` is accepted directly.

The `account_identifier` and `balance_vnd` captures are shared by both branches. `balance_vnd` is the current post-transaction balance, not the transaction amount. Add it to the Dictionary only when `account_identifier` was also captured successfully; never send a balance snapshot by itself. If either label differs in your ACB template, use the equivalent Vietnamese label and omit `balance_vnd` when the account capture is unavailable.

Debit branch example:

```json
{
  "bank": "ACB",
  "type": "balance_alert",
  "amount": "-10,000.00",
  "datetime": "060726-14:47:32",
  "content": "HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA",
  "raw_source": "email",
  "account_identifier": "00123456789",
  "balance_vnd": "17,016,222.00"
}
```

Credit branch example:

```json
{
  "bank": "ACB",
  "type": "balance_alert",
  "amount": "+6,666.00",
  "datetime": "080726-13:14:07",
  "content": "HUYNH NGOC SON CHUYEN TIEN GD 6189MSCBD2E4DZA8 080726-13:14:07",
  "raw_source": "email",
  "direction": "income",
  "account_identifier": "00123456789",
  "balance_vnd": "17,022,888.00"
}
```

## Verification

Send the same JSON twice. The first request should insert a transaction, and the second request should be treated as a duplicate because the function hashes stable normalized fields.

Example:

```bash
curl -i \
  -X POST "https://<project-ref>.supabase.co/functions/v1/ingest-transaction" \
  -H "x-ingest-secret: <INGEST_SECRET>" \
  -H "content-type: application/json" \
  --data '{
    "bank": "MB",
    "type": "transfer",
    "amount": "297,000.00",
    "datetime": "04-07-2026 21:48:49",
    "content": "159287 1PEV8",
    "raw_source": "email"
  }'
```

Expected first response: HTTP `201` with body:

```json
{
  "ok": true,
  "status": "inserted",
  "transaction_id": "<uuid>",
  "asset_account_id": "<uuid-or-null>",
  "asset_event_id": "<uuid-or-null>"
}
```

Run the same `curl` command again.

Expected second response: HTTP `200` with body:

```json
{ "ok": true, "status": "duplicate" }
```

If the first request returns `duplicate`, that exact transaction was already inserted. Change `content` or `datetime` for a fresh end-to-end insert test.

## Operational Checklist

- Supabase project exists.
- Google provider is enabled in Supabase Auth.
- Local and production PWA redirect URLs are configured.
- All migrations in `supabase/migrations/` have been applied.
- Edge Function `supabase/functions/ingest-transaction` is deployed with `--no-verify-jwt` or the committed `supabase/config.toml` setting.
- Edge Function secrets are set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_SECRET`, `DEFAULT_USER_ID`.
- PWA env is set: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Exactly three iOS Mail automations are enabled: MB transfer, MB card, and one branched ACB balance-alert automation.
