import type { Extracted } from './types';

const VND_NUMBER_RE = /([0-9][0-9.,]*)\s*(?:VND|đ|d|đồng|dong)/gi;
const DATE_RE = /(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})(?:\s+(\d{2}):(\d{2}))?/;

function parseAmount(raw: string): number | undefined {
  const digits = raw.replace(/[.,\s]/g, '');
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function extractReceipt(text: string): Partial<Extracted> {
  const out: Partial<Extracted> = {};

  // amount: pick the largest VND-formatted number on the page
  let max = 0;
  for (const m of text.matchAll(VND_NUMBER_RE)) {
    const n = parseAmount(m[1]);
    if (n != null && n > max) max = n;
  }
  if (max > 0) out.amount = max;

  // merchant: first non-empty line, trimmed
  const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 0);
  if (firstLine) out.merchant = firstLine;

  // date
  const dateMatch = text.match(DATE_RE);
  if (dateMatch) {
    const [, d, m, y, hh = '0', mm = '0'] = dateMatch;
    const date = new Date(+y, +m - 1, +d, +hh, +mm);
    if (!Number.isNaN(date.getTime())) out.occurredAt = date.toISOString();
  }

  return out;
}
