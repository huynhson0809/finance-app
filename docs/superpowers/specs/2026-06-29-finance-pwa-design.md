# Finance PWA — Design Spec

**Date:** 2026-06-29
**Status:** Approved for planning
**Owner:** sterling.huynh@hugeinc.com

## 1. Purpose and audience

A Progressive Web App for personal finance management, targeting working individuals in Vietnam. The core problem: people quit finance apps because manual data entry is tedious. This app reduces entry friction with three input methods — manual (≤3 taps), receipt photo, and bank-transfer screenshot — combined with auto-categorization and a two-tier dashboard.

## 2. Goals and non-goals

**Goals**

- Capture a transaction in three taps or fewer for any of the three input methods.
- Work fully offline after first load; installable from the browser to the home screen.
- Preserve user privacy: no backend, no login, data stays on-device.
- Auto-categorize captured transactions and require a one-tap user confirmation before persistence.
- Provide a simple daily dashboard and an advanced weekly/monthly report.

**Non-goals (MVP)**

Cloud sync, multi-device, shared/household budgets, recurring transactions, bill reminders, investment tracking, multi-currency, login/auth, App Store / Play Store distribution.

## 3. Constraints and decisions

| Area | Decision |
|---|---|
| Platform | PWA only, installable via browser. Deployed as static files to Vercel. |
| Build tool | Vite + `vite-plugin-pwa`. |
| UI | React + Tailwind CSS. |
| i18n | `react-i18next`, ships with Vietnamese (`vi`) and English (`en`); architecture i18n-ready for further locales. |
| OCR | Tesseract.js in a Web Worker, with `vie` + `eng` language packs precached by the service worker. |
| Categorization | Rule-based keyword matcher with a learning dictionary. User corrections persist as new rules. No ML or remote API in MVP. |
| Storage | IndexedDB via `idb`. All amounts as integer VND. |
| Charts | Recharts. |
| Image retention | Discard receipt/screenshot images after OCR. Keep only extracted fields. |
| Backup | Manual JSON export/import in settings; in-app reminder banner every 30 days. |
| Auth | None in MVP. |
| Budget model | Single monthly total with optional per-category caps. |

## 4. Architecture overview

A 100% client-side React PWA. All user data lives in IndexedDB on the device. Tesseract.js runs in a Web Worker so OCR does not block the UI. The service worker precaches the app shell plus the Tesseract WASM and language assets so the app works fully offline after first load. No server runtime.

## 5. Module boundaries

Each module owns one concern and exposes a narrow interface.

- **`db/`** — IndexedDB wrapper. Schema: `transactions`, `budgets`, `categoryRules`, `settings`. Exposes typed CRUD and a query API. The only module that touches IndexedDB directly.
- **`ocr/`** — Tesseract worker pool and lifecycle. Exposes `recognize(blob, lang) → rawText`. Knows nothing about transactions.
- **`extractors/`** — Pure functions that turn raw OCR text into `{ amount, merchant, date, source }`. One file per bank template (`vietcombank.ts`, `techcombank.ts`, `momo.ts`, `zalopay.ts`) plus a generic `receipt.ts` fallback and a `detect.ts` that selects the right template by text fingerprints.
- **`categorizer/`** — Rule-based keyword matcher plus learned overrides. Loads a seed dictionary (VN merchant names → category) on first launch. User corrections write back into IndexedDB so future matches improve.
- **`reports/`** — Pure aggregation functions: today's spend, last-N, by-category totals, month-over-month deltas, anomaly hints (e.g. "spent 40% more on bubble tea"). Returns plain data; no UI.
- **`ui/`** — React components and screens. Reads via React Query backed by `db/`. Tailwind for styling, Recharts for the advanced views.
- **`i18n/`** — `react-i18next` with `vi` and `en` resource bundles. Locale persisted in settings.
- **`backup/`** — JSON export/import plus the 30-day backup reminder banner.
- **`pwa/`** — Service worker config, install-prompt UX, offline detection.

## 6. Data model

```ts
Transaction {
  id: string;
  amount: number;           // integer VND
  currency: 'VND';
  occurredAt: string;       // ISO date
  merchant?: string;
  category: Category;
  note?: string;
  source: 'manual' | 'receipt' | 'bank-screenshot';
  bankHint?: 'vietcombank' | 'techcombank' | 'momo' | 'zalopay';
  createdAt: string;
  updatedAt: string;
}

Budget {
  id: string;
  month: string;            // 'YYYY-MM'
  total: number;            // integer VND
  caps: Partial<Record<Category, number>>;
}

CategoryRule {
  id: string;
  pattern: string;          // lowercased substring
  category: Category;
  weight: number;
  learned: boolean;
}

Setting { key: string; value: unknown }
// known keys: 'locale', 'lastBackupAt', 'keepImages' (default false), ...
```

`Category` is the closed set: `food-drinks` · `coffee-bubble-tea` · `transportation` · `shopping` · `bills-utilities` · `healthcare` · `entertainment` · `transfers-debt` · `others`.

## 7. Input flows

Each flow ends at a single confirmation screen before persistence. Confirmation is mandatory so bad OCR cannot pollute data.

- **Manual** — Tap `+` → keypad + category chips on one screen → Save. Two taps for the common case.
- **Receipt photo** — Tap camera → shoot → OCR in worker → confirmation screen pre-filled with extracted fields and suggested category → Save. Confirm is one tap when fields are right.
- **Bank screenshot** — Same as receipt, but `extractors/detect.ts` recognizes the bank from text fingerprints and applies the matching regex template, yielding higher-confidence pre-fill.

## 8. Two-tier dashboard

- **Simple (home tab)** — Today's total · remaining-budget bar · last 5 transactions · prominent `+` button.
- **Advanced (reports tab)** — Category pie and bar charts (Recharts), month-over-month deltas, over-budget alerts (overall and per-category caps), anomaly callouts from `reports/anomalies.ts`.

## 9. Error handling

- OCR failure → fall through to manual entry, photo shown for reference.
- IndexedDB write failure → retry once, then surface a non-blocking toast and keep the draft in memory so the user can retry without losing input.
- Quota exceeded → prompt the user to export a backup and prune old data.
- Service worker update available → toast with a "refresh to update" action.
- No camera permission → manual entry remains fully functional; OCR entry points hidden.

## 10. Testing strategy

- **Unit** — `extractors/`, `categorizer/`, `reports/` are pure functions. Vitest, with fixture text captured from real receipt and bank-screenshot OCR output.
- **Integration** — `db/` against `fake-indexeddb`.
- **Component** — Key screens with React Testing Library: manual-entry happy path, OCR confirmation screen, budget setup.
- **Manual** — PWA install and offline mode verified on a real Android device before each release.

## 11. Build phases

1. **Skeleton** — Vite + Tailwind + i18n + IndexedDB schema + manual entry + simple dashboard.
2. **Reports** — Categorizer with seed dictionary, Recharts views, budget setup, over-budget alerts.
3. **OCR** — Tesseract worker, camera capture, bank-screenshot extractors first (Vietcombank, Techcombank, MoMo, ZaloPay), then generic receipt extractor, confirmation UI.
4. **PWA polish** — Service worker precache including Tesseract assets, install prompt, offline indicator, backup export/import plus 30-day reminder.

## 12. Success criteria

- A new user can capture and save a transaction in ≤3 taps via every input method.
- App launches and the home dashboard renders with no network.
- Bank-screenshot extraction for the four supported banks correctly fills amount, merchant, and date on a fixture set with ≥90 % accuracy.
- Backup export produces a valid JSON file that re-imports without data loss.
