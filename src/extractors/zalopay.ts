import type { Extracted } from './types';

const AMOUNT_RE = /[+-]?\s*([0-9.]+)\s*(?:VND|đ|d)/i;
const MERCHANT_RE = /(?:Den|Cho|Nguoi nhan)\s*:?\s*(.+)/i;
const DATE_RE = /(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})(?:\s+(\d{2}):(\d{2}))?/;

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function parseAmount(raw: string): number | undefined {
  const digits = raw.replace(/[.\s]/g, '');
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function extractZaloPay(text: string): Partial<Extracted> {
  const out: Partial<Extracted> = {};

  const amountMatch = text.match(AMOUNT_RE);
  if (amountMatch) {
    const parsed = parseAmount(amountMatch[1]);
    if (parsed != null) out.amount = parsed;
  }

  const merchantMatch = stripDiacritics(text).match(MERCHANT_RE);
  if (merchantMatch) out.merchant = merchantMatch[1].trim();

  const dateMatch = text.match(DATE_RE);
  if (dateMatch) {
    const [, d, m, y, hh = '0', mm = '0'] = dateMatch;
    const date = new Date(+y, +m - 1, +d, +hh, +mm);
    if (!Number.isNaN(date.getTime())) out.occurredAt = date.toISOString();
  }

  return out;
}
