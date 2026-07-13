import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import {
  deleteTransactionWithAssetEffect,
  updateTransactionWithAssetEffect,
} from "../assets/save";
import { supabase } from "../supabase/client";
import { getCloudTransaction } from "../supabase/transactions";
import {
  categoryBelongsToDirection,
  type Category,
  type ExpenseCategory,
  type IncomeCategory,
  type Transaction,
} from "../types";
import { categoriesForDirectionWithCustom } from "../categories/catalog";
import { shouldLearn } from "../categorizer";
import { upsertLearnedRule } from "../db/category-rules";
import { useCategoryOverrides } from "../hooks/useCategoryOverrides";
import { useCategoryOrder } from "../hooks/useCategoryOrder";
import { useCustomCategories } from "../hooks/useCustomCategories";
import { errorMessage } from "../lib/error";
import { DarkField, GlassPanel } from "./components/primitives";
import { categoryLabel, getCategoryMeta } from "./theme/categoryMeta";

function isExpenseCategory(category: Category): category is ExpenseCategory {
  return categoryBelongsToDirection(category, "expense");
}

function isIncomeCategory(category: Category): category is IncomeCategory {
  return categoryBelongsToDirection(category, "income");
}

function toLocalDatetimeInput(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  return parts.replace(" ", "T");
}

function vietnamDatetimeInputToISO(value: string): string {
  const valueWithSeconds = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  return new Date(`${valueWithSeconds}+07:00`).toISOString();
}

function visibleText(transaction: Transaction): string {
  if (transaction.direction === "expense") {
    return transaction.merchant ?? transaction.note ?? "";
  }
  return transaction.note ?? transaction.merchant ?? "";
}

function canLearnCategoryCorrection(transaction: Transaction): boolean {
  return (
    transaction.source === "bank-email" ||
    transaction.source === "receipt" ||
    transaction.source === "bank-screenshot"
  );
}

function typeLabelKey(transaction: Transaction): string {
  if (transaction.bank === "MB" && transaction.transactionType === "card") {
    return "transactionEdit.typeMbCard";
  }
  if (transaction.bank === "MB" && transaction.transactionType === "transfer") {
    return "transactionEdit.typeMbTransfer";
  }
  if (
    transaction.bank === "ACB" &&
    transaction.transactionType === "balance_alert"
  ) {
    return "transactionEdit.typeAcbBalance";
  }
  if (transaction.transactionType === "receipt") {
    return "transactionEdit.typeReceipt";
  }
  if (transaction.transactionType === "bank_screenshot") {
    return "transactionEdit.typeBankScreenshot";
  }
  return "transactionEdit.typeManual";
}

