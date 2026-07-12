import { describe, expect, it } from 'vitest';
import {
  buildExternalHash,
  normalizeIngestPayload,
  parseVietnamDatetime,
} from '../../supabase/functions/_shared/ingest';

const MB_TRANSFER_INPUT = {
  bank: 'MB',
  type: 'transfer',
  amount: 10000,
  datetime: '2026-07-06 11:19:20',
  content: 'demo',
} as const;

const MB_CARD_INPUT = {
  bank: 'MB',
  type: 'card',
  amount: '-52,043',
  datetime: '2026-07-06 11:19:20',
  content: 'Grab* BWCFLJMBDWRJ-G-1',
} as const;

const ACB_BALANCE_INPUT = {
  bank: 'ACB',
  type: 'balance_alert',
  amount: '-10,000.00',
  datetime: '060726-14:47:32',
  content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
} as const;

const MB_CARD_AMOUNT_REGEX = /Giao dịch gần nhất\s*([+-]?[\d,]+)\s*VND/;
const MB_CARD_LAST_FOUR_REGEX = /Thông tin thẻ\s*[0-9*Xx. -]*([0-9]{4})[ \t]*(?=\r?\n|$)/;
const MB_ACCOUNT_IDENTIFIER_REGEX = /Tài khoản trích nợ\s*:?\s*(?:[^\r\n]*-\s*)?([0-9]{4,})\s*\(VND\)/;

describe('parseVietnamDatetime', () => {
  it('parses MB transfer datetime as Vietnam local time', () => {
    expect(parseVietnamDatetime('04-07-2026 21:48:49')).toBe('2026-07-04T14:48:49.000Z');
  });

  it('parses MB card datetime as Vietnam local time', () => {
    expect(parseVietnamDatetime('2026-07-06 11:19:20')).toBe('2026-07-06T04:19:20.000Z');
  });

  it('parses ACB embedded timestamp as Vietnam local time', () => {
    expect(parseVietnamDatetime('060726-14:47:32')).toBe('2026-07-06T07:47:32.000Z');
  });

  it('parses slash-separated day-first datetime as Vietnam local time', () => {
    expect(parseVietnamDatetime('06/07/2026 14:47:32')).toBe('2026-07-06T07:47:32.000Z');
  });

  it('rejects mixed day-first separators', () => {
    expect(parseVietnamDatetime('06/07-2026 14:47:32')).toBeNull();
    expect(parseVietnamDatetime('06-07/2026 14:47:32')).toBeNull();
  });

  it('rejects invalid calendar rollovers', () => {
    expect(parseVietnamDatetime('31-04-2026 10:00:00')).toBeNull();
    expect(parseVietnamDatetime('2026-02-29 10:00:00')).toBeNull();
  });
});

describe('documented Shortcut regexes', () => {
  it.each([
    ['Thông tin thẻ 356419....5248', '5248'],
    ['Thông tin thẻ 9704.05XX.XXXX.1234', '1234'],
    ['Thông tin thẻ **** 1234', '1234'],
    ['Thông tin thẻ 9704051234569876', '9876'],
  ])('extracts the final four digits from MB card mask %#', (input, expected) => {
    expect(MB_CARD_LAST_FOUR_REGEX.exec(input)?.[1]).toBe(expected);
  });

  it.each([
    'Thông tin thẻ **** 123',
    'Thông tin thẻ 9704.05XX.XXXX.123',
    'Thông tin thẻ 9704 05XX XXXX 123',
    'Thông tin thẻ XXXX.XXXX.1234X',
  ])('does not extract an earlier group from malformed MB card mask %#', (input) => {
    expect(MB_CARD_LAST_FOUR_REGEX.exec(input)).toBeNull();
  });

  it.each([
    ['Giao dịch gần nhất -52,043 VND', '-52,043'],
    ['Giao dịch gần nhất +81,000 VND', '+81,000'],
  ])('preserves the sign from MB card amount %#', (input, expected) => {
    expect(MB_CARD_AMOUNT_REGEX.exec(input)?.[1]).toBe(expected);
  });

  it.each([
    ['Tài khoản trích nợ: 00123456789 (VND)', '00123456789'],
    ['Tài khoản trích nợ\nHUYNH NGOC SON - 8920026789999 (VND)', '8920026789999'],
  ])('extracts the MB debit account identifier from %#', (input, expected) => {
    expect(MB_ACCOUNT_IDENTIFIER_REGEX.exec(input)?.[1]).toBe(expected);
  });
});

