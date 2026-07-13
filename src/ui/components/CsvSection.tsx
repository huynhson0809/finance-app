import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { supabase } from '../../supabase/client';
import { listCloudTransactions } from '../../supabase/transactions';
import { transactionsToCSV, downloadCSV, parseCSV } from '../../csv';
import { saveTransactionWithAssetEffect } from '../../assets/save';
import { todayVietnamDate } from '../../lib/date';
import { GlassPanel } from './primitives';

export function CsvSection() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    if (!supabase || exporting) return;
    setExporting(true);
    setImportResult(null);
    try {
      const transactions = await listCloudTransactions(supabase);
      const csv = transactionsToCSV(transactions);
      const date = todayVietnamDate().replace(/-/g, '');
      downloadCSV(csv, `spendly-${date}.csv`);
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File) {
    if (!supabase || importing) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setImportResult('No valid rows found in CSV');
        return;
      }

      let imported = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          await saveTransactionWithAssetEffect({
            amount: row.amount,
            currency: 'VND',
            occurredAt: new Date(row.date).toISOString(),
            direction: row.direction,
            category: row.category as any,
            source: 'manual',
            note: row.note ?? row.merchant,
            operationId: crypto.randomUUID(),
          });
          imported++;
        } catch {
          failed++;
        }
      }
      setImportResult(`Imported ${imported} transactions${failed > 0 ? `, ${failed} failed` : ''}`);
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleImport(file);
    e.target.value = '';
  }

  return (
    <GlassPanel className="p-4">
      <h2 className="font-semibold text-white">Export / Import</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || importing}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-3 font-semibold text-slate-100 disabled:opacity-50"
        >
          <Download aria-hidden="true" className="h-5 w-5 text-sky-300" />
          {exporting ? '...' : 'Export CSV'}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={exporting || importing}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-3 font-semibold text-slate-100 disabled:opacity-50"
        >
          <Upload aria-hidden="true" className="h-5 w-5 text-emerald-300" />
          {importing ? '...' : 'Import CSV'}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileSelect}
        className="hidden"
      />
      {importResult && (
        <div className="mt-3 rounded-xl bg-sky-400/10 px-3 py-2 text-sm text-sky-200">
          {importResult}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        CSV format: date, amount, direction, category, merchant, note
      </p>
    </GlassPanel>
  );
}
