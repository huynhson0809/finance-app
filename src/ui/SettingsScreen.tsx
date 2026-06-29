import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLocale, type Locale } from '../i18n';
import { upsertBudget, getBudgetForMonth } from '../db/budgets';
import { monthOf, todayISO } from '../lib/date';
import { parseVNDInput } from '../lib/money';

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const month = monthOf(todayISO());
  const [raw, setRaw] = useState('');

  useEffect(() => {
    getBudgetForMonth(month).then(b => {
      if (b) setRaw(String(b.total));
    });
  }, [month]);

  async function handleLocale(l: Locale) {
    await setLocale(l);
  }

  async function handleSaveBudget() {
    const total = parseVNDInput(raw);
    if (Number.isNaN(total) || total <= 0) return;
    await upsertBudget(month, total);
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl">{t('settings.title')}</h1>

      <section>
        <h2 className="font-semibold">{t('settings.language')}</h2>
        <div className="flex gap-4 mt-2">
          {(['vi','en'] as Locale[]).map(l => (
            <label key={l} className="flex items-center gap-2">
              <input
                type="radio"
                name="locale"
                checked={i18n.language === l}
                onChange={() => handleLocale(l)}
              />
              {l === 'vi' ? 'Tiếng Việt' : 'English'}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">{t('settings.monthlyBudget')}</h2>
        <input
          inputMode="numeric"
          value={raw}
          onChange={e => setRaw(e.target.value)}
          className="mt-2 w-full p-2 border rounded"
        />
        <button
          type="button"
          onClick={handleSaveBudget}
          className="mt-2 py-2 px-4 bg-blue-600 text-white rounded"
        >{t('settings.save')}</button>
      </section>
    </div>
  );
}
