import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AddImageButton } from "./AddImageButton";
import { CategoryChips } from "./components/CategoryChips";
import {
  APP_SHELL_MAX_WIDTH_CLASS,
  DarkField,
  SegmentedControl,
} from "./components/primitives";
import { categoriesForDirectionWithCustom } from "../categories/catalog";
import { upsertLearnedRule } from "../db/category-rules";
import { useCategorySuggestion } from "../hooks/useCategorySuggestion";
import { useCategoryOverrides } from "../hooks/useCategoryOverrides";
import { useCustomCategories } from "../hooks/useCustomCategories";
import { shouldLearn } from "../categorizer";
import { parseVNDInput } from "../lib/money";
import { errorMessage } from "../lib/error";
import { saveUserTransaction } from "../transactions/save";
import { categoryLabel } from "./theme/categoryMeta";
import {
  datetimeInputValueForVietnam,
  vietnamDatetimeInputToISO,
} from "../lib/date";
import {
  categoryBelongsToDirection,
  type Category,
  type ExpenseCategory,
  type IncomeCategory,
  type TransactionDirection,
} from "../types";

function isExpenseCategory(category: Category): category is ExpenseCategory {
  return categoryBelongsToDirection(category, "expense");
}

function isIncomeCategory(category: Category): category is IncomeCategory {
  return categoryBelongsToDirection(category, "income");
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

export function AddScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<TransactionDirection>("expense");
  const [date, setDate] = useState(datetimeInputValueForVietnam);
  const [chosen, setChosen] = useState<Category | null>(null);
  const [userPickedChip, setUserPickedChip] = useState(false);
  const userPickedChipRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { categories: customCategories } = useCustomCategories();
  const { overrides: categoryOverrides } = useCategoryOverrides();
  const categoryOptions = useMemo(
    () => categoriesForDirectionWithCustom(direction, customCategories),
    [direction, customCategories],
  );
  const suggestionCategories = useMemo(
    () => categoryOptions.map(category => ({
      id: category,
      label: categoryLabel(category, customCategories, t, categoryOverrides),
    })),
    [categoryOptions, customCategories, categoryOverrides, t],
  );
  const { suggestion, refresh } = useCategorySuggestion(note, {
    direction,
    categories: suggestionCategories,
  });

  // Track suggestion until the user explicitly picks a chip.
  useEffect(() => {
    if (!userPickedChipRef.current) {
      setChosen(
        suggestion && categoryBelongsToDirection(suggestion, direction)
          ? suggestion
          : null,
      );
    }
  }, [direction, suggestion, userPickedChip]);

  useEffect(() => {
    if (chosen && !categoryBelongsToDirection(chosen, direction)) {
      setChosen(null);
    }
  }, [chosen, direction]);

  function handleAmountChange(value: string) {
    setRaw(value.replace(/[^\d]/g, "").slice(0, 12));
  }

  function handleChip(c: Category) {
    userPickedChipRef.current = true;
    setUserPickedChip(true);
    setChosen(c);
  }

  function handleDirection(next: TransactionDirection) {
    setDirection(next);
    userPickedChipRef.current = false;
    setUserPickedChip(false);
    setChosen((current) =>
      current && categoryBelongsToDirection(current, next) ? current : null,
    );
  }

  const parsedAmount = parseVNDInput(raw);
  const amount = Number.isNaN(parsedAmount) ? 0 : parsedAmount;
  const canSave = Boolean(
    amount && chosen && isValidDatetimeInput(date) && !saving,
  );

  async function handleSave() {
    if (!canSave || !chosen) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fieldText = note.trim() || undefined;
      const occurredAt = vietnamDatetimeInputToISO(date);
      if (direction === "expense") {
        if (!isExpenseCategory(chosen)) return;
        await saveUserTransaction({
          amount,
          currency: "VND",
          occurredAt,
          note: fieldText,
          direction: "expense",
          category: chosen,
          source: "manual",
        });
        const learned = shouldLearn(suggestion, chosen, note);
        if (learned) {
          await upsertLearnedRule(learned);
          refresh();
        }
      } else {
        if (!isIncomeCategory(chosen)) return;
        await saveUserTransaction({
          amount,
          currency: "VND",
          occurredAt,
          note: fieldText,
          direction: "income",
          category: chosen,
          source: "manual",
        });
      }
      navigate("/");
    } catch (err) {
      console.error("Failed to save transaction", err);
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh_-_env(safe-area-inset-bottom)_-_7.25rem)] min-h-0 flex-col overflow-hidden px-4 pb-0 pt-5">
      <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{t("add.title")}</h1>
        <AddImageButton variant="compact" />
      </header>

      <div data-testid="add-fixed-form" className="shrink-0 space-y-4">
        <SegmentedControl
          ariaLabel="Direction"
          value={direction}
          onChange={handleDirection}
          options={[
            { value: "expense", label: t("add.expense") },
            { value: "income", label: t("add.income") },
          ]}
        />

        <div className="grid gap-3">
          <DarkField label={t("add.date")}>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label={t("add.date")}
            />
          </DarkField>
          <DarkField label={t("add.merchant")}>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={t("add.merchant")}
            />
          </DarkField>
          <DarkField label={t("add.amount")}>
            <input
              value={raw}
              onChange={(e) => handleAmountChange(e.target.value)}
              aria-label={t("add.amount")}
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </DarkField>
        </div>
      </div>

      <section
        data-testid="add-category-scroll"
        className="mt-4 flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">
            {t("add.category")}
          </h2>
          <Link
            to={`/categories?direction=${direction}`}
            className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-sky-300"
          >
            {t("add.manageCategories")}
          </Link>
        </div>
        <CategoryChips
          value={chosen}
          onSelect={handleChip}
          categories={categoryOptions}
          customCategories={customCategories}
          categoryOverrides={categoryOverrides}
          density="compact"
          className="min-h-0 overflow-y-auto overscroll-contain pb-28"
        />
      </section>

      <footer
        data-testid="add-submit-footer"
        className={`fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] z-20 mx-auto ${APP_SHELL_MAX_WIDTH_CLASS} px-4 py-4 bg-black`}
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
            : t(
                direction === "expense"
                  ? "add.submitExpense"
                  : "add.submitIncome",
              )}
        </button>
      </footer>
    </div>
  );
}
