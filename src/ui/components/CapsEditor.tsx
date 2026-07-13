import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "../../types";
import { parseVNDInput } from "../../lib/money";
import { getBudgetForMonth, upsertBudget } from "../../db/budgets";

type Caps = Partial<Record<ExpenseCategory, number>>;

export function CapsEditor({
  month,
  total,
  initialCaps,
  onSaved,
}: {
  month: string;
  total: number;
  initialCaps: Caps;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<Record<ExpenseCategory, string>>(() => {
    const out = {} as Record<ExpenseCategory, string>;
    for (const c of EXPENSE_CATEGORIES)
      out[c] = initialCaps[c] != null ? String(initialCaps[c]) : "";
    return out;
  });
  const [saving, setSaving] = useState(false);

  function handleChange(cat: ExpenseCategory, value: string) {
    setCaps((prev) => ({ ...prev, [cat]: value }));
  }

  async function handleSaveCaps() {
    setSaving(true);
    try {
      const finalCaps: Caps = {};
      for (const c of EXPENSE_CATEGORIES) {
        if (caps[c].trim() === "") continue;
        const v = parseVNDInput(caps[c]);
        if (!Number.isNaN(v) && v > 0) finalCaps[c] = v;
      }
      const latestBudget = await getBudgetForMonth(month);
      await upsertBudget(month, latestBudget?.total ?? total, finalCaps);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-semibold text-slate-100"
      >
        {open ? t("settings.caps.collapse") : t("settings.caps.expand")}
      </button>
      {open && (
        <>
          <ul className="mt-3 space-y-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <li key={c}>
                <label className="flex items-center justify-between gap-3 text-sm text-slate-400">
                  <span>{t(`category.${c}`)}</span>
                  <input
                    inputMode="numeric"
                    aria-label={t(`category.${c}`)}
                    value={
                      caps[c]
                        ? caps[c].replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                        : ""
                    }
                    onChange={(e) =>
                      handleChange(c, e.target.value.replace(/[^\d]/g, ""))
                    }
                    className="w-32 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-right text-white"
                  />
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleSaveCaps}
            disabled={saving}
            className="mt-3 min-h-10 rounded-xl bg-sky-400 px-4 text-sm font-bold text-slate-950 disabled:opacity-50"
          >
            {t("settings.save")}
          </button>
        </>
      )}
    </div>
  );
}
