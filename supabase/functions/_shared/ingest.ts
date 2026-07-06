export type Bank = 'MB' | 'ACB';
export type TransactionKind = 'transfer' | 'card' | 'balance_alert';

export interface NormalizedIngestPayload {
  bank: Bank;
  type: TransactionKind;
  amount: number;
  transaction_time: string;
  content: string;
  raw_source: 'email';
}

export type NormalizeError =
  | 'invalid_json'
  | 'invalid_bank'
  | 'invalid_type'
  | 'invalid_amount'
  | 'invalid_datetime'
  | 'invalid_content'
  | 'invalid_raw_source';

export type NormalizeResult =
  | { ok: true; value: NormalizedIngestPayload }
  | { ok: false; error: NormalizeError };

type InputRecord = Record<string, unknown>;

const BANKS = new Set<Bank>(['MB', 'ACB']);
const TRANSACTION_KINDS = new Set<TransactionKind>(['transfer', 'card', 'balance_alert']);
const POSTGRES_INT4_MAX = 2147483647;
const POSTGRES_INT4_MAX_TEXT = String(POSTGRES_INT4_MAX);
const VIETNAM_UTC_OFFSET_HOURS = 7;

export function parseVietnamDatetime(input: string): string | null {
  const trimmed = input.trim();
  const parsed = parseDatetimeParts(trimmed);
  if (!parsed) return null;

  const { year, month, day, hour, minute, second } = parsed;
  if (!isValidLocalDatetime(year, month, day, hour, minute, second)) return null;

  return new Date(
    Date.UTC(year, month - 1, day, hour - VIETNAM_UTC_OFFSET_HOURS, minute, second),
  ).toISOString();
}

export function normalizeIngestPayload(input: unknown): NormalizeResult {
  if (!isInputRecord(input)) return { ok: false, error: 'invalid_json' };

  if (!BANKS.has(input.bank as Bank)) return { ok: false, error: 'invalid_bank' };
  if (!TRANSACTION_KINDS.has(input.type as TransactionKind)) {
    return { ok: false, error: 'invalid_type' };
  }

  const amount = normalizeAmount(input.amount);
  if (amount === null) return { ok: false, error: 'invalid_amount' };

  if (typeof input.datetime !== 'string') return { ok: false, error: 'invalid_datetime' };
  const transactionTime = parseVietnamDatetime(input.datetime);
  if (!transactionTime) return { ok: false, error: 'invalid_datetime' };

  if (typeof input.content !== 'string' || input.content.trim() === '') {
    return { ok: false, error: 'invalid_content' };
  }

  if (input.raw_source !== undefined && input.raw_source !== null && input.raw_source !== 'email') {
    return { ok: false, error: 'invalid_raw_source' };
  }

  return {
    ok: true,
    value: {
      bank: input.bank as Bank,
      type: input.type as TransactionKind,
      amount,
      transaction_time: transactionTime,
      content: input.content.trim(),
      raw_source: 'email',
    },
  };
}

export async function buildExternalHash(payload: NormalizedIngestPayload): Promise<string> {
  const stableContent = payload.content.trim().replace(/\s+/g, ' ');
  const hashInput = [
    payload.bank,
    payload.type,
    String(payload.amount),
    payload.transaction_time,
    stableContent,
  ].join('\n');

  const data = new TextEncoder().encode(hashInput);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isInputRecord(input: unknown): input is InputRecord {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function parseDatetimeParts(input: string):
  | { year: number; month: number; day: number; hour: number; minute: number; second: number }
  | null {
  const isoLike = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(input);
  if (isoLike) {
    return toParts(isoLike[1], isoLike[2], isoLike[3], isoLike[4], isoLike[5], isoLike[6]);
  }

  const dayFirst = /^(\d{2})([-/])(\d{2})\2(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(input);
  if (dayFirst) {
    return toParts(dayFirst[4], dayFirst[3], dayFirst[1], dayFirst[5], dayFirst[6], dayFirst[7]);
  }

  const acbEmbedded = /^(\d{2})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})$/.exec(input);
  if (acbEmbedded) {
    return toParts(`20${acbEmbedded[3]}`, acbEmbedded[2], acbEmbedded[1], acbEmbedded[4], acbEmbedded[5], acbEmbedded[6]);
  }

  return null;
}

function toParts(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second: string,
) {
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

function isValidLocalDatetime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return false;
  }

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (day < 1 || hour < 0 || minute < 0 || second < 0) return false;

  const localDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return (
    localDate.getUTCFullYear() === year &&
    localDate.getUTCMonth() === month - 1 &&
    localDate.getUTCDate() === day &&
    localDate.getUTCHours() === hour &&
    localDate.getUTCMinutes() === minute &&
    localDate.getUTCSeconds() === second
  );
}

