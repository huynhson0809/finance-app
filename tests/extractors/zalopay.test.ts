import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractZaloPay } from '../../src/extractors/zalopay';

const FIXTURE = readFileSync(
  join(__dirname, '../fixtures/ocr/zalopay/sample-1.txt'),
  'utf8',
);

describe('extractZaloPay', () => {
  it('extracts amount', () => {
    expect(extractZaloPay(FIXTURE).amount).toBe(100000);
  });
  it('extracts occurredAt (slash- or dot-separated)', () => {
    expect(extractZaloPay(FIXTURE).occurredAt).toBe(
      new Date(2026, 5, 25, 11, 0).toISOString(),
    );
  });
  it('merchant is undefined when no obvious label', () => {
    expect(extractZaloPay(FIXTURE).merchant).toBeUndefined();
  });
  it('returns empty object for unrelated text', () => {
    expect(extractZaloPay('Hello world')).toEqual({});
  });
  it('extracts merchant with diacritic label', () => {
    const textWithDiacriticMerchant = `ZaloPay
Nap tien thanh cong
+50.000d
Vao vi
Đến: Highlands Coffee
Thoi gian: 25.06.2026 11:00
ZP`;
    expect(extractZaloPay(textWithDiacriticMerchant).merchant).toBe('Highlands Coffee');
  });
});
