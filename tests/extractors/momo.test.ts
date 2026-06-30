import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractMomo } from '../../src/extractors/momo';

const FIXTURE = readFileSync(
  join(__dirname, '../fixtures/ocr/momo/sample-1.txt'),
  'utf8',
);

describe('extractMomo', () => {
  it('extracts amount', () => {
    expect(extractMomo(FIXTURE).amount).toBe(75000);
  });
  it('extracts merchant from "Cho" line', () => {
    expect(extractMomo(FIXTURE).merchant).toBe('Phuc Long Tan Binh');
  });
  it('extracts occurredAt', () => {
    expect(extractMomo(FIXTURE).occurredAt).toBe(
      new Date(2026, 5, 22, 18, 45).toISOString(),
    );
  });
  it('returns empty object for unrelated text', () => {
    expect(extractMomo('Hello world')).toEqual({});
  });
  it('extracts merchant with diacritics', () => {
    const textWithDiacritics = `Vi MoMo
Thanh toan
-75.000d
Cho: Phúc Long Tân Bình
Thoi gian: 22/06/2026 18:45`;
    expect(extractMomo(textWithDiacritics).merchant).toBe('Phuc Long Tan Binh');
  });
});