function normalizeAmount(input: unknown): number | null {
  if (typeof input === 'number') {
    return positiveBoundedIntegerAmount(input);
  }

  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (trimmed === '') return null;

  const normalized = normalizeAmountString(trimmed);
  if (normalized === null) return null;

  return positiveBoundedIntegerString(normalized);
}

function normalizeAmountString(input: string): string | null {
  const compact = input.replace(/\s+/g, '');
  if (!/^[+-]?\d[\d,.]*$/.test(compact)) return null;

  const unsigned = compact.replace(/^[+-]/, '');
  const sign = compact.startsWith('-') ? '-' : '';
  const commaIndex = unsigned.lastIndexOf(',');
  const dotIndex = unsigned.lastIndexOf('.');

  if (commaIndex !== -1 && dotIndex !== -1) {
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    return normalizeWithDecimalSeparator(unsigned, sign, decimalSeparator, thousandsSeparator);
  }

  if (commaIndex !== -1) return normalizeSingleSeparator(unsigned, sign, ',');
  if (dotIndex !== -1) return normalizeSingleSeparator(unsigned, sign, '.');

  return `${sign}${unsigned}`;
}

function normalizeWithDecimalSeparator(
  unsigned: string,
  sign: string,
  decimalSeparator: ',' | '.',
  thousandsSeparator: ',' | '.',
): string | null {
  const [whole, decimal, ...extra] = unsigned.split(decimalSeparator);
  if (extra.length > 0 || decimal === undefined || decimal.length !== 2) return null;
  if (!isValidThousands(whole, thousandsSeparator)) return null;
  if (!isZeroDecimal(decimal)) return null;

  return `${sign}${whole.replaceAll(thousandsSeparator, '')}`;
}

function normalizeSingleSeparator(unsigned: string, sign: string, separator: ',' | '.'): string | null {
  const parts = unsigned.split(separator);
  if (parts.some((part) => part === '')) return null;

  const lastPart = parts.at(-1);
  if (!lastPart) return null;

  if (parts.length > 1 && parts.slice(1).every((part) => part.length === 3)) {
    if (parts[0].length < 1 || parts[0].length > 3) return null;
    return `${sign}${parts.join('')}`;
  }

  if (parts.length === 2 && lastPart.length === 2) {
    if (!isZeroDecimal(lastPart)) return null;
    return `${sign}${parts[0]}`;
  }

  return null;
}

function isZeroDecimal(value: string): boolean {
  return /^0+$/.test(value);
}

function isValidThousands(value: string, separator: ',' | '.'): boolean {
  const parts = value.split(separator);
  if (parts.some((part) => part === '')) return false;
  if (parts.length === 1) return /^\d+$/.test(value);
  if (parts[0].length < 1 || parts[0].length > 3) return false;

  return parts.slice(1).every((part) => /^\d{3}$/.test(part));
}

function positiveBoundedIntegerString(input: string): number | null {
  const unsigned = input.replace(/^[+-]/, '');
  const canonical = unsigned.replace(/^0+/, '') || '0';
  if (canonical === '0') return null;
  if (canonical.length > POSTGRES_INT4_MAX_TEXT.length) return null;
  if (canonical.length === POSTGRES_INT4_MAX_TEXT.length && canonical > POSTGRES_INT4_MAX_TEXT) {
    return null;
  }

  return Number(canonical);
}

function positiveBoundedIntegerAmount(input: number): number | null {
  const amount = Math.abs(input);
  if (amount <= 0 || !Number.isSafeInteger(amount) || amount > POSTGRES_INT4_MAX) return null;

  return amount;
}
