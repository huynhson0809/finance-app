import type { Extracted } from './types';

const VND_NUMBER_RE = /([0-9][0-9.,]*)\s*(?:VND|đ|d|đồng|dong)/gi;
const DATE_RE = /(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/;
const TIME_RE = /(\d{2}):(\d{2})/;
const TIME_ONLY_LINE_RE = /^\s*\d{1,2}:\d{2}\s*$/;
const ALL_CAPS_LATIN_NAME_RE = /^[A-Z][A-Z\s]{3,}$/;

const GENERIC_HEADER_RES = [
  /chuyen\s*tien\s*thanh\s*cong/i,
  /giao\s*dich\s*thanh\s*cong/i,
  /thanh\s*toan\s*thanh\s*cong/i,
  /transfer\s+successful/i,
  /transaction\s+successful/i,
  /payment\s+successful/i,
];

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function parseAmount(raw: string): number | undefined {
  const digits = raw.replace(/[.,\s]/g, '');
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function isGenericHeader(line: string): boolean {
  const stripped = stripDiacritics(line);
  return GENERIC_HEADER_RES.some(re => re.test(stripped));
}

function isStatusBarTime(line: string): boolean {
  return TIME_ONLY_LINE_RE.test(line);
}

function pickMerchant(lines: string[]): string | undefined {
  // First pass: prefer the first ALL-CAPS Latin line (typical VN recipient name).
  for (const line of lines) {
    const ascii = stripDiacritics(line);
    if (ALL_CAPS_LATIN_NAME_RE.test(ascii) && line.length <= 60) return line;
  }
  // Second pass: first line that isn't a status-bar time or a generic transaction header.
  for (const line of lines) {
    if (isStatusBarTime(line)) continue;
    if (isGenericHeader(line)) continue;
    return line;
  }
  return undefined;
}

function pickDate(text: string): string | undefined {
  for (const line of text.split('\n')) {
    const dMatch = line.match(DATE_RE);
    if (!dMatch) continue;
    const [, d, mo, y] = dMatch;
    const tMatch = line.match(TIME_RE);
    const hh = tMatch ? Number.parseInt(tMatch[1], 10) : 0;
    const mm = tMatch ? Number.parseInt(tMatch[2], 10) : 0;
    const date = new Date(Number(y), Number(mo) - 1, Number(d), hh, mm);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

export function extractReceipt(text: string): Partial<Extracted> {
  const out: Partial<Extracted> = {};

  let max = 0;
  for (const m of text.matchAll(VND_NUMBER_RE)) {
    const n = parseAmount(m[1]);
    if (n != null && n > max) max = n;
  }
  if (max > 0) out.amount = max;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const merchant = pickMerchant(lines);
  if (merchant) out.merchant = merchant;

  const date = pickDate(text);
  if (date) out.occurredAt = date;

  return out;
}
