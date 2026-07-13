import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AssetAccount } from "../assets/types";
import {
  saveAssetTransfer,
  saveTransactionWithAssetEffect,
} from "../assets/save";
import { categoriesForDirectionWithCustom } from "../categories/catalog";
import { shouldLearn } from "../categorizer";
import { upsertLearnedRule } from "../db/category-rules";
import { useAssetAccounts } from "../hooks/useAssets";
import { useCategorySuggestion } from "../hooks/useCategorySuggestion";
import { useCategoryOverrides } from "../hooks/useCategoryOverrides";
import { useCategoryOrder } from "../hooks/useCategoryOrder";
import { useCustomCategories } from "../hooks/useCustomCategories";
import {
  datetimeInputValueForVietnam,
  vietnamDatetimeInputToISO,
} from "../lib/date";
import { errorMessage } from "../lib/error";
import { parseVNDInput } from "../lib/money";
import {
  categoryBelongsToDirection,
  type Category,
  type ExpenseCategory,
  type IncomeCategory,
  type TransactionCurrency,
  type TransactionDirection,
} from "../types";
import { AddImageButton } from "./AddImageButton";
import { CategoryChips } from "./components/CategoryChips";
import {
  APP_SHELL_MAX_WIDTH_CLASS,
  DarkField,
  SegmentedControl,
} from "./components/primitives";
import { categoryLabel } from "./theme/categoryMeta";

type AddMode = TransactionDirection | "transfer";

const EMPTY_ASSET_ACCOUNTS: AssetAccount[] = [];

function isExpenseCategory(category: Category): category is ExpenseCategory {
  return categoryBelongsToDirection(category, "expense");
}

function isIncomeCategory(category: Category): category is IncomeCategory {
  return categoryBelongsToDirection(category, "income");
}

function isTransactionAccount(account: AssetAccount): boolean {
  return (
    account.currency === "VND" &&
    (account.kind === "cash" ||
      account.kind === "bank" ||
      account.kind === "credit_card" ||
      account.kind === "savings")
  );
}

function canSendTransfer(account: AssetAccount): boolean {
  return (
    account.kind === "cash" ||
    account.kind === "bank" ||
    account.kind === "savings" ||
    account.kind === "foreign_currency"
  );
}

function canReceiveTransfer(account: AssetAccount): boolean {
  return account.kind !== "gold";
}

function defaultAccountId(accounts: readonly AssetAccount[]): string {
  return (
    accounts.find(
      (account) => account.kind === "cash" || account.kind === "bank",
    )?.id ??
    accounts[0]?.id ??
    ""
  );
}

function parseUsdInput(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function isValidDatetimeInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute
  );
}

