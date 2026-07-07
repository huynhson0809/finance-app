# Money Note-Inspired Input Phase 1 Design

## Goal

Evolve the finance PWA toward a Money Note-like daily money tracker, starting with the input experience. Phase 1 focuses on fast manual entry with real expense and income support while preserving the app's existing bank-email automation and image/OCR entry paths.

The UI should feel closer to Money Note's simple input flow, but it does not need to be a pixel clone. Functionality and data correctness are more important than visual polish in this phase.

## Current Context

The app is now cloud-first:

- Supabase is the source of truth for transactions.
- Google sign-in gates the PWA.
- Bank email automation inserts spending transactions through the Supabase Edge Function.
- Manual entry and image/OCR entry save user-entered transactions to Supabase.
- Transactions currently model spending only. Existing rows should continue to behave as expenses.

Money Note's key pattern from the supplied screenshots is:

- Bottom tabs: input, calendar, reports, budget, more.
- Input screen starts with expense/income segmented control.
- User chooses date, note, amount, category, then taps one large submit button.
- Reports and budget distinguish income, expense, and net balance.

Phase 1 implements the input and data foundation for that model. Calendar and full Money Note-style reports/budget screens remain later phases.

## Scope

Phase 1 includes:

- Add a transaction direction model: `expense` or `income`.
- Existing rows default to `expense`.
- Bank-email automation always inserts `expense`.
- Manual Add screen supports both `expense` and `income`.
- Add basic income categories.
- Save manual income rows to Supabase.
- Read Supabase rows back with their direction.
- Update Home and Reports totals enough to distinguish expense, income, and net.
- Keep image/OCR add working as `expense` in this phase.
- Keep category editing for expense rows working.

Phase 1 does not include:

- Full calendar tab.
- Full Money Note report drilldowns.
- Custom categories UI.
- Recurring/fixed income and expense settings.
- Multi-account ledger.
- Passcode lock, widgets, export/PDF, theme/app icon customization.
- Automatic income ingestion from bank email. The user's banks currently do not send income email notifications.

## Data Model

Add `direction` to transactions:

```ts
type TransactionDirection = 'expense' | 'income';
```

Update `Transaction`:

```ts
interface Transaction {
  id: string;
  amount: number;
  currency: 'VND';
  occurredAt: string;
  merchant?: string;
  category: Category;
  direction: TransactionDirection;
  note?: string;
  source: TransactionSource;
  bankHint?: BankHint;
  createdAt: string;
  updatedAt: string;
}
```

`amount` remains a positive integer VND for both income and expense. Reports decide whether the amount contributes to income or expense by reading `direction`. This avoids negative amount bugs in existing budget logic.

## Categories

Keep existing expense categories:

- `food-drinks`
- `coffee-bubble-tea`
- `transportation`
- `shopping`
- `bills-utilities`
- `healthcare`
- `entertainment`
- `transfers-debt`
- `others`

Add income categories:

- `salary`
- `allowance`
- `bonus`
- `side-income`
- `investment`
- `temporary-income`

The app should expose category sets by direction:

```ts
EXPENSE_CATEGORIES
INCOME_CATEGORIES
CATEGORIES
```

`CATEGORIES` can remain the combined list for shared constraints, but input and reports should use the direction-specific lists where possible.

## Supabase Schema

Add a migration that:

- Adds `direction text not null default 'expense'`.
- Adds a check constraint for `direction in ('expense', 'income')`.
- Expands the `transactions_category_check` constraint to allow the new income categories.
- Keeps old rows valid as `expense`.

Insertion behavior:

- Edge Function email ingestion sets `direction: 'expense'`.
- Manual expense inserts set `direction: 'expense'`.
- Manual income inserts set `direction: 'income'`.
- Image/OCR inserts set `direction: 'expense'` in phase 1.

Update behavior:

- Existing category update can continue updating category only.
- Phase 1 does not need row editing for direction after save.

## Manual Input Flow

Replace the current manual Add screen with a basic Money Note-inspired flow:

1. Segmented control: `Tiền chi` / `Tiền thu`.
2. Date row, defaulting to today.
3. Note/merchant row.
4. Amount row and keypad.
5. Category grid filtered by selected direction.
6. Large submit button:
   - Expense: `Nhập khoản chi`
   - Income: `Nhập khoản thu`

The UI should be dark-ish and simple:

- Dark page background.
- Rows separated by thin borders.
- Category grid buttons.
- Basic icon or text category labels are acceptable in phase 1.
- No advertising space.
- No exact Money Note clone requirement.

Image add remains available from the input screen. It can be a secondary button such as `Thêm bằng ảnh`.

## Reports and Home Behavior

Home should remain useful without becoming a full Money Note calendar:

- Expense totals continue to drive `Chi hôm nay`.
- Add `Thu hôm nay` if income rows exist or if the layout can fit it cleanly.
- Recent transaction rows should indicate income vs expense through sign/color/text.

Reports should separate:

- Total expense.
- Total income.
- Net = income - expense.

Existing budget logic must use only expense rows. Income should not reduce category spending or make budget progress negative.

## Image/OCR Flow

In phase 1, image/OCR-confirmed transactions remain expenses:

- `source: 'receipt'` or `source: 'bank-screenshot'`.
- `direction: 'expense'`.
- Existing OCR extraction and confirmation flow stays intact.

Later, the confirm screen can add an expense/income segmented control if needed.

## Email Automation Flow

Email automation stays expense-only:

- MB transfer email -> `expense`.
- MB card email -> `expense`.
- ACB debit/balance alert email -> `expense`.

No attempt is made to derive income from push notifications. Income can be added manually until the user has an email/API income source.

## Error Handling

- If manual save fails, keep the existing visible save error behavior.
- If the user switches direction after selecting a category, reset category if it is not valid for the new direction.
- If Supabase is missing the new migration, manual income save should surface the Supabase schema/check error on screen.
- Existing cloud fetch errors remain unchanged.

## Testing

Add tests for:

- Supabase mapper defaults old rows without `direction` to `expense`.
- Supabase insert helper sends `direction` for manual expense and income.
- Edge ingest inserts `direction: 'expense'`.
- Add screen can save an income transaction with an income category.
- Add screen can save an expense transaction with an expense category.
- Switching direction filters category options and resets invalid selected category.
- Reports aggregate income and expense separately.
- Budget status ignores income rows.
- Existing image/OCR save still produces `direction: 'expense'`.

## Rollout Notes

After implementation, run:

```bash
npx supabase db push
npx supabase functions deploy ingest-transaction --no-verify-jwt
```

The migration is required before income rows can be saved. The Edge Function redeploy is required so email-ingested rows include `direction: 'expense'`.
