import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category } from '../../types';
import { parseVNDInput } from '../../lib/money';
import { upsertBudget } from '../../db/budgets';

type Caps = Partial<Record<Category, number>>;

export function CapsEditor({ month, total, initialCaps, onSaved }: {
  month: string;
  total: number;
  initialCaps: Caps;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<Record<Category, string>>(() => {
    const out = {} as Record<Category, string>;
    for (const c of CATEGORIES) out[c] = initialCaps[c] != null ? String(initialCaps[c]) : '';
    return out;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function commit(next: Record<Category, string>) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const finalCaps: Caps = {};
      for (const c of CATEGORIES) {
        if (next[c].trim() === '') continue;
        const v = parseVNDInput(next[c]);
        if (!Number.isNaN(v) && v > 0) finalCaps[c] = v;
      }
      await upsertBudget(month, total, finalCaps);
      onSaved?.();
    }, 500);
  }

  function handleChange(cat: Category, value: string) {
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
        className="text-sm text-blue-600"
      >
        {open ? t('settings.caps.collapse') : t('settings.caps.expand')}
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {CATEGORIES.map(c => (
            <li key={c}>
              <label className="flex justify-between items-center text-sm">
                <span>{t(`category.${c}`)}</span>
                <input
                  inputMode="numeric"
                  aria-label={t(`category.${c}`)}
                  value={caps[c]}
                  onChange={e => handleChange(c, e.target.value)}
                  className="w-32 p-1 border rounded text-right"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