function AccountSelect({
  label,
  placeholder,
  value,
  accounts,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  accounts: readonly AssetAccount[];
  onChange: (accountId: string) => void;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-300">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full truncate rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-base text-white outline-none transition focus:border-sky-300/70"
      >
        <option value="">{placeholder}</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AddScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<AddMode>("expense");
  const [currency, setCurrency] = useState<TransactionCurrency>("VND");
  const [date, setDate] = useState(datetimeInputValueForVietnam);
  const [chosen, setChosen] = useState<Category | null>(null);
  const [userPickedChip, setUserPickedChip] = useState(false);
  const userPickedChipRef = useRef(false);
  const [assetAccountId, setAssetAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const operationIdRef = useRef<string | null>(null);

  if (operationIdRef.current === null) {
    operationIdRef.current = crypto.randomUUID();
  }

  const isEnglish = i18n.resolvedLanguage?.startsWith("en") ?? false;
  const labels = isEnglish
    ? {
        direction: "Direction",
        transfer: "Transfer",
        expenseAccount: "Expense account",
        incomeAccount: "Destination account",
        fromAccount: "From account",
        toAccount: "To account",
        chooseAccount: "Choose an account",
        noAccounts: "No transaction accounts yet.",
        setupAccounts: "Set up accounts",
        transferSubmit: "Save transfer",
        chooseFrom: "Choose a source account.",
        chooseTo: "Choose a destination account.",
        differentAccounts:
          "The source and destination accounts must be different.",
        matchingCurrency: "The source and destination currencies must match.",
        positiveAmount: "The amount must be greater than zero.",
        accountsLoadFailed: "Could not load accounts.",
        retry: "Retry",
      }
    : {
        direction: "Loại giao dịch",
        transfer: "Chuyển tiền",
        expenseAccount: "Tài khoản chi",
        incomeAccount: "Tài khoản nhận",
        fromAccount: "Từ tài khoản",
        toAccount: "Đến tài khoản",
        chooseAccount: "Chọn tài khoản",
        noAccounts: "Chưa có tài khoản giao dịch.",
        setupAccounts: "Thiết lập tài khoản",
        transferSubmit: "Lưu chuyển tiền",
        chooseFrom: "Chọn tài khoản nguồn.",
        chooseTo: "Chọn tài khoản đích.",
        differentAccounts: "Tài khoản nguồn và đích phải khác nhau.",
        matchingCurrency: "Tài khoản nguồn và đích phải cùng loại tiền.",
        positiveAmount: "Số tiền phải lớn hơn 0.",
        accountsLoadFailed: "Không thể tải tài khoản.",
        retry: "Thử lại",
      };

  const categoryDirection: TransactionDirection =
    mode === "income" ? "income" : "expense";
  const { categories: customCategories } = useCustomCategories();
  const { overrides: categoryOverrides } = useCategoryOverrides();
  const { order: categoryOrder } = useCategoryOrder(categoryDirection);
  const categoryOptions = useMemo(
    () =>
      categoriesForDirectionWithCustom(
        categoryDirection,
        customCategories,
        categoryOrder,
      ),
    [categoryDirection, customCategories, categoryOrder],
  );
  const suggestionCategories = useMemo(
    () =>
      categoryOptions.map((category) => ({
        id: category,
        label: categoryLabel(category, customCategories, t, categoryOverrides),
      })),
    [categoryOptions, customCategories, categoryOverrides, t],
  );
  const { suggestion, refresh } = useCategorySuggestion(note, {
    direction: categoryDirection,
    categories: suggestionCategories,
  });

  const accountsQuery = useAssetAccounts();
  const accounts = accountsQuery.data ?? EMPTY_ASSET_ACCOUNTS;
  const expenseAccounts = useMemo(
    () => accounts.filter(isTransactionAccount),
    [accounts],
  );
  const incomeAccounts = useMemo(
    () => expenseAccounts.filter((account) => account.kind !== "credit_card"),
    [expenseAccounts],
  );
  const transactionAccounts =
    mode === "income" ? incomeAccounts : expenseAccounts;
  const transferSourceAccounts = useMemo(
    () => accounts.filter(canSendTransfer),
    [accounts],
  );
  const transferDestinationBase = useMemo(
    () => accounts.filter(canReceiveTransfer),
    [accounts],
  );
  const selectedTransferSource = transferSourceAccounts.find(
    (account) => account.id === fromAccountId,
  );
  const amountCurrency =
    mode === "transfer" ? (selectedTransferSource?.currency ?? null) : "VND";
  const previousAmountCurrencyRef = useRef<"VND" | "USD" | null>(
    amountCurrency,
  );
  const transferDestinationAccounts = useMemo(
    () =>
      transferDestinationBase.filter(
        (account) =>
          !selectedTransferSource ||
          account.currency === selectedTransferSource.currency,
      ),
    [selectedTransferSource, transferDestinationBase],
  );

  // Track suggestions only while a category mode is visible.
  useEffect(() => {
    if (mode === "transfer") return;
    if (!userPickedChipRef.current) {
      setChosen(
        suggestion && categoryBelongsToDirection(suggestion, categoryDirection)
          ? suggestion
          : null,
      );
    }
  }, [categoryDirection, mode, suggestion, userPickedChip]);

  useEffect(() => {
    if (
      mode !== "transfer" &&
      chosen &&
      !categoryBelongsToDirection(chosen, categoryDirection)
    ) {
      setChosen(null);
    }
  }, [categoryDirection, chosen, mode]);

  useEffect(() => {
    if (mode === "transfer") return;
    setAssetAccountId((current) =>
      transactionAccounts.some((account) => account.id === current)
        ? current
        : defaultAccountId(transactionAccounts),
    );
  }, [mode, transactionAccounts]);

  useEffect(() => {
    setFromAccountId((current) =>
      transferSourceAccounts.some((account) => account.id === current)
        ? current
        : defaultAccountId(transferSourceAccounts),
    );
  }, [transferSourceAccounts]);

  useEffect(() => {
    setToAccountId((current) => {
      if (
        current !== fromAccountId &&
        transferDestinationAccounts.some((account) => account.id === current)
      ) {
        return current;
      }
      return defaultAccountId(
        transferDestinationAccounts.filter(
          (account) => account.id !== fromAccountId,
        ),
      );
    });
  }, [fromAccountId, transferDestinationAccounts]);

  useEffect(() => {
    const previousCurrency = previousAmountCurrencyRef.current;
    if (
      previousCurrency &&
      amountCurrency &&
      previousCurrency !== amountCurrency
    ) {
      setRaw("");
    }
    if (amountCurrency) previousAmountCurrencyRef.current = amountCurrency;
  }, [amountCurrency]);

  function renewOperationId() {
    operationIdRef.current = crypto.randomUUID();
  }

  function handleAmountChange(value: string) {
    const usd =
      mode === "transfer"
        ? selectedTransferSource?.currency === "USD"
        : currency === "USD";
    if (usd) {
      const normalized = value.replace(",", ".");
      if (/^\d*(?:\.\d{0,2})?$/.test(normalized)) {
        setRaw(normalized.slice(0, 16));
      }
      return;
    }
    setRaw(value.replace(/[^\d]/g, "").slice(0, 12));
  }

  function handleChip(category: Category) {
    userPickedChipRef.current = true;
    setUserPickedChip(true);
    setChosen(category);
  }

  function handleMode(next: AddMode) {
    if (next === mode || saving) return;
    const nextDirection: TransactionDirection =
      next === "income" ? "income" : "expense";
    setMode(next);
    setSaveError(null);
    userPickedChipRef.current = false;
    setUserPickedChip(false);
    setChosen((current) =>
      next === "transfer" ||
      (current && categoryBelongsToDirection(current, nextDirection))
        ? current
        : null,
    );
    renewOperationId();
  }

  const isUsdMode =
    mode === "transfer"
      ? selectedTransferSource?.currency === "USD"
      : currency === "USD";
  const parsedAmount = isUsdMode ? parseUsdInput(raw) : parseVNDInput(raw);
  const amount = Number.isNaN(parsedAmount) ? 0 : parsedAmount;
  const validAmount = Number.isFinite(amount) && amount > 0;
  const validDate = isValidDatetimeInput(date);
  const selectedTransactionAccount = transactionAccounts.find(
    (account) => account.id === assetAccountId,
  );
  const selectedTransferDestination = transferDestinationAccounts.find(
    (account) => account.id === toAccountId,
  );
  const transactionAccountValid =
    !accountsQuery.isLoading &&
    !accountsQuery.isError &&
    (transactionAccounts.length === 0 || Boolean(selectedTransactionAccount));
  const transferAccountsValid = Boolean(
    !accountsQuery.isError &&
    selectedTransferSource &&
    selectedTransferDestination &&
    selectedTransferSource.id !== selectedTransferDestination.id &&
    selectedTransferSource.currency === selectedTransferDestination.currency,
  );
  const categoryValid = Boolean(
    chosen && categoryBelongsToDirection(chosen, categoryDirection),
  );
  const canSave =
    !saving &&
    validAmount &&
    validDate &&
    (mode === "transfer"
      ? transferAccountsValid
      : categoryValid && transactionAccountValid);

  let transferValidation: string | null = null;
  if (
    mode === "transfer" &&
    !accountsQuery.isLoading &&
    !accountsQuery.isError
  ) {
    if (!selectedTransferSource) {
      transferValidation = labels.chooseFrom;
    } else if (!selectedTransferDestination) {
      transferValidation = labels.chooseTo;
    } else if (selectedTransferSource.id === selectedTransferDestination.id) {
      transferValidation = labels.differentAccounts;
    } else if (
      selectedTransferSource.currency !== selectedTransferDestination.currency
    ) {
      transferValidation = labels.matchingCurrency;
    } else if (raw !== "" && !validAmount) {
      transferValidation = labels.positiveAmount;
    }
  }

  async function handleSave() {
    if (!canSave) return;

    const selectedCategory = chosen;
    const operationId = operationIdRef.current;
    if (!operationId) return;

    setSaving(true);
    setSaveError(null);
    try {
      const fieldText = note.trim() || undefined;
      const occurredAt = vietnamDatetimeInputToISO(date);

      if (mode === "transfer") {
        const transferSource = selectedTransferSource;
        const transferDestination = selectedTransferDestination;
        if (!transferSource || !transferDestination) return;
        await saveAssetTransfer({
          fromAccountId: transferSource.id,
          toAccountId: transferDestination.id,
          amount,
          currency: transferSource.currency,
          occurredAt,
          note: fieldText,
          operationId,
        });
      } else if (mode === "expense") {
        if (!selectedCategory || !isExpenseCategory(selectedCategory)) return;
        const saveAmount =
          currency === "USD" ? Math.round(amount * 100) : amount;
        await saveTransactionWithAssetEffect({
          amount: saveAmount,
          currency,
          occurredAt,
          note: fieldText,
          direction: "expense",
          category: selectedCategory,
          source: "manual",
          assetAccountId: selectedTransactionAccount?.id,
          operationId,
        });
        const learned = shouldLearn(suggestion, selectedCategory, note);
        if (learned) {
          await upsertLearnedRule(learned);
          refresh();
        }
      } else {
        if (!selectedCategory || !isIncomeCategory(selectedCategory)) return;
        const saveAmount =
          currency === "USD" ? Math.round(amount * 100) : amount;
        await saveTransactionWithAssetEffect({
          amount: saveAmount,
          currency,
          occurredAt,
          note: fieldText,
          direction: "income",
          category: selectedCategory,
          source: "manual",
          assetAccountId: selectedTransactionAccount?.id,
          operationId,
        });
      }

      renewOperationId();
      navigate("/");
    } catch (err) {
      console.error("Failed to save transaction", err);
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const hasTransferSelectors =
    transferSourceAccounts.length > 0 || transferDestinationBase.length > 0;
  const needsAnotherTransferAccount =
    transferSourceAccounts.length === 0 ||
    !transferDestinationAccounts.some(
      (account) => account.id !== fromAccountId,
    );
  const noteLabel = t("transactionEdit.note");

  return (
    <div
      data-testid="add-screen"
      className="flex h-[calc(100dvh_-_env(safe-area-inset-bottom)_-_7.25rem)] min-h-0 flex-col overflow-hidden px-4 pb-0 pt-5"
    >
      <header
        data-testid="add-header"
        className="mb-4 flex shrink-0 items-center justify-between gap-3"
      >
        <h1 className="text-2xl font-bold text-white">{t("add.title")}</h1>
        <AddImageButton variant="compact" />
      </header>

      <div data-testid="add-fixed-form" className="shrink-0 space-y-4">
        <SegmentedControl
          ariaLabel={labels.direction}
          value={mode}
          onChange={handleMode}
          options={[
            { value: "expense", label: t("categories.expense") },
            { value: "income", label: t("categories.income") },
            { value: "transfer", label: labels.transfer },
          ]}
        />

        {accountsQuery.isError ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 text-xs text-rose-200"
          >
            <span>{labels.accountsLoadFailed}</span>
            <button
              type="button"
              onClick={() => void accountsQuery.refetch()}
              className="font-semibold text-sky-300"
            >
              {labels.retry}
            </button>
          </div>
        ) : mode === "transfer" ? (
          hasTransferSelectors ? (
            <div className="grid grid-cols-2 gap-3">
              <AccountSelect
                label={labels.fromAccount}
                placeholder={labels.chooseAccount}
                value={fromAccountId}
                accounts={transferSourceAccounts}
                onChange={setFromAccountId}
              />
              <AccountSelect
                label={labels.toAccount}
                placeholder={labels.chooseAccount}
                value={toAccountId}
                accounts={transferDestinationAccounts}
                onChange={setToAccountId}
              />
            </div>
          ) : !accountsQuery.isLoading ? (
            <div
              data-testid="add-no-accounts"
              className="flex items-center justify-between gap-3 text-xs text-slate-400"
            >
              <span>{labels.noAccounts}</span>
              <Link to="/assets" className="font-semibold text-sky-300">
                {labels.setupAccounts}
              </Link>
            </div>
          ) : null
        ) : transactionAccounts.length > 0 ? (
          <AccountSelect
            label={
              mode === "expense" ? labels.expenseAccount : labels.incomeAccount
            }
            placeholder={labels.chooseAccount}
            value={assetAccountId}
            accounts={transactionAccounts}
            onChange={setAssetAccountId}
          />
        ) : !accountsQuery.isLoading ? (
          <div
            data-testid="add-no-accounts"
            className="flex items-center justify-between gap-3 text-xs text-slate-400"
          >
            <span>{labels.noAccounts}</span>
            <Link to="/assets" className="font-semibold text-sky-300">
              {labels.setupAccounts}
            </Link>
          </div>
        ) : null}

        {mode === "transfer" &&
          hasTransferSelectors &&
          needsAnotherTransferAccount && (
            <div className="text-right text-xs">
              <Link to="/assets" className="font-semibold text-sky-300">
                {labels.setupAccounts}
              </Link>
            </div>
          )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <DarkField label={t("add.date")}>
              <input
                type="datetime-local"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-label={t("add.date")}
              />
            </DarkField>
          </div>
          <DarkField label={noteLabel}>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-label={noteLabel}
            />
          </DarkField>
          <DarkField label={t("add.amount")}>
            <div className="flex items-center gap-2">
              {mode !== "transfer" && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrency((c) => (c === "VND" ? "USD" : "VND"));
                    setRaw("");
                  }}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/[0.07] px-2 py-1 text-xs font-bold text-sky-300"
                >
                  {currency}
                </button>
              )}
              <input
                value={
                  isUsdMode
                    ? raw
                    : raw
                      ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                      : ""
                }
                onChange={(event) => handleAmountChange(event.target.value)}
                aria-label={t("add.amount")}
                aria-invalid={raw !== "" && !validAmount}
                inputMode={isUsdMode ? "decimal" : "numeric"}
                pattern={isUsdMode ? "[0-9]+([.,][0-9]{0,2})?" : "[0-9]*"}
                className="min-w-0 flex-1"
              />
            </div>
          </DarkField>
        </div>

        {transferValidation && (
          <div role="status" className="text-xs font-medium text-rose-200">
            {transferValidation}
          </div>
        )}
      </div>

      {mode !== "transfer" ? (
        <section
          data-testid="add-category-scroll"
          className="mt-4 flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden"
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-200">
              {t("add.category")}
            </h2>
            <Link
              to={"/categories?direction=" + categoryDirection}
              className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-sky-300"
            >
              {t("add.manageCategories")}
            </Link>
          </div>
          <div
            data-testid="add-category-list"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28"
          >
            <CategoryChips
              value={chosen}
              onSelect={handleChip}
              categories={categoryOptions}
              customCategories={customCategories}
              categoryOverrides={categoryOverrides}
              density="compact"
            />
          </div>
        </section>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <footer
        data-testid="add-submit-footer"
        className={[
          "fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] z-20 mx-auto px-4 py-4 bg-black",
          APP_SHELL_MAX_WIDTH_CLASS,
        ].join(" ")}
      >
        {saveError && (
          <div
            role="alert"
            className="mb-3 rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100"
          >
            <div>{t("add.saveFailed")}</div>
            <div>{saveError}</div>
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="min-h-14 w-full rounded-2xl bg-zinc-600 px-4 text-base font-bold text-white shadow-sm disabled:bg-slate-700 disabled:text-slate-400"
        >
          {saving
            ? t("add.saving")
            : mode === "transfer"
              ? labels.transferSubmit
              : t(
                  mode === "expense" ? "add.submitExpense" : "add.submitIncome",
                )}
        </button>
      </footer>
    </div>
  );
}
