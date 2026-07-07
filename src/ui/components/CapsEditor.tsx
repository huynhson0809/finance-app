import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../types';
import { parseVNDInput } from '../../lib/money';
import { getBudgetForMonth, upsertBudget } from '../../db/budgets';

type Caps = Partial<Record<ExpenseCategory, number>>;

export function CapsEditor({ month, total, initialCaps, onSaved }: {
  month: string;
  total: number;
  initialCaps: Caps;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<Record<ExpenseCategory, string>>(() => {
    const out = {} as Record<ExpenseCategory, string>;
    for (const c of EXPENSE_CATEGORIES) out[c] = initialCaps[c] != null ? String(initialCaps[c]) : '';
    return out;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function commit(next: Record<ExpenseCategory, string>) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const finalCaps: Caps = {};
      for (const c of EXPENSE_CATEGORIES) {
        if (next[c].trim() === '') continue;
        const v = parseVNDInput(next[c]);
        if (!Number.isNaN(v) && v > 0) finalCaps[c] = v;
      }
      const latestBudget = await getBudgetForMonth(month);
      await upsertBudget(month, latestBudget?.total ?? total, finalCaps);
      onSaved?.();
    }, 500);
  }

  function handleChange(cat: ExpenseCategory, value: string) {
    const next = { ...caps, [cat]: value };
    setCaps(next);
    commit(next);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-semibold text-slate-100"
      >
        {open ? t('settings.caps.collapse') : t('settings.caps.expand')}
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {EXPENSE_CATEGORIES.map(c => (
            <li key={c}>
              <label className="flex items-center justify-between gap-3 text-sm text-slate-400">
                <span>{t(`category.${c}`)}</span>
                <input
                  inputMode="numeric"
                  aria-label={t(`category.${c}`)}
                  value={caps[c]}
                  onChange={e => handleChange(c, e.target.value)}
                  className="w-32 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-right text-white"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
