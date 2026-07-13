import type { Transaction } from '../types';

const CSV_HEADERS = [
  'date',
  'amount',
  'direction',
  'category',
  'merchant',
  'note',
  'source',
  'bank',
] as const;

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(' ', 'T');
}

export function transactionsToCSV(transactions: Transaction[]): string {
  const rows = [CSV_HEADERS.join(',')];

  for (const tx of transactions) {
    const row = [
      formatDate(tx.occurredAt),
      String(tx.amount),
      tx.direction,
      tx.category,
      escapeCSV(tx.merchant ?? ''),
      escapeCSV(tx.note ?? ''),
      tx.source,
      tx.bank ?? tx.bankHint ?? '',
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export interface CSVImportRow {
  date: string;
  amount: number;
  direction: 'expense' | 'income';
  category: string;
  merchant?: string;
  note?: string;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields;
}

export function parseCSV(text: string): CSVImportRow[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const amountIdx = header.indexOf('amount');
  const directionIdx = header.indexOf('direction');
  const categoryIdx = header.indexOf('category');
  const merchantIdx = header.indexOf('merchant');
  const noteIdx = header.indexOf('note');

  if (dateIdx < 0 || amountIdx < 0 || directionIdx < 0 || categoryIdx < 0) {
    throw new Error('CSV must have columns: date, amount, direction, category');
  }

  const rows: CSVImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const amount = Number(fields[amountIdx]);
    const direction = fields[directionIdx]?.trim();
    if (!amount || amount <= 0) continue;
    if (direction !== 'expense' && direction !== 'income') continue;

    rows.push({
      date: fields[dateIdx]?.trim(),
      amount: Math.round(amount),
      direction,
      category: fields[categoryIdx]?.trim() || 'others',
      merchant: merchantIdx >= 0 ? fields[merchantIdx]?.trim() || undefined : undefined,
      note: noteIdx >= 0 ? fields[noteIdx]?.trim() || undefined : undefined,
    });
  }

  return rows;
}
