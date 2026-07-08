# Money Note Phase 1 Add And Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the manual Add screen compact enough for one normal iPhone viewport and move email automation setup out of Add into Settings.

**Architecture:** Keep transaction saving logic unchanged, but replace the Add screen's custom keypad-driven layout with a direct numeric amount field and compact category grid. Add Settings copy for email automation as an informational support section; no automation setup is performed inside the PWA.

**Tech Stack:** React, TypeScript, React Router, i18next, Vitest, React Testing Library, Tailwind CSS, lucide-react.

---

## File Structure

- Modify `tests/ui/AddScreen.test.tsx`: update manual entry tests to type amount into the new numeric input; assert Link Email is gone and category management entry exists.
- Modify `tests/ui/SettingsScreen.test.tsx`: add coverage for the Email Automation support section.
- Modify `src/ui/AddScreen.tsx`: remove Link Email tile and custom keypad from the manual Add surface; add compact Money Note-style amount/date/note/category layout.
- Modify `src/ui/components/CategoryChips.tsx`: add compact density support so Add can use smaller category tiles while Confirm keeps current tile sizing.
- Modify `src/ui/components/primitives/CategoryIconTile.tsx`: support compact density classes through props.
- Modify `src/ui/AddImageButton.tsx`: add a compact icon-button variant for the Add screen header/action row.
- Modify `src/ui/SettingsScreen.tsx`: add the Email Automation support section.
- Modify `src/i18n/vi.json` and `src/i18n/en.json`: add Add and Settings labels used by the new UI.

## Task 1: Add Screen Tests

**Files:**
- Modify: `tests/ui/AddScreen.test.tsx`

- [ ] **Step 1: Update the render smoke test**

Replace the first test body in `describe('AddScreen manual entry', ...)` with:

```tsx
it('renders the compact manual-entry screen without the email setup tile', () => {
  render(<MemoryRouter><AddScreen /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: /add transaction|thêm giao dịch/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' })).toBeInTheDocument();
  expect(screen.getByLabelText(/image|hình ảnh|ảnh/i)).toBeInTheDocument();
  expect(screen.getByRole('group', { name: /direction|loại giao dịch/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /manage categories|quản lý danh mục/i })).toBeInTheDocument();
  expect(screen.queryByText(/link email/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Update expense save test amount entry**

In `it('saves a transaction with the entered amount and selected category', ...)`, replace the keypad clicks:

```tsx
await user.click(screen.getByRole('button', { name: '4' }));
await user.click(screen.getByRole('button', { name: '5' }));
await user.click(screen.getByRole('button', { name: '000' }));
```

with:

```tsx
await user.clear(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }));
await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '45000');
```

- [ ] **Step 3: Update invalid date test amount entry**

In `it('does not save when the date is cleared', ...)`, replace:

```tsx
await user.click(screen.getByRole('button', { name: '4' }));
await user.click(screen.getByRole('button', { name: '000' }));
```

with:

```tsx
await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '4000');
```

- [ ] **Step 4: Update income save test amount entry**

In `it('saves a manual income transaction with an income category', ...)`, replace:

```tsx
await user.click(screen.getByRole('button', { name: '5' }));
await user.click(screen.getByRole('button', { name: '000' }));
```

with:

```tsx
await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '5000');
```

- [ ] **Step 5: Update save-error test amount entry**

In `it('shows a visible error when saving a manual transaction fails', ...)`, replace:

```tsx
await user.click(screen.getByRole('button', { name: '4' }));
await user.click(screen.getByRole('button', { name: '5' }));
await user.click(screen.getByRole('button', { name: '000' }));
```

with:

```tsx
await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '45000');
```

- [ ] **Step 6: Update learned-rule test amount entry**

In `it('learns when user overrides the suggested chip on save', ...)`, replace the five `fireEvent.click(screen.getByText(...))` calls that enter amount with:

```tsx
fireEvent.change(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), {
  target: { value: '10000' },
});
```

- [ ] **Step 7: Run the focused Add test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/ui/AddScreen.test.tsx
```

Expected: FAIL because Add still renders the Link Email tile, still uses keypad buttons for amount entry, and does not expose a Manage Categories entry.

- [ ] **Step 8: Commit the failing test**

```bash
git add tests/ui/AddScreen.test.tsx
git commit -m "test: cover compact add screen"
```

## Task 2: Compact Category Tile Support