describe('normalizeIngestPayload', () => {
  it('accepts MB transfer payload', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: '297,000.00',
      datetime: '04-07-2026 21:48:49',
      content: '159287 1PEV8',
      raw_source: 'email',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(Number.isInteger(result.value.amount)).toBe(true);
    expect(result.value.direction).toBe('expense');
    expect(result.value).toMatchObject({
      bank: 'MB',
      type: 'transfer',
      amount: 297000,
      transaction_time: '2026-07-04T14:48:49.000Z',
      content: '159287 1PEV8',
      raw_source: 'email',
    });
  });

  it('normalizes a negative MB card charge as positive expense spending', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'card',
      amount: '-52,043',
      datetime: '2026-07-06 11:19:20',
      content: 'Grab* BWCFLJMBDWRJ-G-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({
      amount: 52043,
      direction: 'expense',
      category: 'transportation',
    });
  });

  it('infers income for MB card refunds with a positive signed amount', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'card',
      amount: '+81,000',
      datetime: '2026-07-10 11:31:02',
      content: 'Hoàn trả giao dịch tại Grab* A-9IMAW3WGW6RXAV',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({
      type: 'card',
      amount: 81000,
      transaction_time: '2026-07-10T04:31:02.000Z',
      direction: 'income',
      category: 'temporary-income',
    });
  });

  it('adds a category based on email content', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'card',
      amount: '-52,043',
      datetime: '2026-07-06 11:19:20',
      content: 'Grab* BWCFLJMBDWRJ-G-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.category).toBe('transportation');
  });

  it('classifies transfer memos that contain a category label', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: '88,000.00',
      datetime: '08-07-2026 12:59:46',
      content: 'HUYNH NGOC SON chuyen tien an uong',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.category).toBe('food-drinks');
  });

  it('accepts ACB dotted amount', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '-10,000.00',
      datetime: '060726-14:47:32',
      content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.amount).toBe(10000);
  });

  it('uses others for generic transfer memo content', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '-10,000.00',
      datetime: '060726-14:47:32',
      content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.category).toBe('others');
  });

  it('accepts ACB credit alerts as income when direction is supplied', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '+6,666.00',
      datetime: '080726-13:14:07',
      content: 'HUYNH NGOC SON CHUYEN TIEN GD 6189MSCBD2E4DZA8 080726-13:14:07',
      direction: 'income',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({
      amount: 6666,
      transaction_time: '2026-07-08T06:14:07.000Z',
      direction: 'income',
      category: 'temporary-income',
    });
  });

  it('infers income for ACB balance alerts with a positive signed amount', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '+6,666.00',
      datetime: '080726-13:14:07',
      content: 'HUYNH NGOC SON CHUYEN TIEN GD 6189MSCBD2E4DZA8 080726-13:14:07',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.direction).toBe('income');
    expect(result.value.category).toBe('temporary-income');
  });

  it('accepts ACB thousands-dot amount', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '10.000',
      datetime: '060726-14:47:32',
      content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.amount).toBe(10000);
  });

  it('accepts ACB thousands-dot decimal-comma amount', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '10.000,00',
      datetime: '060726-14:47:32',
      content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.amount).toBe(10000);
  });

  it('defaults raw_source to email when absent', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.raw_source).toBe('email');
  });

  it('defaults null raw_source to email', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
      raw_source: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.raw_source).toBe('email');
  });

  it('trims content in normalized value', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: '  demo content  ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.content).toBe('demo content');
  });

  it('keeps the legacy normalized shape when optional asset fields are omitted', () => {
    const result = normalizeIngestPayload(MB_TRANSFER_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual({
      bank: 'MB',
      type: 'transfer',
      amount: 10000,
      transaction_time: '2026-07-06T04:19:20.000Z',
      content: 'demo',
      category: 'others',
      direction: 'expense',
      raw_source: 'email',
    });
  });

  it('canonicalizes account identifiers for non-card transactions', () => {
    const result = normalizeIngestPayload({
      ...MB_TRANSFER_INPUT,
      account_identifier: '  ab-0012.cd  ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.account_identifier).toBe('AB0012CD');
  });

  it.each([
    ['9704.05XX.XXXX.1234', '1234'],
    ['  **** 1234  ', '1234'],
    ['9704051234569876', '9876'],
    ['1234', '1234'],
  ])('canonicalizes card identifier %# to its last four decimal digits', (cardIdentifier, expected) => {
    const result = normalizeIngestPayload({
      ...MB_CARD_INPUT,
      card_identifier: cardIdentifier,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.card_identifier).toBe(expected);
  });

  it.each([
    { label: 'blank account identifier', input: { ...MB_TRANSFER_INPUT, account_identifier: '  ' }, error: 'invalid_account_identifier' },
    { label: 'mask-only account identifier', input: { ...MB_TRANSFER_INPUT, account_identifier: '*** ... ---' }, error: 'invalid_account_identifier' },
    { label: 'non-string account identifier', input: { ...MB_TRANSFER_INPUT, account_identifier: 1234 }, error: 'invalid_account_identifier' },
    { label: 'mask-only card identifier', input: { ...MB_CARD_INPUT, card_identifier: '****' }, error: 'invalid_card_identifier' },
    { label: 'three-digit card identifier', input: { ...MB_CARD_INPUT, card_identifier: '123' }, error: 'invalid_card_identifier' },
    { label: 'card mask with three digits', input: { ...MB_CARD_INPUT, card_identifier: '**** 123' }, error: 'invalid_card_identifier' },
    { label: 'non-string card identifier', input: { ...MB_CARD_INPUT, card_identifier: null }, error: 'invalid_card_identifier' },
  ])('rejects an explicitly supplied $label', ({ input, error }) => {
    expect(normalizeIngestPayload(input)).toEqual({ ok: false, error });
  });

  it('rejects account identifiers for card transactions', () => {
    expect(normalizeIngestPayload({
      ...MB_CARD_INPUT,
      account_identifier: '00123456789',
    })).toEqual({ ok: false, error: 'invalid_account_identifier' });
  });

  it('rejects card identifiers for non-card transactions', () => {
    expect(normalizeIngestPayload({
      ...MB_TRANSFER_INPUT,
      card_identifier: '1234',
    })).toEqual({ ok: false, error: 'invalid_card_identifier' });
  });

  it.each([
    ['17,016,222.00', 17016222],
    [17016222, 17016222],
    [0, 0],
    ['0.00', 0],
    ['2,147,483,647.00', 2147483647],
    [3000000000, 3000000000],
    ['3,000,000,000.00', 3000000000],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ['9,007,199,254,740,991.00', Number.MAX_SAFE_INTEGER],
  ])('normalizes allowed balance_vnd value %#', (balanceVnd, expected) => {
    const result = normalizeIngestPayload({
      ...ACB_BALANCE_INPUT,
      account_identifier: '  00123456789  ',
      balance_vnd: balanceVnd,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({
      account_identifier: '00123456789',
      balance_vnd: expected,
    });
  });

  it.each([
    [-1],
    ['-1,000.00'],
    [1.5],
    ['1,000.50'],
    [Number.POSITIVE_INFINITY],
    [Number.NaN],
    [Number.MAX_SAFE_INTEGER + 1],
    ['9,007,199,254,740,992.00'],
  ])('rejects invalid balance_vnd value %#', (balanceVnd) => {
    expect(normalizeIngestPayload({
      ...ACB_BALANCE_INPUT,
      account_identifier: '00123456789',
      balance_vnd: balanceVnd,
    })).toEqual({ ok: false, error: 'invalid_balance_vnd' });
  });

  it('rejects balance_vnd without a valid account identifier', () => {
    expect(normalizeIngestPayload({
      ...ACB_BALANCE_INPUT,
      balance_vnd: '17,016,222.00',
    })).toEqual({ ok: false, error: 'invalid_balance_vnd' });

    expect(normalizeIngestPayload({
      ...ACB_BALANCE_INPUT,
      account_identifier: '****',
      balance_vnd: '17,016,222.00',
    })).toEqual({ ok: false, error: 'invalid_account_identifier' });
  });

  it('allows balance_vnd only for ACB balance alerts', () => {
    expect(normalizeIngestPayload({
      ...MB_TRANSFER_INPUT,
      account_identifier: '00123456789',
      balance_vnd: 10000,
    })).toEqual({ ok: false, error: 'invalid_balance_vnd' });

    expect(normalizeIngestPayload({
      ...ACB_BALANCE_INPUT,
      type: 'transfer',
      account_identifier: '00123456789',
      balance_vnd: 10000,
    })).toEqual({ ok: false, error: 'invalid_balance_vnd' });
  });

  it('rejects non-object payload', () => {
    expect(normalizeIngestPayload(null)).toEqual({ ok: false, error: 'invalid_json' });
  });

  it('rejects invalid bank', () => {
    const result = normalizeIngestPayload({
      bank: 'VCB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_bank' });
  });

  it('rejects invalid type', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'deposit',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_type' });
  });

  it('rejects invalid amount', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 'free',
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('rejects non-zero decimal comma amount', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '10.000,50',
      datetime: '060726-14:47:32',
      content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('rejects non-zero decimal dot amount', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: '10,000.50',
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('rejects numeric fractional amount', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 10000.5,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('accepts Postgres int4 max amount', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 2147483647,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.amount).toBe(2147483647);
  });

  it('rejects amount above Postgres int4 max', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 2147483648,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('rejects unsafe integer string amount', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: '9007199254740993',
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('rejects invalid datetime', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-13-06 11:19:20',
      content: 'demo',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_datetime' });
  });

  it('rejects blank content', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: '   ',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_content' });
  });

  it('rejects invalid raw_source', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 10000,
      datetime: '2026-07-06 11:19:20',
      content: 'demo',
      raw_source: 'sms',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_raw_source' });
  });

  it('rejects invalid direction', () => {
    const result = normalizeIngestPayload({
      bank: 'ACB',
      type: 'balance_alert',
      amount: '+6,666.00',
      datetime: '080726-13:14:07',
      content: 'HUYNH NGOC SON CHUYEN TIEN GD 6189MSCBD2E4DZA8 080726-13:14:07',
      direction: 'credit',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_direction' });
  });
});

describe('buildExternalHash', () => {
  it('is stable for equivalent normalized payloads', async () => {
    const one = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: '297,000.00',
      datetime: '04-07-2026 21:48:49',
      content: '159287 1PEV8',
    });
    const two = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 297000,
      datetime: '2026-07-04 21:48:49',
      content: ' 159287 1PEV8 ',
    });

    expect(one.ok).toBe(true);
    expect(two.ok).toBe(true);
    if (!one.ok || !two.ok) throw new Error('normalization failed');

    await expect(buildExternalHash(one.value)).resolves.toBe(await buildExternalHash(two.value));
  });

  it('matches the pinned historical digest for a legacy payload', async () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: '297,000.00',
      datetime: '04-07-2026 21:48:49',
      content: '159287 1PEV8',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    await expect(buildExternalHash(result.value)).resolves.toBe(
      '48aee9b90be1473f284b6ea668b64ad2e914cc481fb73c96b93f96672779090b',
    );
  });

  it('excludes optional asset fields so legacy and enriched retries dedupe identically', async () => {
    const legacyAccount = normalizeIngestPayload(ACB_BALANCE_INPUT);
    const enrichedAccount = normalizeIngestPayload({
      ...ACB_BALANCE_INPUT,
      account_identifier: '00123456789',
      balance_vnd: '17,016,222.00',
    });
    const legacyCard = normalizeIngestPayload(MB_CARD_INPUT);
    const enrichedCard = normalizeIngestPayload({
      ...MB_CARD_INPUT,
      card_identifier: '1234',
    });

    expect(legacyAccount.ok).toBe(true);
    expect(enrichedAccount.ok).toBe(true);
    expect(legacyCard.ok).toBe(true);
    expect(enrichedCard.ok).toBe(true);
    if (!legacyAccount.ok || !enrichedAccount.ok || !legacyCard.ok || !enrichedCard.ok) {
      throw new Error('normalization failed');
    }

    await expect(buildExternalHash(enrichedAccount.value)).resolves.toBe(
      await buildExternalHash(legacyAccount.value),
    );
    await expect(buildExternalHash(enrichedCard.value)).resolves.toBe(
      await buildExternalHash(legacyCard.value),
    );
  });

  it('returns a lowercase SHA-256 hex string', async () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 297000,
      datetime: '2026-07-04 21:48:49',
      content: '159287 1PEV8',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);

    await expect(buildExternalHash(result.value)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a stable field changes', async () => {
    const one = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 297000,
      datetime: '2026-07-04 21:48:49',
      content: '159287 1PEV8',
    });
    const two = normalizeIngestPayload({
      bank: 'MB',
      type: 'transfer',
      amount: 297001,
      datetime: '2026-07-04 21:48:49',
      content: '159287 1PEV8',
    });

    expect(one.ok).toBe(true);
    expect(two.ok).toBe(true);
    if (!one.ok || !two.ok) throw new Error('normalization failed');

    await expect(buildExternalHash(one.value)).resolves.not.toBe(await buildExternalHash(two.value));
  });
});
