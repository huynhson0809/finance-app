# Money Note Home And Transaction Edit Design

## Goal

Redesign the home screen to feel closer to Money Note and add a full transaction edit screen. A user should be able to tap any recent transaction, review its source metadata, edit the date, note/content, amount, and category, then save or delete it.

## Visual Direction

Use the approved "Faithful Money Note" direction:

- True black app background with dark gray section bands.
- Compact top header and month/period control.
- Summary cells for income, expense, and net.
- Recent transactions as flat rows with a colored icon, title, subtitle, amount, and chevron.
- No inline category select on the home list.
- Bottom navigation stays, but styling should align with the flatter black Money Note surface.

The design should be clean and modern, but not a glass dashboard. Avoid decorative gradients, explanatory feature text, and oversized cards. Use category colors and icons as the main visual affordance.

## Home Screen

The home screen shows:

- Current month label/control.
- Three summary cells: `Thu nhập`, `Chi tiêu`, and `Tổng`.
- Optional budget alert below the summary when relevant.
- Recent transactions grouped visually as rows.
- Add and image-entry workflows remain available through the existing bottom nav/add entry points.

Each row shows:

- Category icon and category color.
- Primary text from merchant, note, or content fallback.
- Secondary text with category and source/date context.
- Signed amount, green for income and neutral/white or red-accented for expense.
- Chevron indicating tap-through.

Tapping a transaction navigates to `/transactions/:id`.

## Transaction Edit Screen

The edit screen follows the Money Note structure:

- Top bar with Back, title `Chỉnh sửa`, and an edit glyph.
- Rows for:
  - `Ngày`: date/time input.
  - `Ghi chú`: editable text sourced from note, merchant, or content.
  - `Tiền chi` or `Tiền thu`: editable positive VND amount.
- Read-only metadata block for:
  - `Nguồn`: Email ngân hàng, Thủ công, Ảnh hóa đơn, or Ảnh ngân hàng.
  - `Ngân hàng`: MB, ACB, or `-`.
  - `Loại`: MB Card, MB eBanking, ACB biến động số dư, Manual, Receipt, or Bank Screenshot.
- Category grid filtered by transaction direction.
- Bottom actions:
  - Primary `Lưu thay đổi`.
  - Secondary `Copy`.
  - Destructive `Xóa`.

The category grid uses the same category metadata as Add and Reports. Expense rows show expense categories; income rows show income categories. Category changes must respect the direction/category database constraint.

## Editable Field Semantics

Amounts remain positive integers in storage. The UI labels and amount sign come from `direction`:

- `direction = expense`: label `Tiền chi`, display negative sign in summaries/lists.
- `direction = income`: label `Tiền thu`, display plus sign in summaries/lists.

For text:

- If a transaction has `merchant`, edit and save `merchant`.
- Else if it has `note`, edit and save `note`.
- Else edit and save `content`.
- For bank-email transactions, saving text updates `content` so the original email-derived memo can be corrected.

Changing source, bank, type, raw source, direction, or bank hint is out of scope for this screen.

## Copy Behavior

`Copy` creates a new user-entered transaction with the currently visible editable values:

- Same amount, date/time, direction, category, and text.
- `source = manual`.
- No bank, raw email, or ingestion metadata copied.

After copy succeeds, navigate back to Home and refresh data. If copy fails, show an inline error.

## Delete Behavior

`Xóa` asks for confirmation before deleting. On confirm:

- Delete the selected cloud transaction if it belongs to the current user.
- Navigate back to Home.
- If delete fails, remain on the edit screen and show an inline error.

## Data And Supabase Changes

Add Supabase helpers:

- `getCloudTransaction(client, id)` returns one mapped transaction.
- `updateCloudTransaction(client, id, update)` updates amount, transaction_time, content, merchant, note, and category.
- `deleteCloudTransaction(client, id)` deletes one transaction.

Add a migration to expand authenticated permissions safely:

- Grant update only on editable columns: `amount`, `transaction_time`, `content`, `merchant`, `note`, `category`.
- Keep metadata fields protected from authenticated update.
- Add a delete policy for `user_id = auth.uid()`.
- Grant delete on `transactions` to authenticated.

Existing bank-email ingestion remains unchanged.

## Routing And State

Add route:

```text
/transactions/:id
```

The edit screen fetches the transaction by id on mount. It owns local form state and does not mutate until the user taps `Lưu thay đổi`, `Copy`, or confirmed `Xóa`.

After save/copy/delete, navigate to `/`. Home refetches through the existing cloud transaction hooks.

## Error Handling

The edit screen handles:

- Missing Supabase config: show setup error.
- Loading state while fetching.
- Not found: show a simple not-found message with Back action.
- Save/copy/delete failure: show inline alert and keep form state.
- Invalid amount/date/category: disable primary action until valid.

## Testing

Add unit tests for Supabase helpers:

- Fetch by id maps one row.
- Full update sends only editable fields.
- Delete filters by id.
- Errors throw readable messages.

Add UI tests:

- Home rows link to `/transactions/:id` and no longer render inline category selects.
- Edit screen renders transaction metadata and category grid.
- Saving sends updated amount/date/text/category.
- Delete confirms before deletion.
- Copy creates a manual transaction with no bank/email metadata.

Run:

```text
pnpm test
pnpm exec tsc -b
pnpm run lint
pnpm run build
```