**Files:**
- Modify: `src/ui/components/primitives/CategoryIconTile.tsx`
- Modify: `src/ui/components/CategoryChips.tsx`

- [ ] **Step 1: Add density support to `CategoryIconTile`**

Replace `src/ui/components/primitives/CategoryIconTile.tsx` with:

```tsx
import type { ComponentType } from 'react';

interface CategoryIconTileProps<T extends string> {
  value: T;
  label: string;
  selected: boolean;
  onSelect: (value: T) => void;
  Icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  accentClass: string;
  surfaceClass: string;
  density?: 'comfortable' | 'compact';
}

export function CategoryIconTile<T extends string>({
  value,
  label,
  selected,
  onSelect,
  Icon,
  accentClass,
  surfaceClass,
  density = 'comfortable',
}: CategoryIconTileProps<T>) {
  const compact = density === 'compact';

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={[
        compact ? 'min-h-[4.45rem] rounded-xl px-1.5 py-2' : 'min-h-[5.75rem] rounded-2xl px-2 py-3',
        'border text-center transition active:scale-[0.98]',
        selected
          ? 'border-sky-300 bg-sky-300/15 shadow-[0_0_18px_rgba(56,189,248,0.26)]'
          : 'border-white/10 bg-white/[0.055]',
      ].join(' ')}
    >
      <span className={[
        compact ? 'h-8 w-8 rounded-xl' : 'h-10 w-10 rounded-2xl',
        `mx-auto flex items-center justify-center ${surfaceClass}`,
      ].join(' ')}>
        <Icon aria-hidden={true} className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} ${accentClass}`} />
      </span>
      <span className={[
        compact ? 'mt-1 line-clamp-2 text-[0.68rem]' : 'mt-2 text-xs',
        'block font-medium leading-tight text-slate-100',
      ].join(' ')}>
        {label}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Add density/className props to `CategoryChips`**

Replace `src/ui/components/CategoryChips.tsx` with:

```tsx
import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category } from '../../types';
import { CATEGORY_META } from '../theme/categoryMeta';
import { CategoryIconTile } from './primitives';

export function CategoryChips({
  value,
  onSelect,
  categories = CATEGORIES,
  density = 'comfortable',
  className = '',
}: {
  value: Category | null;
  onSelect: (c: Category) => void;
  categories?: readonly Category[];
  density?: 'comfortable' | 'compact';
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={[
      'grid grid-cols-3',
      density === 'compact' ? 'gap-1.5 px-0 py-2' : 'gap-2 px-4 py-3',
      className,
    ].join(' ')}>
      {categories.map(c => {
        const meta = CATEGORY_META[c];
        return (
          <CategoryIconTile
            key={c}
            value={c}
            label={t(`category.${c}`)}
            selected={value === c}
            onSelect={onSelect}
            Icon={meta.Icon}
            accentClass={meta.accentClass}
            surfaceClass={meta.surfaceClass}
            density={density}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Run primitive and Add tests**

Run:

```bash
pnpm exec vitest run tests/ui/primitives.test.tsx tests/ui/AddScreen.test.tsx
```

Expected: primitive tests pass; Add tests still fail until the Add screen is updated.

- [ ] **Step 4: Commit compact category support**

```bash
git add src/ui/components/primitives/CategoryIconTile.tsx src/ui/components/CategoryChips.tsx
git commit -m "feat: add compact category tiles"
```

## Task 3: Compact Add Screen Implementation

**Files:**
- Modify: `src/ui/AddImageButton.tsx`
- Modify: `src/ui/AddScreen.tsx`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Add compact image button variant**

In `src/ui/AddImageButton.tsx`, update the function signature:

```tsx
export function AddImageButton({ variant = 'floating' }: { variant?: 'floating' | 'tile' | 'compact' }) {
```

Replace the `className` assignment with:

```tsx
  const className = variant === 'tile'
    ? 'flex min-h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 text-sm font-semibold text-sky-300'
    : variant === 'compact'
    ? 'inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-sky-300'
    : 'fixed right-4 bottom-36 z-20 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg';
```

Replace the button contents with:

```tsx
        <Camera aria-hidden="true" className={variant === 'floating' ? 'h-6 w-6' : 'h-5 w-5'} />
        {variant === 'tile' && <span>{t('add.byImage')}</span>}
```

- [ ] **Step 2: Add Add-screen translations**

In `src/i18n/vi.json`, inside `"add"`, add:

```json
"manageCategories": "Quản lý danh mục",
"manageCategoriesSoon": "Quản lý danh mục sẽ được làm ở phase danh mục tuỳ chỉnh."
```

In `src/i18n/en.json`, inside `"add"`, add:

```json
"manageCategories": "Manage categories",
"manageCategoriesSoon": "Category management is planned for the custom categories phase."
```

- [ ] **Step 3: Update `AddScreen` imports**

In `src/ui/AddScreen.tsx`, remove:

```tsx
import { Mail } from 'lucide-react';
import { Keypad } from './components/Keypad';
```

Add:

```tsx
import { parseVNDInput } from '../lib/money';
```

- [ ] **Step 4: Replace keypad state handling with numeric input handling**

Remove the `handleKey` function.

Replace:

```tsx
  const amount = parseInt(raw || '0', 10);
```

with:

```tsx
  const parsedAmount = parseVNDInput(raw);
  const amount = Number.isNaN(parsedAmount) ? 0 : parsedAmount;
```

Add this function near the other handlers:

```tsx
  function handleAmountChange(value: string) {
    setRaw(value.replace(/[^\d]/g, '').slice(0, 12));
  }
```

- [ ] **Step 5: Replace the Add screen JSX**

Replace the `return (...)` block in `src/ui/AddScreen.tsx` with:

```tsx
  return (
    <div data-testid="add-screen" className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-md flex-col px-4 py-3 text-slate-100">
      <header className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
        <div />
        <h1 className="text-center text-xl font-bold text-white">{t('add.title')}</h1>
        <AddImageButton variant="compact" />
      </header>

      <div className="mt-3">
        <SegmentedControl
          ariaLabel="Direction"
          value={direction}
          onChange={handleDirection}
          options={[
            { value: 'expense', label: t('add.expense') },
            { value: 'income', label: t('add.income') },
          ]}
        />
      </div>

      <section className="mt-3 rounded-xl border border-white/10 bg-zinc-950/80">
        <label className="grid min-h-12 grid-cols-[5.6rem_1fr] items-center border-b border-white/10 px-3 text-sm font-semibold text-slate-100">
          <span>{t('add.date')}</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            aria-label={t('add.date')}
            className="min-w-0 rounded-lg bg-zinc-800 px-3 py-2 text-right text-sm font-semibold text-white outline-none"
          />
        </label>
        <label className="grid min-h-12 grid-cols-[5.6rem_1fr] items-center border-b border-white/10 px-3 text-sm font-semibold text-slate-100">
          <span>{t('add.merchant')}</span>
          <input
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
            aria-label={t('add.merchant')}
            placeholder={t('add.note')}
            className="min-w-0 rounded-lg bg-transparent px-0 py-2 text-right text-sm font-medium text-white outline-none placeholder:text-slate-500"
          />
        </label>
        <label className="grid min-h-14 grid-cols-[5.6rem_1fr_auto] items-center gap-2 px-3 text-sm font-semibold text-slate-100">
          <span>{t('add.amount')}</span>
          <input
            inputMode="numeric"
            value={raw}
            onChange={e => handleAmountChange(e.target.value)}
            aria-label={t('add.amount')}
            className="min-w-0 rounded-lg bg-zinc-800 px-3 py-2 text-right text-2xl font-bold text-white outline-none"
          />
          <span className="text-base font-bold text-slate-300">đ</span>
        </label>
      </section>

      <section className="mt-3 min-h-0 flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">{t('add.category')}</h2>
          <button
            type="button"
            onClick={() => window.alert(t('add.manageCategoriesSoon'))}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-300"
          >
            {t('add.manageCategories')}
          </button>
        </div>
        <CategoryChips
          value={chosen}
          onSelect={handleChip}
          categories={categoryOptions}
          density="compact"
        />
      </section>

      {saveError && (
        <div role="alert" className="mt-2 rounded-xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div>{t('add.saveFailed')}</div>
          <div>{saveError}</div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="mt-3 min-h-12 w-full rounded-full bg-zinc-600 px-4 text-base font-bold text-white disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {saving ? t('add.saving') : t(direction === 'expense' ? 'add.submitExpense' : 'add.submitIncome')}
      </button>
    </div>
  );
```

- [ ] **Step 6: Run Add tests**

Run:

```bash
pnpm exec vitest run tests/ui/AddScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Add implementation**

```bash
git add src/ui/AddScreen.tsx src/ui/AddImageButton.tsx src/ui/components/CategoryChips.tsx src/ui/components/primitives/CategoryIconTile.tsx src/i18n/vi.json src/i18n/en.json tests/ui/AddScreen.test.tsx
git commit -m "feat: compact manual add screen"
```

## Task 4: Settings Email Automation Section

**Files:**
- Modify: `tests/ui/SettingsScreen.test.tsx`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Modify: `src/ui/SettingsScreen.tsx`

- [ ] **Step 1: Add Settings test**

In `tests/ui/SettingsScreen.test.tsx`, inside `describe('SettingsScreen caps editor', ...)`, add:

```tsx
it('shows email automation support details in settings', async () => {
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

  const section = await screen.findByRole('region', { name: /email automation|tự động email/i });
  expect(section).toHaveTextContent(/iphone/i);
  expect(section).toHaveTextContent(/MB/);
  expect(section).toHaveTextContent(/ACB/);
  expect(section).toHaveTextContent(/admin|quản trị/i);
});
```

- [ ] **Step 2: Run Settings test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/ui/SettingsScreen.test.tsx
```

Expected: FAIL because the Email Automation section does not exist.

- [ ] **Step 3: Add Settings translations**

In `src/i18n/vi.json`, inside `"settings"`, add:

```json
"emailAutomation": {
  "title": "Tự động email",
  "description": "Thiết lập nhận giao dịch qua email cần cấu hình thủ công với admin.",
  "device": "Hiện tại chỉ hỗ trợ iPhone thông qua iOS Shortcuts.",
  "banks": "Ngân hàng đang hỗ trợ: MB và ACB.",
  "contact": "Liên hệ admin để được hỗ trợ cấu hình."
}
```

In `src/i18n/en.json`, inside `"settings"`, add:

```json
"emailAutomation": {
  "title": "Email automation",
  "description": "Bank-email transaction setup is manual and requires admin support.",
  "device": "Currently supports iPhone through iOS Shortcuts.",
  "banks": "Supported banks: MB and ACB.",
  "contact": "Contact admin for setup support."
}
```

- [ ] **Step 4: Add Settings section**

In `src/ui/SettingsScreen.tsx`, add this `GlassPanel` between the language section and monthly budget section:

```tsx
      <GlassPanel aria-label={t('settings.emailAutomation.title')} className="p-4">
        <h2 className="font-semibold text-white">{t('settings.emailAutomation.title')}</h2>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-300">
          <p>{t('settings.emailAutomation.description')}</p>
          <p>{t('settings.emailAutomation.device')}</p>
          <p>{t('settings.emailAutomation.banks')}</p>
          <p className="font-semibold text-sky-300">{t('settings.emailAutomation.contact')}</p>
        </div>
      </GlassPanel>
```

- [ ] **Step 5: Run Settings test**

Run:

```bash
pnpm exec vitest run tests/ui/SettingsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Settings implementation**

```bash
git add tests/ui/SettingsScreen.test.tsx src/ui/SettingsScreen.tsx src/i18n/vi.json src/i18n/en.json
git commit -m "feat: move email setup guidance to settings"
```

## Task 5: Full Verification

**Files:**
- No new file edits.

- [ ] **Step 1: Run focused UI tests**

Run:

```bash
pnpm exec vitest run tests/ui/AddScreen.test.tsx tests/ui/SettingsScreen.test.tsx tests/ui/ConfirmScreen.test.tsx
```

Expected: PASS. `ConfirmScreen` is included because `CategoryChips` still supports its comfortable layout.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm exec tsc -b
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm run lint
```

Expected: exit code `0`. Existing warnings are acceptable if the command succeeds.

- [ ] **Step 5: Run production build**

Run:

```bash
pnpm run build
```

Expected: PASS.

## Self-Review Notes

- Spec Phase 1 is covered by Tasks 1, 3, and 4.
- Link Email is removed from Add and represented in Settings as informational setup.
- Manual and image entry remain available.
- Full custom category add/edit is deliberately not implemented in this phase; the Add screen only exposes a visible management entry point with a clear message.
- Budget, savings target, report chart interaction, and report menu routes remain Phase 2 and Phase 3 work.
