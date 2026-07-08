import { describe, expect, it } from 'vitest';
import {
  buildExternalHash,
  normalizeIngestPayload,
  parseVietnamDatetime,
} from '../../supabase/functions/_shared/ingest';

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

  it('accepts negative MB card amount as positive spending', () => {
    const result = normalizeIngestPayload({
      bank: 'MB',
      type: 'card',
      amount: '-52,043',
      datetime: '2026-07-06 11:19:20',
      content: 'Grab* BWCFLJMBDWRJ-G-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.amount).toBe(52043);
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
