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

After pulling updates, run `npx supabase db push` so Supabase has the latest transaction columns and the category update RLS policy. Without the latest migrations, manual/image saves or category edits may fail with a schema or row-level security error.

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

The function uses `x-ingest-secret` instead of Supabase JWT auth because iOS Shortcuts is the ingestion bridge.

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
  "raw_source": "email"
}
```

Notes:

- `bank` is `MB` or `ACB`.
- `type` is `transfer`, `card`, or `balance_alert`.
- `raw_source` is optional and defaults to `email`.
- Datetimes are interpreted as Vietnam local time before storage.

## iOS Shortcuts Guidance

iOS does not let the PWA or app read Mail, push notifications, or notification content directly. The Shortcut automation is the bridge: Mail triggers it, Shortcuts extracts the fields, and Shortcuts posts the JSON to the Edge Function.

Current data limitation: the bank emails in this phase cover debit and spending only. Income push notifications are not readable by the PWA/app or by this ingestion flow in this phase.

Create one Mail automation per sender. For each automation:

1. Trigger: Mail -> Email received.
2. Sender: use the exact sender address from the matching section below.
3. Action: Get Details of Emails -> Message.
4. Action: Match Text against Message with each regex.
5. Action: From each Match Text result, use the first match and Group 1 / first capture group for the field value. Do not send the full regex match.
6. Action: Build a Dictionary with `bank`, `type`, `amount`, `datetime`, `content`, and `raw_source`.
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
amount: Số tiền giao dịch\s*\(VND\)\s*([\d,]+\.\d{2})
content: Nội dung chuyển tiền\s*\n?\s*(.+)
datetime: Ngày, giờ giao dịch:\s*(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})
```

Use Group 1 / the first capture group from the first match for each field.

Sample POST JSON:

```json
{
  "bank": "MB",
  "type": "transfer",
  "amount": "297,000.00",
  "datetime": "04-07-2026 21:48:49",
  "content": "159287 1PEV8",
  "raw_source": "email"
}
```

## Shortcut 2: MB Credit Card

Sender:

```text
mbcard@mbbank.com.vn
```

Regex set:

```text
amount: Giao dịch gần nhất\s*(-?[\d,]+)\s*VND
content: Nội dung\s*Giao dịch chi tiêu tại\s*(.+)
datetime: Ngày, giờ giao dịch:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})
```

Use Group 1 / the first capture group from the first match for each field. Keep the leading minus sign if the email includes it; the Edge Function normalizes spending amounts to positive VND.

Sample POST JSON:

```json
{
  "bank": "MB",
  "type": "card",
  "amount": "-52,043",
  "datetime": "2026-07-06 11:19:20",
  "content": "Grab* BWCFLJMBDWRJ-G-1",
  "raw_source": "email"
}
```

## Shortcut 3: ACB Balance Alert

Sender:

```text
mailalert@acb.com.vn
```

Regex set:

```text
amount: Ghi nợ\s*(-?[\d,\.]+)\s*VND
content: Nội dung giao dịch:\s*(.+?)\.
datetime: (\d{6}-\d{2}:\d{2}:\d{2})
```

Use the first Vietnamese match only. ACB includes Vietnamese and English sections in the same email, and later English matches can duplicate or distort the transaction fields.

Use Group 1 / the first capture group from the first match for each field. The ACB datetime format `DDMMYY-HH:mm:ss` is accepted directly by the Edge Function.

Sample POST JSON:

```json
{
  "bank": "ACB",
  "type": "balance_alert",
  "amount": "-10,000.00",
  "datetime": "060726-14:47:32",
  "content": "HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA",
  "raw_source": "email"
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
{ "ok": true, "status": "inserted" }
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
- All three iOS Mail automations are enabled.