function sourceLabelKey(transaction: Transaction): string {
  if (transaction.source === "bank-email") return "transactionEdit.sourceEmail";
  if (transaction.source === "receipt") return "transactionEdit.sourceReceipt";
  if (transaction.source === "bank-screenshot")
    return "transactionEdit.sourceBankScreenshot";
  return "transactionEdit.sourceManual";
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

export function TransactionEditScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const { categories: customCategories } = useCustomCategories();
  const { overrides: categoryOverrides } = useCategoryOverrides();
  const categoryDirection = transaction?.direction ?? "expense";
  const { order: categoryOrder } = useCategoryOrder(categoryDirection);
  const backTo =
    typeof (location.state as { backTo?: unknown } | null)?.backTo ===
      "string" && (location.state as { backTo: string }).backTo.startsWith("/")
      ? (location.state as { backTo: string }).backTo
      : "/";

  const categoryOptions = useMemo(() => {
    if (!transaction) return [];

    const options = categoriesForDirectionWithCustom(
      transaction.direction,
      customCategories,
      categoryOrder,
    );
    if (
      category &&
      categoryBelongsToDirection(category, transaction.direction) &&
      !options.includes(category)
    ) {
      return [...options, category];
    }

    return options;
  }, [category, categoryOrder, customCategories, transaction]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!id) {
        setLoading(false);
        setLoadError(t("transactionEdit.notFound"));
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const client = supabase;
        if (!client) {
          throw new Error(t("auth.setupError"));
        }
        const found = await getCloudTransaction(client, id);
        if (ignore) return;
        setTransaction(found);
        setAmount(String(found.amount));
        setDate(toLocalDatetimeInput(found.occurredAt));
        setText(visibleText(found));
        setCategory(found.category);
      } catch (err) {
        if (ignore) return;
        setLoadError(errorMessage(err) || t("transactionEdit.notFound"));
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [id, t]);

  if (loading) {
    return (
      <div className="px-4 py-5 text-sm text-slate-300">
        {t("transactionEdit.loading")}
      </div>
    );
  }

  if (loadError || !transaction || !id) {
    return (
      <div className="space-y-4 px-4 py-5">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-slate-200"
          aria-label="Back"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <div
          role="alert"
          className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100"
        >
          {loadError || t("transactionEdit.notFound")}
        </div>
      </div>
    );
  }

  const amountLabel = t(
    transaction.direction === "expense"
      ? "transactionEdit.expenseAmount"
      : "transactionEdit.incomeAmount",
  );
  const parsedAmount = Number(amount);
  const canSubmit = Boolean(parsedAmount > 0 && date && category && !saving);

  async function handleSave() {
    if (!transaction || !id || !category || !canSubmit) return;
    setSaving(true);
    setActionError(null);
    const trimmedText = text.trim();
    const content = trimmedText || category;
    try {
      const client = supabase;
      if (!client) {
        throw new Error(t("auth.setupError"));
      }
      const occurredAt =
        date === toLocalDatetimeInput(transaction.occurredAt)
          ? transaction.occurredAt
          : vietnamDatetimeInputToISO(date);
      if (transaction.direction === "expense") {
        if (!isExpenseCategory(category)) return;
        await updateTransactionWithAssetEffect(id, {
          amount: parsedAmount,
          occurredAt,
          content,
          merchant: trimmedText || null,
          note: null,
          category,
        });
        if (
          category !== transaction.category &&
          canLearnCategoryCorrection(transaction)
        ) {
          const learnedRule = shouldLearn(
            transaction.category,
            category,
            trimmedText,
          );
          if (learnedRule) {
            await upsertLearnedRule(learnedRule);
          }
        }
      } else {
        if (!isIncomeCategory(category)) return;
        await updateTransactionWithAssetEffect(id, {
          amount: parsedAmount,
          occurredAt,
          content,
          merchant: null,
          note: trimmedText || null,
          category,
        });
      }
      navigate(backTo);
    } catch (err) {
      setActionError(
        `${t("transactionEdit.saveFailed")}: ${errorMessage(err)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !window.confirm(t("transactionEdit.deleteConfirm"))) return;
    setSaving(true);
    setActionError(null);
    try {
      const client = supabase;
      if (!client) {
        throw new Error(t("auth.setupError"));
      }
      await deleteTransactionWithAssetEffect(id);
      navigate(backTo);
    } catch (err) {
      setActionError(
        `${t("transactionEdit.deleteFailed")}: ${errorMessage(err)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-slate-200"
          aria-label="Back"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-white">
          {t("transactionEdit.title")}
        </h1>
      </header>

      <GlassPanel className="space-y-4 p-4">
        <DarkField label={t("transactionEdit.date")}>
          <input
            type="datetime-local"
            step="1"
            aria-label={t("transactionEdit.date")}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </DarkField>

        <DarkField label={t("transactionEdit.note")}>
          <input
            value={text}
            aria-label={t("transactionEdit.note")}
            onChange={(event) => setText(event.target.value)}
          />
        </DarkField>

        <DarkField label={amountLabel}>
          <input
            inputMode="numeric"
            aria-label={amountLabel}
            value={amount ? amount.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^\d]/g, ""))
            }
          />
        </DarkField>
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="text-sm font-semibold text-slate-200">
          {t("transactionEdit.category")}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {categoryOptions.map((option) => {
            const meta = getCategoryMeta(
              option,
              customCategories,
              categoryOverrides,
            );
            return (
              <button
                key={option}
                type="button"
                aria-pressed={category === option}
                onClick={() => setCategory(option)}
                className={[
                  "min-h-[5.75rem] rounded-2xl border px-2 py-3 text-center transition active:scale-[0.98]",
                  category === option
                    ? "border-sky-300 bg-sky-300/15 shadow-[0_0_18px_rgba(56,189,248,0.26)]"
                    : "border-white/10 bg-white/[0.055]",
                ].join(" ")}
              >
                <span
                  className={`mx-auto flex h-10 w-10 items-center justify-center rounded-2xl ${meta.surfaceClass}`}
                >
                  <meta.Icon
                    aria-hidden="true"
                    className={`h-6 w-6 ${meta.accentClass}`}
                  />
                </span>
                <span className="mt-2 block text-xs font-medium leading-tight text-slate-100">
                  {categoryLabel(
                    option,
                    customCategories,
                    t,
                    categoryOverrides,
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <dl className="grid grid-cols-3 gap-3">
          <MetadataItem
            label={t("transactionEdit.source")}
            value={t(sourceLabelKey(transaction))}
          />
          <MetadataItem
            label={t("transactionEdit.bank")}
            value={transaction.bank ?? "-"}
          />
          <MetadataItem
            label={t("transactionEdit.type")}
            value={t(typeLabelKey(transaction))}
          />
        </dl>
      </GlassPanel>

      {actionError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100"
        >
          {actionError}
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSubmit}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-400 px-4 text-base font-bold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
        >
          <Save aria-hidden="true" className="h-5 w-5" />
          {t("transactionEdit.save")}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-3 text-sm font-bold text-rose-100 disabled:text-rose-300/50"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {t("transactionEdit.delete")}
        </button>
      </div>
    </div>
  );
}
