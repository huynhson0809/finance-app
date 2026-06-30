import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractReceipt } from '../../src/extractors/receipt';

const FIXTURE = readFileSync(
  join(__dirname, '../fixtures/ocr/receipt/sample-1.txt'),
  'utf8',
);

const MBBANK_FIXTURE = readFileSync(
  join(__dirname, '../fixtures/ocr/receipt/mbbank-transfer.txt'),
  'utf8',
);

describe('extractReceipt', () => {
  it('extracts amount from the largest VND-formatted total', () => {
    expect(extractReceipt(FIXTURE).amount).toBe(37000);
  });
  it('extracts merchant from the first non-empty line', () => {
    expect(extractReceipt(FIXTURE).merchant).toBe('Co.opmart Quan 5');
  });
  it('extracts occurredAt at local midnight when only date is present', () => {
    expect(extractReceipt(FIXTURE).occurredAt).toBe(
      new Date(2026, 5, 15, 0, 0).toISOString(),
    );
  });
  it('returns empty object for blank input', () => {
    expect(extractReceipt('')).toEqual({});
  });
});

describe('extractReceipt (MBBank screenshot via receipt fallback)', () => {
  it('extracts amount 157000', () => {
    expect(extractReceipt(MBBANK_FIXTURE).amount).toBe(157000);
  });

  it('picks the ALL-CAPS recipient name as merchant, not status bar or header', () => {
    expect(extractReceipt(MBBANK_FIXTURE).merchant).toBe('NGUYEN MINH TUAN');
  });

  it('captures both date and time even when time precedes date on the line', () => {
    expect(extractReceipt(MBBANK_FIXTURE).occurredAt).toBe(
      new Date(2026, 5, 16, 13, 24).toISOString(),
    );
  });
});

describe('extractReceipt merchant heuristics', () => {
  it('skips status-bar time lines', () => {
    const text = '13:24\nReal Merchant\n100.000 d';
    expect(extractReceipt(text).merchant).toBe('Real Merchant');
  });

  it('skips generic transaction headers (Vietnamese)', () => {
    const text = 'Chuyển tiền thành công\nMy Shop\n50.000 d';
    expect(extractReceipt(text).merchant).toBe('My Shop');
  });

  it('skips generic transaction headers (English)', () => {
    const text = 'Transfer Successful\nMy Shop\n50.000 d';
    expect(extractReceipt(text).merchant).toBe('My Shop');
  });
});
