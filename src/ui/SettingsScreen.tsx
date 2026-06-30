import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLocale, type Locale } from '../i18n';
import { upsertBudget, getBudgetForMonth } from '../db/budgets';
import { monthOf, todayISO } from '../lib/date';
import { parseVNDInput } from '../lib/money';
import { CapsEditor } from './components/CapsEditor';
import type { Category } from '../types';
import { exportBackup, importBackup } from '../backup';
import { setSetting } from '../db/settings';

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const month = monthOf(todayISO());
  const [raw, setRaw] = useState('');
  const [caps, setCaps] = useState<Partial<Record<Category, number>>>({});
  const [total, setTotal] = useState(0);

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    try {
      const data = await exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-backup-${data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await setSetting('lastBackupAt', data.exportedAt);
    } catch (err) {
      console.error('exportBackup failed', err);
      alert(t('backup.exportFailed'));
    }
  }

  function handleImportClick() {
    if (!confirm(t('backup.confirmReplace'))) return;
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      await importBackup(file);
      alert(t('backup.imported'));
      window.location.reload();
    } catch (err) {
      console.error('importBackup failed', err);
      alert(t('backup.importFailed'));
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
        <h2 className="font-semibold">{t('backup.title')}</h2>
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={handleExport}
            className="py-2 px-4 bg-blue-600 text-white rounded"
          >{t('backup.export')}</button>
          <button
            type="button"
            onClick={handleImportClick}
            className="py-2 px-4 bg-gray-600 text-white rounded"
          >{t('backup.import')}</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            data-testid="backup-import-input"
            onChange={handleImportFile}
          />
        </div>
      </section>
    </div>
  );
}
