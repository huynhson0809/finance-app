import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLocale, type Locale } from '../i18n';
import { upsertBudget, getBudgetForMonth } from '../db/budgets';
import { monthOfVietnamDate, todayVietnamDate } from '../lib/date';
import { parseVNDInput } from '../lib/money';
import { CapsEditor } from './components/CapsEditor';
import type { Category } from '../types';
import { useAuth } from '../hooks/useAuth';

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const month = monthOfVietnamDate(todayVietnamDate());
  const [raw, setRaw] = useState('');
  const [caps, setCaps] = useState<Partial<Record<Category, number>>>({});
  const [total, setTotal] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    getBudgetForMonth(month).then(b => {
      if (b) { setRaw(String(b.total)); setTotal(b.total); setCaps(b.caps ?? {}); }
    });
  }, [month]);

  async function handleLocale(l: Locale) { await setLocale(l); }

  async function handleSaveBudget() {
    const parsed = parseVNDInput(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return;
    await upsertBudget(month, parsed, caps);
    setTotal(parsed);
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningOut(false);
    }
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

        {total > 0 && (
          <div className="mt-4">
            <CapsEditor
              month={month}
              total={total}
              initialCaps={caps}
              onSaved={() => getBudgetForMonth(month).then(b => b && setCaps(b.caps ?? {}))}
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold">{t('settings.account')}</h2>
        {signOutError && (
          <div role="alert" className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {t('settings.signOutFailed')}: {signOutError}
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="mt-2 py-2 px-4 bg-gray-600 text-white rounded disabled:opacity-60"
        >{signingOut ? t('settings.signingOut') : t('settings.signOut')}</button>
      </section>
    </div>
  );
}
